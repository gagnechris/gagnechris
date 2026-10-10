package store

import (
	"context"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

// Publishable is the publish state every site-admin entity carries.
type Publishable struct {
	Status                string  `json:"status"`
	PublishedAt           *string `json:"publishedAt"`
	UpdatedAt             string  `json:"updatedAt"`
	Version               int     `json:"version"`
	HasUnpublishedChanges bool    `json:"hasUnpublishedChanges"`
}

const (
	StatusDraft     = "draft"
	StatusPublished = "published"
	StatusDeleted   = "deleted"
)

// PublishKeys are where an entity keeps its draft (META) and live
// (PUBLISHED) rows.
type PublishKeys struct{ PK, MetaSK, PublishedSK string }

// SlugClaims say where an entity type keeps its unique slug row and the
// redirects a rename leaves behind.
type SlugClaims struct {
	ClaimKey, RedirectKey               func(slug string) data.Item
	OwnerAttr                           string
	ClaimEntityType, RedirectEntityType string
}

// PersistOptions say what a draft mutation does to the PUBLISHED row.
type PersistOptions[T any] struct {
	SyncPublished, DeletePublished bool
	PreviousPublished              *T
}

type PublishableConfig[T any] struct {
	Label         string
	Keys          func(id string) PublishKeys
	ID            func(*T) string
	State         func(*T) *Publishable
	Parse         func(data.Item) (T, error)
	MetaItem      func(T) data.Item
	PublishedItem func(T) data.Item
	ContentEqual  func(a, b T) bool
	// Slug and SlugClaims keep a unique slug row in step with the draft.
	Slug       func(T) string
	SlugClaims *SlugClaims
	// PublishedIDSet is the site publish row's id set this entity is listed
	// in while it has a PUBLISHED row; "" for singletons.
	PublishedIDSet string
	// ExtraItems join every draft mutation's transaction.
	ExtraItems func(before, after T, opts PersistOptions[T]) []types.TransactWriteItem
}

// Publishable is the draft + PUBLISHED pair store for site-admin entities.
type PublishableStore[T any] struct {
	cfg   PublishableConfig[T]
	table *data.Table
	now   func() time.Time
}

func NewPublishableStore[T any](cfg PublishableConfig[T], table *data.Table, now func() time.Time) *PublishableStore[T] {
	return &PublishableStore[T]{cfg: cfg, table: table, now: now}
}

// ISOTime is Date.toISOString.
func ISOTime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

func (s *PublishableStore[T]) nowISO() string { return ISOTime(s.now()) }

func (s *PublishableStore[T]) Table() *data.Table { return s.table }

func (s *PublishableStore[T]) metaKey(id string) data.Item {
	k := s.cfg.Keys(id)
	return data.Key(k.PK, k.MetaSK)
}

func (s *PublishableStore[T]) publishedKey(id string) data.Item {
	k := s.cfg.Keys(id)
	return data.Key(k.PK, k.PublishedSK)
}

func (s *PublishableStore[T]) notFound(id string) error {
	return api.NotFound(s.cfg.Label + " " + id + " not found")
}

func (s *PublishableStore[T]) isDeleted(e *T) bool { return s.cfg.State(e).Status == StatusDeleted }

// Flag sets hasUnpublishedChanges: a published draft that differs from its
// PUBLISHED row.
func (s *PublishableStore[T]) Flag(draft T, published *T) T {
	st := s.cfg.State(&draft)
	st.HasUnpublishedChanges = st.Status == StatusPublished && published != nil && !s.cfg.ContentEqual(draft, *published)
	return draft
}

// Pair is a draft and its PUBLISHED row, if any.
type Pair[T any] struct {
	Draft     T
	Published *T
}

func skOf(item data.Item) string {
	if s, ok := item["sk"].(*types.AttributeValueMemberS); ok {
		return s.Value
	}
	return ""
}

// Load is nil when the draft is missing or deleted.
func (s *PublishableStore[T]) Load(ctx context.Context, id string, consistent bool) (*Pair[T], error) {
	keys := s.cfg.Keys(id)
	items, err := s.table.BatchGet(ctx, []data.Item{s.metaKey(id), s.publishedKey(id)}, consistent)
	if err != nil {
		return nil, err
	}
	var draftItem, publishedItem data.Item
	for _, item := range items {
		switch skOf(item) {
		case keys.MetaSK:
			draftItem = item
		case keys.PublishedSK:
			publishedItem = item
		}
	}
	if draftItem == nil {
		return nil, nil
	}
	draft, err := s.cfg.Parse(draftItem)
	if err != nil {
		return nil, err
	}
	if s.isDeleted(&draft) {
		return nil, nil
	}
	pair := &Pair[T]{Draft: draft}
	if publishedItem != nil {
		published, err := s.cfg.Parse(publishedItem)
		if err != nil {
			return nil, err
		}
		pair.Published = &published
	}
	return pair, nil
}

func (s *PublishableStore[T]) loadOrThrow(ctx context.Context, id string) (*Pair[T], error) {
	pair, err := s.Load(ctx, id, true)
	if err == nil && pair == nil {
		err = s.notFound(id)
	}
	return pair, err
}

// Get is the flagged draft, or nil.
func (s *PublishableStore[T]) Get(ctx context.Context, id string, consistent bool) (*T, error) {
	pair, err := s.Load(ctx, id, consistent)
	if err != nil || pair == nil {
		return nil, err
	}
	e := s.Flag(pair.Draft, pair.Published)
	return &e, nil
}

func (s *PublishableStore[T]) GetOrThrow(ctx context.Context, id string) (T, error) {
	e, err := s.Get(ctx, id, false)
	if err == nil && e == nil {
		err = s.notFound(id)
	}
	if err != nil {
		var zero T
		return zero, err
	}
	return *e, nil
}

// ExistingIDs are the ids among ids that name a live draft.
func (s *PublishableStore[T]) ExistingIDs(ctx context.Context, ids []string) (map[string]bool, error) {
	seen := map[string]bool{}
	var keys []data.Item
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			keys = append(keys, s.metaKey(id))
		}
	}
	items, err := s.table.BatchGet(ctx, keys, false)
	if err != nil {
		return nil, err
	}
	found := map[string]bool{}
	for _, item := range items {
		e, err := s.cfg.Parse(item)
		if err != nil {
			return nil, err
		}
		if !s.isDeleted(&e) {
			found[s.cfg.ID(&e)] = true
		}
	}
	return found, nil
}

