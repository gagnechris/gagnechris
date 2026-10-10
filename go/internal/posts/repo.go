package posts

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/oklog/ulid/v2"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const (
	gsi1Name = "gsi1"
	pageSize = 50
	// A search keeps few rows per read, so it reads full pages instead of
	// what is left of the page.
	searchReadPage = 200
)

// Published first so admin "all" pages surface live posts before drafts.
var allListedStatuses = []string{store.StatusPublished, store.StatusDraft}

type repo struct {
	*store.PublishableStore[Post]
	table *data.Table
	now   func() time.Time
}

func newRepo(table *data.Table, now func() time.Time) *repo {
	r := &repo{table: table, now: now}
	r.PublishableStore = store.NewPublishableStore(store.PublishableConfig[Post]{
		Label: label,
		Keys: func(id string) store.PublishKeys {
			return store.PublishKeys{PK: keys.PostPk(id), MetaSK: keys.SKMeta, PublishedSK: keys.SKPublished}
		},
		ID:             func(p *Post) string { return p.ID },
		State:          func(p *Post) *store.Publishable { return &p.Publishable },
		Parse:          parseMeta,
		MetaItem:       metaItem,
		PublishedItem:  publishedItem,
		ContentEqual:   contentEqual,
		Slug:           func(p Post) string { return p.Slug },
		SlugClaims:     slugClaims,
		PublishedIDSet: "postIds",
		ExtraItems: func(_, after Post, opts store.PersistOptions[Post]) []types.TransactWriteItem {
			return tagSyncItems(table.Name, after, opts)
		},
	}, table, now)
	return r
}

// tagSyncItems keep the tag index rows mirroring the PUBLISHED post, so
// they change only when it is written or deleted, never on a draft edit.
func tagSyncItems(tableName string, after Post, opts store.PersistOptions[Post]) []types.TransactWriteItem {
	if !opts.SyncPublished && !opts.DeletePublished {
		return nil
	}
	var beforeTags []string
	var beforePublishedAt *string
	if prev := opts.PreviousPublished; prev != nil {
		beforeTags, beforePublishedAt = prev.Tags, prev.PublishedAt
	}
	var afterTags []string
	var afterPublishedAt *string
	if opts.SyncPublished && after.Status == store.StatusPublished {
		afterTags, afterPublishedAt = after.Tags, after.PublishedAt
	}
	samePublishedAt := beforePublishedAt != nil && afterPublishedAt != nil && *beforePublishedAt == *afterPublishedAt

	var items []types.TransactWriteItem
	if beforePublishedAt != nil {
		for _, tag := range beforeTags {
			if opts.SyncPublished && slices.Contains(afterTags, tag) && samePublishedAt {
				continue
			}
			items = append(items, types.TransactWriteItem{Delete: &types.Delete{
				TableName: aws.String(tableName),
				Key:       data.Key(tagPk(tag), tagSk(*beforePublishedAt, after.ID)),
			}})
		}
	}
	if afterPublishedAt != nil {
		for _, tag := range afterTags {
			if slices.Contains(beforeTags, tag) && samePublishedAt {
				continue
			}
			item := data.Key(tagPk(tag), tagSk(*afterPublishedAt, after.ID))
			item["gsi2pk"] = data.S(tagPk(tag))
			item["gsi2sk"] = data.S(tagSk(*afterPublishedAt, after.ID))
			item["entityType"] = data.S("tagIndex")
			item["postId"] = data.S(after.ID)
			item["slug"] = data.S(after.Slug)
			items = append(items, types.TransactWriteItem{Put: &types.Put{TableName: aws.String(tableName), Item: item}})
		}
	}
	return items
}

// list is grouped by status, newest first within each.
func (r *repo) list(ctx context.Context, status, cursor string, limit int, q string, onCorrupt func(*api.DataIntegrityError)) (store.Page[Summary], error) {
	partitions := allListedStatuses
	if status != "" {
		partitions = []string{status}
	}
	q = api.TrimJS(q)
	return store.WalkPartitions(partitions, cursor, limit, func(partition, cursor string, remaining, remainingBytes int) (store.Page[Summary], error) {
		pk := statusGSI1Pk(partition)
		query := store.PageQuery{
			Input: dynamodb.QueryInput{
				IndexName:                 aws.String(gsi1Name),
				KeyConditionExpression:    aws.String("gsi1pk = :pk"),
				ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
				ScanIndexForward:          aws.Bool(false),
			},
			Cursor:         cursor,
			Limit:          remaining,
			CursorKeys:     store.GSI1CursorKeys,
			PartitionAttr:  "gsi1pk",
			PartitionValue: pk,
			ByteBudget:     remainingBytes,
		}
		spec := store.ListSpec[listRow]{
			Attributes: summaryAttributes,
			Parse:      parseSummary,
			ID:         func(row listRow) string { return row.ID },
			Status:     func(row listRow) string { return row.Status },
			StoredFlag: func(row listRow) *bool { return row.HasUnpublishedChanges },
		}
		if q != "" {
			query.Limit = max(remaining, searchReadPage)
			query.MaxItems = remaining
			spec.Where = func(row listRow) bool { return matchesQuery(row, q) }
		}
		page, flags, err := store.QueryListPage(ctx, r.PublishableStore, query, spec, onCorrupt)
		if err != nil {
			return store.Page[Summary]{}, err
		}
		out := store.Page[Summary]{NextCursor: page.NextCursor, Items: make([]Summary, len(page.Items))}
		for i, row := range page.Items {
			out.Items[i] = Summary{
				ID: row.ID, Slug: row.Slug, Title: row.Title, Tags: row.Tags, ProjectIDs: row.ProjectIDs,
				Publishable: store.Publishable{
					Status: row.Status, PublishedAt: row.PublishedAt, UpdatedAt: row.UpdatedAt,
					Version: row.Version, HasUnpublishedChanges: flags[i],
				},
			}
		}
		return out, nil
	})
}

