package notebook

import (
	"context"
	"errors"
	"time"

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

// NoteTemplate is NoteTemplateSchema, in its field order.
type NoteTemplate struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Area         *string `json:"area"`
	BodyMarkdown string  `json:"bodyMarkdown"`
	Version      int     `json:"version"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type storedNoteTemplate struct {
	NoteTemplate
	userID string
}

// noteTemplatesRepo keeps a user's templates in one partition. They are not
// synced, so a delete removes the row instead of leaving a tombstone.
type noteTemplatesRepo struct {
	table *data.Table
	now   func() time.Time
}

func noteTemplateKey(userID, id string) data.Item {
	return data.Key(keys.NoteTemplatesPk(userID), keys.NoteTemplateSk(id))
}

func parseNoteTemplate(item data.Item) (storedNoteTemplate, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "noteTemplate")
	t := storedNoteTemplate{
		NoteTemplate: NoteTemplate{
			ID:           r.Str("id", 1),
			Name:         r.Str("name", 1),
			Area:         r.OptOnlyStr("area", 1),
			BodyMarkdown: r.Str("bodyMarkdown", 0),
			Version:      r.NonNegativeInt("version"),
			CreatedAt:    r.Str("createdAt", 1),
			UpdatedAt:    r.Str("updatedAt", 1),
		},
		userID: r.Str("userId", 1),
	}
	r.OptPositiveInt("version")
	return t, r.Err("note template")
}

// noteTemplateItem is buildNoteTemplateItem.
func noteTemplateItem(t storedNoteTemplate) data.Item {
	item := noteTemplateKey(t.userID, t.ID)
	item["entityType"] = data.S("noteTemplate")
	item["id"] = data.S(t.ID)
	item["userId"] = data.S(t.userID)
	item["name"] = data.S(t.Name)
	if t.Area != nil {
		item["area"] = data.S(*t.Area)
	}
	item["bodyMarkdown"] = data.S(t.BodyMarkdown)
	item["version"] = data.N(int64(t.Version))
	item["createdAt"] = data.S(t.CreatedAt)
	item["updatedAt"] = data.S(t.UpdatedAt)
	return item
}

// checkNoteTemplate holds a stored template to NoteTemplateSchema beyond
// what its row schema checks.
func checkNoteTemplate(t NoteTemplate) error {
	switch {
	case !api.ULIDPattern.MatchString(t.ID):
		return errors.New("id: Must be a ULID")
	case !api.IsDatetime(t.CreatedAt), !api.IsDatetime(t.UpdatedAt):
		return errors.New("timestamps: Invalid ISO datetime")
	}
	return nil
}

func (r *noteTemplatesRepo) get(ctx context.Context, userID, id string) (*storedNoteTemplate, error) {
	res, err := r.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.table.Name), Key: noteTemplateKey(userID, id), ConsistentRead: aws.Bool(true),
	})
	if err != nil || res.Item == nil {
		return nil, err
	}
	t, err := parseNoteTemplate(res.Item)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *noteTemplatesRepo) getOrThrow(ctx context.Context, userID, id string) (storedNoteTemplate, error) {
	t, err := r.get(ctx, userID, id)
	if err != nil {
		return storedNoteTemplate{}, err
	}
	if t == nil {
		return storedNoteTemplate{}, api.NotFound("Template not found")
	}
	return *t, nil
}

// list is every template, oldest first; a corrupt row is skipped.
func (r *noteTemplatesRepo) list(ctx context.Context, userID string, onCorrupt func(*api.DataIntegrityError)) ([]NoteTemplate, error) {
	out := []NoteTemplate{}
	pages := dynamodb.NewQueryPaginator(r.table.DB, &dynamodb.QueryInput{
		TableName:                 aws.String(r.table.Name),
		KeyConditionExpression:    aws.String("pk = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(keys.NoteTemplatesPk(userID))},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			t, err := parseNoteTemplate(item)
			if err != nil {
				var integrity *api.DataIntegrityError
				if errors.As(err, &integrity) && onCorrupt != nil {
					onCorrupt(integrity)
					continue
				}
				return nil, err
			}
			out = append(out, t.NoteTemplate)
		}
	}
	return out, nil
}

func (r *noteTemplatesRepo) count(ctx context.Context, userID string) (int, error) {
	total := 0
	pages := dynamodb.NewQueryPaginator(r.table.DB, &dynamodb.QueryInput{
		TableName:                 aws.String(r.table.Name),
		KeyConditionExpression:    aws.String("pk = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(keys.NoteTemplatesPk(userID))},
		Select:                    types.SelectCount,
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return 0, err
		}
		total += int(page.Count)
	}
	return total, nil
}

// create is idempotent: a repeat of the same id, name and text returns the
// stored template; the same id with other content is a 409. The count cap
// is checked before the write, so concurrent creates can pass it by a few.
func (r *noteTemplatesRepo) create(ctx context.Context, userID, id, name string, area *string, body string) (NoteTemplate, error) {
	replay := func() (NoteTemplate, error) {
		existing, err := r.get(ctx, userID, id)
		if err != nil {
			return NoteTemplate{}, err
		}
		if existing == nil {
			return NoteTemplate{}, nil
		}
		if existing.Name == name && sameParent(existing.Area, area) && existing.BodyMarkdown == body {
			return existing.NoteTemplate, nil
		}
		return NoteTemplate{}, &api.ConflictError{
			Message: "A different template already has this id", Code: api.CodePayloadMismatch,
			CurrentVersion: &existing.Version, Current: existing.NoteTemplate,
		}
	}
	if t, err := replay(); err != nil || t.ID != "" {
		return t, err
	}
	n, err := r.count(ctx, userID)
	if err != nil {
		return NoteTemplate{}, err
	}
	if n >= contract.Data.Notebook.NoteTemplateMaxCount {
		return NoteTemplate{}, &api.ConflictError{Message: contract.Data.Notebook.NoteTemplateLimitMessage, Code: api.CodeConflict}
	}
	now := jstime.ISO(r.now())
	t := storedNoteTemplate{
		NoteTemplate: NoteTemplate{ID: id, Name: name, Area: area, BodyMarkdown: body, Version: 1, CreatedAt: now, UpdatedAt: now},
		userID:       userID,
	}
	_, err = r.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.table.Name), Item: noteTemplateItem(t),
		ConditionExpression: aws.String("attribute_not_exists(pk)"),
	})
	if err != nil {
		if data.ClassifyWriteError(err) == data.WriteConflict {
			if t, rerr := replay(); rerr != nil || t.ID != "" {
				return t, rerr
			}
		}
		return NoteTemplate{}, mapWriteError(err)
	}
	return t.NoteTemplate, nil
}

func (r *noteTemplatesRepo) conflict(ctx context.Context, userID, id string, expected int) error {
	current, err := r.get(ctx, userID, id)
	if err != nil {
		return err
	}
	if current == nil {
		return api.NotFound("Template not found")
	}
	return store.VersionConflict(expected, &current.Version, current.NoteTemplate)
}

func (r *noteTemplatesRepo) update(ctx context.Context, userID, id string, expected api.Expected, name, body *string, area *string, hasArea bool) (NoteTemplate, error) {
	t, err := r.getOrThrow(ctx, userID, id)
	if err != nil {
		return NoteTemplate{}, err
	}
	base := expected.Of(t.Version)
	if base != t.Version {
		return NoteTemplate{}, store.VersionConflict(base, &t.Version, t.NoteTemplate)
	}
	setIf(&t.Name, name)
	setIf(&t.BodyMarkdown, body)
	if hasArea {
		t.Area = area
	}
	t.Version = base + 1
	t.UpdatedAt = jstime.ISO(r.now())
	_, err = r.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(r.table.Name), Item: noteTemplateItem(t),
		ConditionExpression:       aws.String("version = :v"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":v": data.N(int64(base))},
	})
	if err != nil {
		if data.ClassifyWriteError(err) == data.WriteConflict {
			return NoteTemplate{}, r.conflict(ctx, userID, id, base)
		}
		return NoteTemplate{}, mapWriteError(err)
	}
	return t.NoteTemplate, nil
}

func (r *noteTemplatesRepo) delete(ctx context.Context, userID, id string, expected api.Expected) error {
	t, err := r.getOrThrow(ctx, userID, id)
	if err != nil {
		return err
	}
	base := expected.Of(t.Version)
	if base != t.Version {
		return store.VersionConflict(base, &t.Version, t.NoteTemplate)
	}
	_, err = r.table.DB.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(r.table.Name), Key: noteTemplateKey(userID, id),
		ConditionExpression:       aws.String("version = :v"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":v": data.N(int64(base))},
	})
	if err != nil && data.ClassifyWriteError(err) == data.WriteConflict {
		return r.conflict(ctx, userID, id, base)
	}
	return mapWriteError(err)
}

// mapWriteError is a write's throttling or size error as the client sees it,
// once the caller has handled its own conflicts.
func mapWriteError(err error) error {
	return store.MapWriteError(err, "Write conflict", store.ClaimWrite{VersionIndex: -1})
}
