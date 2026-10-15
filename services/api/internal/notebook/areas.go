package notebook

import (
	"context"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

var areaIDPattern = regexp.MustCompile(contract.Data.Notebook.AreaIDPattern)

// AreaRule is NotebookAreaSchema as a request rule.
func AreaRule(s string) string {
	if utf8.RuneCountInString(s) > contract.Data.Notebook.AreaIDMaxLength {
		return api.CodeTooBig
	}
	if !areaIDPattern.MatchString(s) {
		return api.CodeInvalidFormat
	}
	return ""
}

// readArea is NotebookAreaSchema on a stored row.
func readArea(r *store.ItemReader, key string) string {
	s := r.Str(key, 0)
	if AreaRule(s) != "" {
		r.Fail(key, "not an area id")
	}
	return s
}

// Areas is NotebookAreasSchema: the user's areas in switch order.
type Areas struct {
	Areas     []contract.AreaEntry `json:"areas"`
	Version   int                  `json:"version"`
	UpdatedAt *string              `json:"updatedAt"`
}

func defaultAreas() Areas {
	return Areas{Areas: slices.Clone(contract.Data.Notebook.DefaultAreas)}
}

func (a Areas) IDs() []string {
	ids := make([]string, len(a.Areas))
	for i, e := range a.Areas {
		ids[i] = e.ID
	}
	return ids
}

func (a Areas) Has(id string) bool { return slices.Contains(a.IDs(), id) }

// Name is the area's name; an id no longer listed shows as itself.
func (a Areas) Name(id string) string {
	for _, e := range a.Areas {
		if e.ID == id {
			return e.Name
		}
	}
	return id
}

type storedAreas struct {
	Areas
	createdAt string
}

// areasRepo keeps one row per user; no row is the default list at version 0.
type areasRepo struct {
	table *data.Table
	now   func() time.Time
}

func areasKey(userID string) data.Item {
	return data.Key(keys.NotebookAreasPk(userID), keys.NotebookAreasSk())
}

func parseAreas(item data.Item) (storedAreas, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "notebookAreas")
	r.Str("userId", 1)
	var a storedAreas
	for _, e := range r.MapList("areas") {
		a.Areas.Areas = append(a.Areas.Areas, contract.AreaEntry{ID: readArea(e, "id"), Name: e.Str("name", 1)})
	}
	if len(a.Areas.Areas) == 0 {
		r.Fail("areas", "empty")
	}
	a.Version = r.NonNegativeInt("version")
	r.OptPositiveInt("version")
	a.createdAt = r.Str("createdAt", 1)
	updated := r.Str("updatedAt", 1)
	a.UpdatedAt = &updated
	return a, r.Err("notebook areas")
}

// notebookAreasItem is buildNotebookAreasItem.
func notebookAreasItem(userID string, a storedAreas) data.Item {
	list := make([]types.AttributeValue, len(a.Areas.Areas))
	for i, e := range a.Areas.Areas {
		list[i] = data.M(data.Item{"id": data.S(e.ID), "name": data.S(e.Name)})
	}
	item := areasKey(userID)
	item["entityType"] = data.S("notebookAreas")
	item["userId"] = data.S(userID)
	item["areas"] = &types.AttributeValueMemberL{Value: list}
	item["version"] = data.N(int64(a.Version))
	item["createdAt"] = data.S(a.createdAt)
	item["updatedAt"] = data.S(*a.UpdatedAt)
	return item
}

func (r *areasRepo) stored(ctx context.Context, userID string) (*storedAreas, error) {
	res, err := r.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.table.Name), Key: areasKey(userID), ConsistentRead: aws.Bool(true),
	})
	if err != nil || res.Item == nil {
		return nil, err
	}
	a, err := parseAreas(res.Item)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *areasRepo) get(ctx context.Context, userID string) (Areas, error) {
	a, err := r.stored(ctx, userID)
	if err != nil || a == nil {
		return defaultAreas(), err
	}
	return a.Areas, nil
}

// require is the list, or a 400 when area isn't on it: rows only go into
// the user's own areas.
func (r *areasRepo) require(ctx context.Context, userID, area string) (Areas, error) {
	a, err := r.get(ctx, userID)
	if err == nil && !a.Has(area) {
		err = api.BadRequest("area must be one of your areas", map[string]string{"area": "not_found"})
	}
	return a, err
}

func (r *areasRepo) conflict(ctx context.Context, userID string, expected int) error {
	current, err := r.get(ctx, userID)
	if err != nil {
		return err
	}
	return store.VersionConflict(expected, &current.Version, current)
}