type counts struct {
	All       int `json:"all"`
	Published int `json:"published"`
	Draft     int `json:"draft"`
}

func (r *repo) counts(ctx context.Context) (counts, error) {
	type result struct {
		n   int
		err error
	}
	draft := make(chan result, 1)
	go func() {
		n, err := r.countStatus(ctx, store.StatusDraft)
		draft <- result{n, err}
	}()
	published, err := r.countStatus(ctx, store.StatusPublished)
	d := <-draft
	if err == nil {
		err = d.err
	}
	return counts{All: published + d.n, Published: published, Draft: d.n}, err
}

func (r *repo) countStatus(ctx context.Context, status string) (int, error) {
	pages := dynamodb.NewQueryPaginator(r.table.DB, &dynamodb.QueryInput{
		TableName:                 aws.String(r.table.Name),
		IndexName:                 aws.String(gsi1Name),
		KeyConditionExpression:    aws.String("gsi1pk = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(statusGSI1Pk(status))},
		Select:                    types.SelectCount,
	})
	n := 0
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return 0, err
		}
		n += int(page.Count)
	}
	return n, nil
}

type createInput struct {
	title, excerpt, bodyMarkdown string
	slug                         *string
	tags, projectIDs             []string
	coverImage                   *string
	seo                          *Seo
}

func (r *repo) create(ctx context.Context, in createInput) (Post, error) {
	title := api.TrimJS(in.title)
	if title == "" {
		title = "Untitled"
	}
	slugSource := title
	if in.slug != nil && api.TrimJS(*in.slug) != "" {
		slugSource = api.TrimJS(*in.slug)
	}
	return r.InsertDraft(ctx, Post{
		ID:           ulid.Make().String(),
		Slug:         slugify(slugSource),
		Title:        title,
		Excerpt:      in.excerpt,
		BodyMarkdown: in.bodyMarkdown,
		Tags:         normalizeTags(in.tags),
		ProjectIDs:   uniq(in.projectIDs),
		CoverImage:   in.coverImage,
		Seo:          in.seo,
		Publishable: store.Publishable{
			Status:    store.StatusDraft,
			UpdatedAt: store.ISOTime(r.now()),
			Version:   1,
		},
	})
}

// updateInput fields are nil when the request leaves them out; setCover
// and setSeo say whether coverImage and seo were sent, null included.
type updateInput struct {
	version               int
	title, slug           *string
	excerpt, bodyMarkdown *string
	tags, projectIDs      []string
	setCover, setSeo      bool
	coverImage            *string
	seo                   *Seo
}

func (r *repo) update(ctx context.Context, id string, in updateInput) (Post, error) {
	return r.Mutate(ctx, id, in.version, func(p Post) Post {
		if in.title != nil {
			p.Title = *in.title
		}
		if in.slug != nil && *in.slug != "" {
			p.Slug = slugify(*in.slug)
		}
		if in.excerpt != nil {
			p.Excerpt = *in.excerpt
		}
		if in.bodyMarkdown != nil {
			p.BodyMarkdown = *in.bodyMarkdown
		}
		if in.tags != nil {
			p.Tags = normalizeTags(in.tags)
		}
		if in.projectIDs != nil {
			p.ProjectIDs = uniq(in.projectIDs)
		}
		if in.setCover {
			p.CoverImage = in.coverImage
		}
		if in.setSeo {
			p.Seo = in.seo
		}
		return p
	})
}

// existingProjectIDs are the ids among ids that name a live project.
func (r *repo) existingProjectIDs(ctx context.Context, ids []string) (map[string]bool, error) {
	itemKeys := make([]data.Item, len(ids))
	for i, id := range ids {
		itemKeys[i] = data.Key(keys.ProjectPk(id), keys.SKMeta)
	}
	items, err := r.table.BatchGet(ctx, itemKeys, false)
	if err != nil {
		return nil, err
	}
	found := map[string]bool{}
	for _, item := range items {
		ir := store.ReadItem(item)
		ir.Literal("entityType", "project")
		id := ir.Str("projectId", 1)
		status := ir.Enum("status", statuses...)
		if err := ir.Err("Project"); err != nil {
			return nil, err
		}
		if status != store.StatusDeleted {
			found[id] = true
		}
	}
	return found, nil
}

// assertKnownProjectIDs skips ids already on the post, so deleting a
// project never blocks saving a post tagged with it.
func (r *repo) assertKnownProjectIDs(ctx context.Context, ids, existing []string) error {
	var check []string
	for _, id := range uniq(ids) {
		if !slices.Contains(existing, id) {
			check = append(check, id)
		}
	}
	if len(check) == 0 {
		return nil
	}
	found, err := r.existingProjectIDs(ctx, check)
	if err != nil {
		return err
	}
	var unknown []string
	for _, id := range check {
		if !found[id] {
			unknown = append(unknown, id)
		}
	}
	if len(unknown) > 0 {
		return api.BadRequest("Unknown project id: "+strings.Join(unknown, ", "), map[string]string{"projectIds": "unknown_project"})
	}
	return nil
}
