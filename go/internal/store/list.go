package store

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

// ListSpec reads draft rows as list rows of type R.
type ListSpec[R any] struct {
	// Attributes are read with a ProjectionExpression; nil reads whole rows.
	Attributes []string
	Parse      func(data.Item) (R, error)
	ID         func(R) string
	Status     func(R) string
	// StoredFlag is the META row's hasUnpublishedChanges; nil on rows saved
	// before it was stored.
	StoredFlag func(R) *bool
	// Where drops rows that fail it; pair it with MaxItems so a page fills.
	Where func(R) bool
}

func withProjection(in *PageQuery, attributes []string) {
	names := map[string]string{}
	for k, v := range in.Input.ExpressionAttributeNames {
		names[k] = v
	}
	placeholders := make([]string, len(attributes))
	for i, attr := range attributes {
		p := "#proj" + strconv.Itoa(i)
		names[p] = attr
		placeholders[i] = p
	}
	in.Input.ProjectionExpression = aws.String(strings.Join(placeholders, ", "))
	in.Input.ExpressionAttributeNames = names
}

// QueryListPage reads a page of draft rows and resolves each row's
// unpublished flag, falling back to comparing against PUBLISHED for rows
// with no stored flag.
func QueryListPage[T, R any](ctx context.Context, s *PublishableStore[T], q PageQuery, spec ListSpec[R], onCorrupt func(*api.DataIntegrityError)) (Page[R], []bool, error) {
	if spec.Attributes != nil {
		withProjection(&q, spec.Attributes)
	}
	page, err := QueryPage(ctx, s.table, q, func(item data.Item) (R, bool, error) {
		row, err := spec.Parse(item)
		if err != nil {
			return row, false, err
		}
		skip := spec.Status(row) == StatusDeleted || (spec.Where != nil && !spec.Where(row))
		return row, skip, nil
	}, onCorrupt)
	if err != nil {
		return page, nil, err
	}
	flags, err := resolveFlags(ctx, s, page.Items, spec, onCorrupt)
	return page, flags, err
}

func resolveFlags[T, R any](ctx context.Context, s *PublishableStore[T], rows []R, spec ListSpec[R], onCorrupt func(*api.DataIntegrityError)) ([]bool, error) {
	var legacy []string
	seen := map[string]bool{}
	for _, r := range rows {
		if id := spec.ID(r); spec.Status(r) == StatusPublished && spec.StoredFlag(r) == nil && !seen[id] {
			seen[id] = true
			legacy = append(legacy, id)
		}
	}
	computed := map[string]bool{}
	if len(legacy) > 0 {
		var keys []data.Item
		for _, id := range legacy {
			keys = append(keys, s.metaKey(id), s.publishedKey(id))
		}
		items, err := s.table.BatchGet(ctx, keys, false)
		if err != nil {
			return nil, err
		}
		byKey := map[string]data.Item{}
		for _, item := range items {
			byKey[keyString(item)] = item
		}
		read := func(key data.Item) (*T, error) {
			item, ok := byKey[keyString(key)]
			if !ok {
				return nil, nil
			}
			e, err := s.cfg.Parse(item)
			var corrupt *api.DataIntegrityError
			if errors.As(err, &corrupt) {
				onCorrupt(corrupt)
				return nil, nil
			}
			if err != nil {
				return nil, err
			}
			return &e, nil
		}
		for _, id := range legacy {
			draft, err := read(s.metaKey(id))
			if err != nil {
				return nil, err
			}
			if draft == nil {
				continue
			}
			published, err := read(s.publishedKey(id))
			if err != nil {
				return nil, err
			}
			flagged := s.Flag(*draft, published)
			computed[id] = s.cfg.State(&flagged).HasUnpublishedChanges
		}
	}
	flags := make([]bool, len(rows))
	for i, r := range rows {
		if spec.Status(r) != StatusPublished {
			continue
		}
		if stored := spec.StoredFlag(r); stored != nil {
			flags[i] = *stored
		} else {
			flags[i] = computed[spec.ID(r)]
		}
	}
	return flags, nil
}

func keyString(item data.Item) string {
	return attrString(item["pk"]) + "\n" + attrString(item["sk"])
}

func attrString(v types.AttributeValue) string {
	if s, ok := v.(*types.AttributeValueMemberS); ok {
		return s.Value
	}
	return ""
}