// inUse is whether the area holds a live note or task.
func (r *areasRepo) inUse(ctx context.Context, userID, area string) (bool, error) {
	pks := []string{keys.NotebookAreaGSI1Pk(userID, area)}
	for _, s := range TaskStatuses {
		pks = append(pks, keys.TaskAreaStatusGSI1Pk(userID, area, s))
	}
	for _, pk := range pks {
		res, err := r.table.DB.Query(ctx, &dynamodb.QueryInput{
			TableName:                 aws.String(r.table.Name),
			IndexName:                 aws.String(keys.GSI1),
			KeyConditionExpression:    aws.String("gsi1pk = :pk"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
			Limit:                     aws.Int32(1),
		})
		if err != nil {
			return false, err
		}
		if len(res.Items) > 0 {
			return true, nil
		}
	}
	return false, nil
}

// write saves the list. A removed area must be empty; its daily template
// goes with it, so an area added later under the same id starts blank.
func (r *areasRepo) write(ctx context.Context, userID string, list []contract.AreaEntry, expected api.Expected) (Areas, error) {
	existing, err := r.stored(ctx, userID)
	if err != nil {
		return Areas{}, err
	}
	current := defaultAreas()
	if existing != nil {
		current = existing.Areas
	}
	base := expected.Of(current.Version)
	if current.Version != base {
		return Areas{}, r.conflict(ctx, userID, base)
	}
	next := Areas{Areas: list}
	var removed []string
	for _, id := range current.IDs() {
		if !next.Has(id) {
			removed = append(removed, id)
		}
	}
	for _, id := range removed {
		used, err := r.inUse(ctx, userID, id)
		if err != nil {
			return Areas{}, err
		}
		if used {
			return Areas{}, &api.ConflictError{
				Message: current.Name(id) + " still has notes or tasks. Move or delete them before removing it.",
				Code:    api.CodeConflict,
			}
		}
	}
	now := jstime.ISO(r.now())
	saved := storedAreas{Areas: Areas{Areas: list, Version: base + 1, UpdatedAt: &now}, createdAt: now}
	if existing != nil {
		saved.createdAt = existing.createdAt
	}
	put := &types.Put{TableName: aws.String(r.table.Name), Item: notebookAreasItem(userID, saved)}
	if base == 0 {
		put.ConditionExpression = aws.String("attribute_not_exists(pk)")
	} else {
		put.ConditionExpression = aws.String("attribute_exists(pk) AND version = :v")
		put.ExpressionAttributeValues = map[string]types.AttributeValue{":v": data.N(int64(base))}
	}
	if len(removed) == 0 {
		_, err = r.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: put.TableName, Item: put.Item,
			ConditionExpression: put.ConditionExpression, ExpressionAttributeValues: put.ExpressionAttributeValues,
		})
	} else {
		items := []types.TransactWriteItem{{Put: put}}
		for _, id := range removed {
			items = append(items, types.TransactWriteItem{Delete: &types.Delete{TableName: aws.String(r.table.Name), Key: templateKey(userID, id)}})
		}
		_, err = r.table.DB.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: items})
	}
	if err != nil {
		if data.ClassifyWriteError(err) == data.WriteConflict {
			return Areas{}, r.conflict(ctx, userID, base)
		}
		return Areas{}, err
	}
	return saved.Areas, nil
}

// readAreaList reads UpdateNotebookAreasRequestSchema's areas; the
// repeat checks are its refinement, which runs once the rest is valid.
func readAreaList(v *api.Validator) []contract.AreaEntry {
	nb := contract.Data.Notebook
	var list []contract.AreaEntry
	sent := v.ObjectArray("areas", true, nb.AreasMax, func(e *api.Validator) {
		id, _ := e.String("id", true, false, AreaRule)
		name, _ := e.String("name", true, true, api.MinLen(1), api.MaxLen(nb.AreaNameMaxLength))
		list = append(list, contract.AreaEntry{ID: id, Name: name})
	})
	if sent && len(list) == 0 {
		v.Fail("areas", api.CodeTooSmall)
	}
	if !v.Clean() {
		return list
	}
	ids := map[string]bool{}
	names := map[string]bool{}
	for i, e := range list {
		key := "areas." + strconv.Itoa(i)
		if ids[e.ID] {
			v.FailWith(key+".id", api.CodeCustom, nb.AreaDuplicateIDMessage)
		}
		if lower := strings.ToLower(e.Name); names[lower] {
			v.FailWith(key+".name", api.CodeCustom, nb.AreaDuplicateNameMessage)
		} else {
			names[lower] = true
		}
		ids[e.ID] = true
	}
	return list
}
