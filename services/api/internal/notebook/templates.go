package notebook

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

// DailyTemplate is DailyTemplateSchema, in its field order.
type DailyTemplate struct {
	Area         string  `json:"area"`
	BodyMarkdown string  `json:"bodyMarkdown"`
	IsDefault    bool    `json:"isDefault"`
	Version      int     `json:"version"`
	UpdatedAt    *string `json:"updatedAt"`
}

type storedTemplate struct {
	DailyTemplate
	createdAt string
}

func defaultTemplate(area string) DailyTemplate {
	return DailyTemplate{Area: area, BodyMarkdown: contract.Data.Notebook.DailyTemplates[area], IsDefault: true}
}

// templatesRepo keeps one row per user and area; no row is the built-in
// template at version 0. A reset writes a row marked default rather than
// deleting, so a device holding an older version still gets a conflict
// instead of a silent reset.
type templatesRepo struct {
	table *data.Table
	now   func() time.Time
}

func templateKey(userID, area string) data.Item {
	return data.Key(keys.DailyTemplatePk(userID, area), keys.DailyTemplateSk())
}

func parseTemplate(item data.Item) (storedTemplate, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "dailyTemplate")
	r.Str("userId", 1)
	t := storedTemplate{DailyTemplate: DailyTemplate{
		Area:         r.Enum("area", Areas...),
		IsDefault:    r.Bool("isDefault"),
		BodyMarkdown: r.Str("bodyMarkdown", 0),
		Version:      r.NonNegativeInt("version"),
	}}
	r.OptPositiveInt("version")
	t.createdAt = r.Str("createdAt", 1)
	updated := r.Str("updatedAt", 1)
	t.UpdatedAt = &updated
	if t.IsDefault {
		t.BodyMarkdown = contract.Data.Notebook.DailyTemplates[t.Area]
	}
	return t, r.Err("daily template")
}

func (r *templatesRepo) stored(ctx context.Context, userID, area string) (*storedTemplate, error) {
	res, err := r.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.table.Name), Key: templateKey(userID, area), ConsistentRead: aws.Bool(true),
	})
	if err != nil || res.Item == nil {
		return nil, err
	}
	t, err := parseTemplate(res.Item)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *templatesRepo) get(ctx context.Context, userID, area string) (DailyTemplate, error) {
	t, err := r.stored(ctx, userID, area)
	if err != nil || t == nil {
		return defaultTemplate(area), err
	}
	return t.DailyTemplate, nil
}

func (r *templatesRepo) conflict(ctx context.Context, userID, area string, expected int) error {
	current, err := r.get(ctx, userID, area)
	if err != nil {
		return err
	}
	return store.VersionConflict(expected, &current.Version, current)
}

// write saves bodyMarkdown, or the default when reset.
func (r *templatesRepo) write(ctx context.Context, userID, area, bodyMarkdown string, reset bool, expected api.Expected) (DailyTemplate, error) {
	existing, err := r.stored(ctx, userID, area)
	if err != nil {
		return DailyTemplate{}, err
	}
	current := 0
	if existing != nil {
		current = existing.Version
	}
	base := expected.Of(current)
	if current != base {
		return DailyTemplate{}, r.conflict(ctx, userID, area, base)
	}
	if existing == nil && reset {
		return defaultTemplate(area), nil
	}
	now := store.ISOTime(r.now())
	createdAt := now
	if existing != nil {
		createdAt = existing.createdAt
	}
	if reset {
		bodyMarkdown = ""
	}
	item := templateKey(userID, area)
	item["entityType"] = data.S("dailyTemplate")
	item["userId"] = data.S(userID)
	item["area"] = data.S(area)
	item["isDefault"] = data.Bool(reset)
	item["bodyMarkdown"] = data.S(bodyMarkdown)
	item["version"] = data.N(int64(base + 1))
	item["createdAt"] = data.S(createdAt)
	item["updatedAt"] = data.S(now)
	in := &dynamodb.PutItemInput{TableName: aws.String(r.table.Name), Item: item}
	if base == 0 {
		in.ConditionExpression = aws.String("attribute_not_exists(pk)")
	} else {
		in.ConditionExpression = aws.String("attribute_exists(pk) AND version = :v")
		in.ExpressionAttributeValues = map[string]types.AttributeValue{":v": data.N(int64(base))}
	}
	if _, err := r.table.DB.PutItem(ctx, in); err != nil {
		if data.ClassifyWriteError(err) == data.WriteConflict {
			return DailyTemplate{}, r.conflict(ctx, userID, area, base)
		}
		return DailyTemplate{}, err
	}
	saved := DailyTemplate{Area: area, BodyMarkdown: bodyMarkdown, IsDefault: reset, Version: base + 1, UpdatedAt: &now}
	if reset {
		saved.BodyMarkdown = contract.Data.Notebook.DailyTemplates[area]
	}
	return saved, nil
}