func (s *PublishableStore[T]) put(item data.Item, condition string, values map[string]types.AttributeValue) *types.Put {
	p := &types.Put{TableName: aws.String(s.table.Name), Item: item}
	if condition != "" {
		p.ConditionExpression = aws.String(condition)
		p.ExpressionAttributeValues = values
	}
	return p
}

func (s *PublishableStore[T]) slugClaimPut(slug, id string) types.TransactWriteItem {
	c := s.cfg.SlugClaims
	item := c.ClaimKey(slug)
	item["entityType"] = data.S(c.ClaimEntityType)
	item[c.OwnerAttr] = data.S(id)
	return types.TransactWriteItem{Put: s.put(item, "attribute_not_exists(pk)", nil)}
}

func slugTaken(slug string) string { return `Slug "` + slug + `" is already taken` }

// InsertDraft writes a new draft, claiming its slug in the same transaction.
func (s *PublishableStore[T]) InsertDraft(ctx context.Context, e T) (T, error) {
	meta := s.put(s.cfg.MetaItem(e), "attribute_not_exists(pk)", nil)
	if s.cfg.SlugClaims == nil {
		_, err := s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: meta.TableName, Item: meta.Item, ConditionExpression: meta.ConditionExpression,
		})
		return e, MapWriteError(err, "Create conflict ("+s.cfg.Label+")", ClaimWrite{VersionIndex: -1})
	}
	slug := s.cfg.Slug(e)
	_, err := s.table.DB.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{
		TransactItems: []types.TransactWriteItem{s.slugClaimPut(slug, s.cfg.ID(&e)), {Put: meta}},
	})
	return e, MapWriteError(err, slugTaken(slug), ClaimWrite{ClaimIndexes: []int{0}, ClaimMessage: slugTaken(slug), VersionIndex: -1})
}

func (s *PublishableStore[T]) assertVersion(existing T, expected int) error {
	if v := s.cfg.State(&existing).Version; v != expected {
		return &api.ConflictError{
			Message:        "Version conflict: expected " + strconv.Itoa(expected) + ", current " + strconv.Itoa(v),
			Code:           api.CodeConflict,
			CurrentVersion: &v,
			Current:        existing,
		}
	}
	return nil
}

// Mutate applies build to the flagged draft; version, updatedAt and the
// unpublished flag are set here.
func (s *PublishableStore[T]) Mutate(ctx context.Context, id string, expected int, build func(T) T) (T, error) {
	pair, err := s.loadOrThrow(ctx, id)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.MutateLoaded(ctx, pair, expected, build)
}

func (s *PublishableStore[T]) MutateLoaded(ctx context.Context, pair *Pair[T], expected int, build func(T) T) (T, error) {
	existing := s.Flag(pair.Draft, pair.Published)
	if err := s.assertVersion(existing, expected); err != nil {
		return existing, err
	}
	next := build(existing)
	st := s.cfg.State(&next)
	st.UpdatedAt = s.nowISO()
	st.Version = s.cfg.State(&existing).Version + 1
	next = s.Flag(next, pair.Published)
	return next, s.persist(ctx, existing, next, PersistOptions[T]{})
}

