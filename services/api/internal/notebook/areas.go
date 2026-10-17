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
	index := data.Item{}
	for _, e := range a.Areas.Areas {
		index[e.ID] = data.Bool(true)
	}
	item["areaIndex"] = data.M(index)
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

func unknownArea() error {
	return api.BadRequest("area must be one of your areas", map[string]string{"area": "not_found"})
}

// require is the list, or a 400 when area isn't on it: rows only go into
// the user's own areas.
func (r *areasRepo) require(ctx context.Context, userID, area string) (Areas, error) {
	a, err := r.get(ctx, userID)
	if err == nil && !a.Has(area) {
		err = unknownArea()
	}
	return a, err
}

// areaFence joins a write that puts a row into area, so the write fails if
// the area was removed after require read the list. A row written before
// areaIndex existed has none, and no row is the default list; neither has
// had an area removed.
func areaFence(table *data.Table, userID, area string) types.TransactWriteItem {
	return types.TransactWriteItem{ConditionCheck: &types.ConditionCheck{
		TableName:                aws.String(table.Name),
		Key:                      areasKey(userID),
		ConditionExpression:      aws.String("attribute_not_exists(areaIndex) OR attribute_exists(areaIndex.#area)"),
		ExpressionAttributeNames: map[string]string{"#area": area},
	}}
}

func (r *areasRepo) conflict(ctx context.Context, userID string, expected int) error {
	current, err := r.get(ctx, userID)
	if err != nil {
		return err
	}
	return store.VersionConflict(expected, &current.Version, current)
}

// areaContents counts an area's live notes and tasks by kind.
type areaContents struct {
	notes, archived     int
	open, done, dropped int
}

func (c areaContents) empty() bool { return c.notes+c.open+c.done+c.dropped == 0 }

func (r *areasRepo) count(ctx context.Context, pk string, filter string) (int, error) {
	in := &dynamodb.QueryInput{
		TableName:                 aws.String(r.table.Name),
		IndexName:                 aws.String(keys.GSI1),
		KeyConditionExpression:    aws.String("gsi1pk = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
		Select:                    types.SelectCount,
	}
	if filter != "" {
		in.FilterExpression = aws.String(filter)
		in.ExpressionAttributeValues[":true"] = data.Bool(true)
	}
	total := 0
	pages := dynamodb.NewQueryPaginator(r.table.DB, in)
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return 0, err
		}
		total += int(page.Count)
	}
	return total, nil
}

func (r *areasRepo) contents(ctx context.Context, userID, area string) (areaContents, error) {
	var c areaContents
	var err error
	notesPk := keys.NotebookAreaGSI1Pk(userID, area)
	if c.notes, err = r.count(ctx, notesPk, ""); err != nil {
		return c, err
	}
	if c.notes > 0 {
		if c.archived, err = r.count(ctx, notesPk, "archived = :true"); err != nil {
			return c, err
		}
	}
	for _, status := range TaskStatuses {
		n, err := r.count(ctx, keys.TaskAreaStatusGSI1Pk(userID, area, status), "")
		if err != nil {
			return c, err
		}
		switch status {
		case "done":
			c.done += n
		case "dropped":
			c.dropped += n
		default:
			c.open += n
		}
	}
	return c, nil
}

func plural(n int, one string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + one + "s"
}

// inUseMessage names what keeps an area from being removed.
func inUseMessage(name string, c areaContents) string {
	var parts []string
	switch {
	case c.notes > 0 && c.archived == c.notes:
		parts = append(parts, plural(c.notes, "archived note"))
	case c.archived > 0:
		parts = append(parts, plural(c.notes, "note")+" ("+strconv.Itoa(c.archived)+" archived)")
	case c.notes > 0:
		parts = append(parts, plural(c.notes, "note"))
	}
	for _, k := range []struct {
		n    int
		kind string
	}{{c.open, "open task"}, {c.done, "done task"}, {c.dropped, "dropped task"}} {
		if k.n > 0 {
			parts = append(parts, plural(k.n, k.kind))
		}
	}
	list := parts[0]
	if len(parts) > 1 {
		list = strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
	}
	return name + " still has " + list + ". Move or delete them before removing it."
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
		c, err := r.contents(ctx, userID, id)
		if err != nil {
			return Areas{}, err
		}
		if !c.empty() {
			return Areas{}, &api.ConflictError{Message: inUseMessage(current.Name(id), c), Code: api.CodeConflict}
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
		return Areas{}, mapWriteError(err)
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
