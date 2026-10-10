// Package posts serves the admin posts routes, writing the rows
// services/api/src/posts writes, so the publisher's stream handler sees
// the same items from either API.
package posts

import (
	"regexp"
	"slices"
	"strings"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

type Post struct {
	ID           string     `json:"id"`
	Slug         string     `json:"slug"`
	Title        string     `json:"title"`
	Excerpt      string     `json:"excerpt"`
	BodyMarkdown string     `json:"bodyMarkdown"`
	Tags         []string   `json:"tags"`
	ProjectIDs   []string   `json:"projectIds"`
	CoverImage   *string    `json:"coverImage"`
	Seo          *store.Seo `json:"seo"`
	store.Publishable
}

// Summary is a list row: everything but the content, which only the editor
// needs.
type Summary struct {
	ID         string   `json:"id"`
	Slug       string   `json:"slug"`
	Title      string   `json:"title"`
	Tags       []string `json:"tags"`
	ProjectIDs []string `json:"projectIds"`
	store.Publishable
}

// listRow is a summary as stored: the flag is absent on rows saved before
// it was.
type listRow struct {
	ID                    string   `json:"id"`
	Slug                  string   `json:"slug"`
	Title                 string   `json:"title"`
	Tags                  []string `json:"tags"`
	ProjectIDs            []string `json:"projectIds"`
	Status                string   `json:"status"`
	PublishedAt           *string  `json:"publishedAt"`
	UpdatedAt             string   `json:"updatedAt"`
	Version               int      `json:"version"`
	HasUnpublishedChanges *bool    `json:"hasUnpublishedChanges,omitempty"`
}

const label = "Post"

var statuses = []string{store.StatusDraft, store.StatusPublished, store.StatusDeleted}

func statusGSI1Pk(status string) string { return "STATUS#" + status }

func statusGSI1Sk(sortTS, id string) string { return "TS#" + sortTS + "#POST#" + id }

func tagPk(tag string) string { return "TAG#" + tag }

func tagSk(publishedAt, id string) string { return "TS#" + publishedAt + "#POST#" + id }

func slugClaimKey(slug string) data.Item { return data.Key("SLUG#"+slug, "POST") }

func slugRedirectKey(slug string) data.Item { return data.Key("SLUG#"+slug, "REDIRECT") }

var slugClaims = &store.SlugClaims{
	ClaimKey:           slugClaimKey,
	RedirectKey:        slugRedirectKey,
	OwnerAttr:          "postId",
	ClaimEntityType:    "slug",
	RedirectEntityType: "slugRedirect",
}

// parseMeta reads a META or PUBLISHED row as PostMetaItemSchema does.
func parseMeta(item data.Item) (Post, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "post")
	p := Post{
		ID:           r.Str("postId", 1),
		Slug:         r.Str("slug", 1),
		Title:        r.Str("title", 0),
		Excerpt:      r.Str("excerpt", 0),
		BodyMarkdown: r.Str("bodyMarkdown", 0),
		Tags:         r.StrList("tags"),
		ProjectIDs:   r.OptStrList("projectIds"),
		CoverImage:   r.OptStr("coverImage", 0),
		Seo:          store.ReadSeo(r),
		Publishable: store.Publishable{
			Status:      r.Enum("status", statuses...),
			PublishedAt: r.OptStr("publishedAt", 0),
			UpdatedAt:   r.Str("updatedAt", 1),
			Version:     r.NonNegativeInt("version"),
		},
	}
	r.OptBool("hasUnpublishedChanges")
	r.OptStr("gsi1pk", 1)
	r.OptStr("gsi1sk", 1)
	return p, r.Err(label)
}

// summaryAttributes are PostSummaryItemSchema's keys, read with a
// projection.
var summaryAttributes = []string{
	"pk", "sk", "entityType", "postId", "slug", "title", "tags", "projectIds",
	"status", "publishedAt", "updatedAt", "version", "hasUnpublishedChanges", "gsi1pk", "gsi1sk",
}