func (s *PublishableStore[T]) SoftDelete(ctx context.Context, id string, expected int) (T, error) {
	pair, err := s.loadOrThrow(ctx, id)
	if err != nil {
		var zero T
		return zero, err
	}
	existing := s.Flag(pair.Draft, pair.Published)
	if err := s.assertVersion(existing, expected); err != nil {
		return existing, err
	}
	next := existing
	st := s.cfg.State(&next)
	st.Status = StatusDeleted
	st.UpdatedAt = s.nowISO()
	st.Version++
	st.HasUnpublishedChanges = false
	return next, s.persist(ctx, existing, next, PersistOptions[T]{
		DeletePublished: pair.Published != nil, PreviousPublished: pair.Published,
	})
}

func (s *PublishableStore[T]) Publish(ctx context.Context, id string, expected int) (T, error) {
	pair, err := s.loadOrThrow(ctx, id)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.PublishLoaded(ctx, pair, expected, nil)
}

// PublishLoaded keeps an earlier publishedAt; publishedAt, when given, is
// used for a first publish instead of now.
func (s *PublishableStore[T]) PublishLoaded(ctx context.Context, pair *Pair[T], expected int, publishedAt *string) (T, error) {
	existing := s.Flag(pair.Draft, pair.Published)
	if err := s.assertVersion(existing, expected); err != nil {
		return existing, err
	}
	if s.cfg.State(&existing).Status == StatusPublished && pair.Published != nil && s.cfg.ContentEqual(existing, *pair.Published) {
		return s.Flag(existing, pair.Published), nil
	}
	updatedAt := s.nowISO()
	next := existing
	st := s.cfg.State(&next)
	st.Status = StatusPublished
	if st.PublishedAt == nil {
		if publishedAt != nil {
			st.PublishedAt = publishedAt
		} else {
			st.PublishedAt = &updatedAt
		}
	}
	st.UpdatedAt = updatedAt
	st.Version++
	st.HasUnpublishedChanges = false
	if err := s.persist(ctx, existing, next, PersistOptions[T]{SyncPublished: true, PreviousPublished: pair.Published}); err != nil {
		return next, err
	}
	return s.Flag(next, &next), nil
}

func (s *PublishableStore[T]) Unpublish(ctx context.Context, id string, expected int) (T, error) {
	pair, err := s.loadOrThrow(ctx, id)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.UnpublishLoaded(ctx, pair, expected)
}

func (s *PublishableStore[T]) UnpublishLoaded(ctx context.Context, pair *Pair[T], expected int) (T, error) {
	existing := s.Flag(pair.Draft, pair.Published)
	if err := s.assertVersion(existing, expected); err != nil {
		return existing, err
	}
	if s.cfg.State(&existing).Status != StatusPublished {
		return s.Flag(existing, nil), nil
	}
	next := existing
	st := s.cfg.State(&next)
	st.Status = StatusDraft
	st.UpdatedAt = s.nowISO()
	st.Version++
	st.HasUnpublishedChanges = false
	return next, s.persist(ctx, existing, next, PersistOptions[T]{DeletePublished: true, PreviousPublished: pair.Published})
}

func (s *PublishableStore[T]) Discard(ctx context.Context, id string, expected int) (T, error) {
	pair, err := s.loadOrThrow(ctx, id)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.DiscardLoaded(ctx, pair, expected)
}

// DiscardLoaded resets the draft to its PUBLISHED content.
func (s *PublishableStore[T]) DiscardLoaded(ctx context.Context, pair *Pair[T], expected int) (T, error) {
	existing := s.Flag(pair.Draft, pair.Published)
	if err := s.assertVersion(existing, expected); err != nil {
		return existing, err
	}
	if pair.Published == nil || s.cfg.ContentEqual(existing, *pair.Published) {
		return s.Flag(existing, pair.Published), nil
	}
	cur := s.cfg.State(&existing)
	next := *pair.Published
	st := s.cfg.State(&next)
	st.Status = StatusPublished
	if cur.PublishedAt != nil {
		st.PublishedAt = cur.PublishedAt
	}
	st.UpdatedAt = s.nowISO()
	st.Version = cur.Version + 1
	st.HasUnpublishedChanges = false
	if err := s.persist(ctx, existing, next, PersistOptions[T]{}); err != nil {
		return next, err
	}
	return s.Flag(next, pair.Published), nil
}

func (s *PublishableStore[T]) sitePublishUpdate(id string, published bool) types.TransactWriteItem {
	names := map[string]string{"#t": "entityType", "#g": "generation"}
	values := map[string]types.AttributeValue{":t": data.S("sitePublish"), ":one": data.N(1)}
	expr := "SET #t = :t ADD #g :one"
	if set := s.cfg.PublishedIDSet; set != "" {
		names["#ids"] = set
		values[":ids"] = data.StrSet(id)
		if published {
			expr += ", #ids :ids"
		} else {
			expr += " DELETE #ids :ids"
		}
	}
	return types.TransactWriteItem{Update: &types.Update{
		TableName:                 aws.String(s.table.Name),
		Key:                       data.Key("SITE#publish", "META"),
		UpdateExpression:          aws.String(expr),
		ExpressionAttributeNames:  names,
		ExpressionAttributeValues: values,
	}}
}

// persist writes the versioned META Put as item 0, joined in one
// transaction by slug rows, the PUBLISHED row and ExtraItems; alone it is a
// plain Put.
func (s *PublishableStore[T]) persist(ctx context.Context, before, after T, opts PersistOptions[T]) error {
	id := s.cfg.ID(&after)
	beforeState := s.cfg.State(&before)
	meta := s.put(s.cfg.MetaItem(after), VersionMatchCondition, VersionMatchValues(beforeState.Version))
	items := []types.TransactWriteItem{{Put: meta}}
	var claimIndexes []int
	claims := s.cfg.SlugClaims
	var afterSlug string
	if claims != nil {
		beforeSlug := s.cfg.Slug(before)
		afterSlug = s.cfg.Slug(after)
		if beforeSlug != afterSlug {
			redirect := claims.RedirectKey(beforeSlug)
			redirect["entityType"] = data.S(claims.RedirectEntityType)
			redirect[claims.OwnerAttr] = data.S(s.cfg.ID(&before))
			redirect["targetSlug"] = data.S(afterSlug)
			items = append(items,
				types.TransactWriteItem{Delete: &types.Delete{
					TableName:                 aws.String(s.table.Name),
					Key:                       claims.ClaimKey(beforeSlug),
					ConditionExpression:       aws.String(claims.OwnerAttr + " = :id"),
					ExpressionAttributeValues: map[string]types.AttributeValue{":id": data.S(s.cfg.ID(&before))},
				}},
				types.TransactWriteItem{Put: s.put(redirect, "", nil)},
			)
			claimIndexes = append(claimIndexes, len(items))
			items = append(items, s.slugClaimPut(afterSlug, id))
		}
	}
	if opts.SyncPublished {
		items = append(items, types.TransactWriteItem{Put: s.put(s.cfg.PublishedItem(after), "", nil)})
	}
	if opts.DeletePublished {
		items = append(items, types.TransactWriteItem{Delete: &types.Delete{
			TableName: aws.String(s.table.Name), Key: s.publishedKey(id),
		}})
	}
	if opts.SyncPublished || opts.DeletePublished {
		items = append(items, s.sitePublishUpdate(id, opts.SyncPublished))
	}
	if s.cfg.ExtraItems != nil {
		items = append(items, s.cfg.ExtraItems(before, after, opts)...)
	}
	if claims != nil && s.cfg.State(&after).Status == StatusDeleted && beforeState.Status != StatusDeleted {
		items = append(items, types.TransactWriteItem{Delete: &types.Delete{
			TableName: aws.String(s.table.Name), Key: claims.ClaimKey(afterSlug),
		}})
	}

	action := "Update"
	switch {
	case opts.SyncPublished:
		action = "Publish"
	case opts.DeletePublished:
		action = "Unpublish"
	}
	var err error
	if len(items) == 1 {
		_, err = s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: meta.TableName, Item: meta.Item,
			ConditionExpression: meta.ConditionExpression, ExpressionAttributeValues: meta.ExpressionAttributeValues,
		})
	} else {
		// Every publish updates the one site publish row, so concurrent
		// publishes of different entities can cancel each other.
		err = data.RetryTransactionConflicts(ctx, func() error {
			_, err := s.table.DB.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: items})
			return err
		})
	}
	return MapVersionedWriteError(err, action+" conflict ("+s.cfg.Label+" version)",
		ClaimWrite{ClaimIndexes: claimIndexes, ClaimMessage: slugTaken(afterSlug), VersionIndex: 0},
		func() error {
			current, err := s.Get(ctx, id, true)
			if err != nil {
				return err
			}
			if current == nil {
				return VersionConflict(beforeState.Version, nil, nil)
			}
			v := s.cfg.State(current).Version
			return VersionConflict(beforeState.Version, &v, *current)
		})
}