func parseSummary(item data.Item) (listRow, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "post")
	row := listRow{
		ID:                    r.Str("postId", 1),
		Slug:                  r.Str("slug", 1),
		Title:                 r.Str("title", 0),
		Tags:                  r.StrList("tags"),
		ProjectIDs:            r.OptStrList("projectIds"),
		Status:                r.Enum("status", statuses...),
		PublishedAt:           r.OptStr("publishedAt", 0),
		UpdatedAt:             r.Str("updatedAt", 1),
		Version:               r.NonNegativeInt("version"),
		HasUnpublishedChanges: r.OptBool("hasUnpublishedChanges"),
	}
	r.OptStr("gsi1pk", 1)
	r.OptStr("gsi1sk", 1)
	return row, r.Err(label)
}

func baseItem(p Post) data.Item {
	item := data.Key(keys.PostPk(p.ID), keys.SKMeta)
	item["entityType"] = data.S("post")
	item["postId"] = data.S(p.ID)
	item["slug"] = data.S(p.Slug)
	item["title"] = data.S(p.Title)
	item["excerpt"] = data.S(p.Excerpt)
	item["bodyMarkdown"] = data.S(p.BodyMarkdown)
	item["tags"] = data.StrList(p.Tags)
	item["projectIds"] = data.StrList(p.ProjectIDs)
	item["status"] = data.S(p.Status)
	item["publishedAt"] = data.OptS(p.PublishedAt)
	item["updatedAt"] = data.S(p.UpdatedAt)
	item["coverImage"] = data.OptS(p.CoverImage)
	item["seo"] = data.Null
	if p.Seo != nil {
		item["seo"] = data.M(store.SeoItem(p.Seo))
	}
	item["version"] = data.N(int64(p.Version))
	return item
}

// metaItem is buildMetaItem: published rows sort by publishedAt, others by
// updatedAt.
func metaItem(p Post) data.Item {
	item := baseItem(p)
	sortTS := p.UpdatedAt
	if p.Status == store.StatusPublished && p.PublishedAt != nil {
		sortTS = *p.PublishedAt
	}
	item["hasUnpublishedChanges"] = data.Bool(p.HasUnpublishedChanges)
	item["gsi1pk"] = data.S(statusGSI1Pk(p.Status))
	item["gsi1sk"] = data.S(statusGSI1Sk(sortTS, p.ID))
	return item
}

// publishedItem has no GSI1 keys, so admin STATUS# queries only return
// draft META rows.
func publishedItem(p Post) data.Item {
	publishedAt := p.UpdatedAt
	if p.PublishedAt != nil {
		publishedAt = *p.PublishedAt
	}
	p.Status = store.StatusPublished
	p.PublishedAt = &publishedAt
	item := baseItem(p)
	item["sk"] = data.S(keys.SKPublished)
	return item
}

func contentEqual(a, b Post) bool {
	return a.Slug == b.Slug && a.Title == b.Title && a.Excerpt == b.Excerpt &&
		a.BodyMarkdown == b.BodyMarkdown && slices.Equal(a.Tags, b.Tags) &&
		slices.Equal(a.ProjectIDs, b.ProjectIDs) && store.OptEqual(a.CoverImage, b.CoverImage) &&
		store.SeoEqual(a.Seo, b.Seo)
}

var whitespaceRun = regexp.MustCompile(`[\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+`)

// normalizeTags lowercases, hyphenates whitespace and drops blanks and
// repeats, keeping first-seen order.
func normalizeTags(tags []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, raw := range tags {
		t := whitespaceRun.ReplaceAllString(store.JSLower(api.TrimJS(raw)), "-")
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

// uniq keeps first-seen order, as [...new Set(ids)] does.
func uniq(ids []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// matchesQuery is postMatchesQuery: a case-insensitive substring of the
// title, slug or a tag.
func matchesQuery(row listRow, query string) bool {
	needle := store.JSLower(api.TrimJS(query))
	if needle == "" {
		return true
	}
	if strings.Contains(store.JSLower(row.Title), needle) || strings.Contains(store.JSLower(row.Slug), needle) {
		return true
	}
	for _, t := range row.Tags {
		if strings.Contains(store.JSLower(t), needle) {
			return true
		}
	}
	return false
}
