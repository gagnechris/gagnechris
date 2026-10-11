// Package projects serves the admin projects routes, writing the rows the
// @gagnechris/data builders define.
package projects

import (
	"regexp"
	"slices"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const label = "Project"

var (
	limits = contract.Data.Limits
	stages = []string{"idea", "building", "live"}
)

type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type Project struct {
	ID           string   `json:"id"`
	Slug         string   `json:"slug"`
	Name         string   `json:"name"`
	Pitch        string   `json:"pitch"`
	Stage        string   `json:"stage"`
	StageNote    string   `json:"stageNote"`
	PreviewImage *string  `json:"previewImage"`
	BodyMarkdown string   `json:"bodyMarkdown"`
	Stack        []string `json:"stack"`
	Links        []Link   `json:"links"`
	Demo         *string  `json:"demo"`
	Order        int      `json:"order"`
	Href         *string  `json:"href"`
	store.Publishable
}

var slugClaims = &store.SlugClaims{
	ClaimKey:           func(slug string) data.Item { return data.Key(keys.ProjectSlugPk(slug), keys.ProjectSlugClaimSk()) },
	RedirectKey:        func(slug string) data.Item { return data.Key(keys.ProjectSlugPk(slug), keys.SlugRedirectSk()) },
	OwnerAttr:          "projectId",
	ClaimEntityType:    "projectSlug",
	RedirectEntityType: "projectSlugRedirect",
}

// readLinks checks z.array(ProjectLinkSchema) at key; labels come back
// trimmed.
func readLinks(v *api.Validator, key string, required bool, maxItems int) ([]Link, bool) {
	links := []Link{}
	ok := v.ObjectArray(key, required, maxItems, func(lv *api.Validator) {
		l, _ := lv.String("label", true, true, api.MinLen(1), api.MaxLen(limits.ProjectLinkLabelMaxLength))
		u, _ := lv.String("url", true, false, api.Refine(safeHref(limits.PostLinkSchemes)))
		links = append(links, Link{Label: l, URL: u})
	})
	return links, ok
}

func parse(item data.Item) (row, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "project")
	p := Project{
		ID:           r.Str("projectId", 1),
		Slug:         r.Str("slug", 1),
		Name:         r.Str("name", 1),
		Pitch:        r.Str("pitch", 0),
		Stage:        r.Enum("stage", stages...),
		StageNote:    r.Str("stageNote", 0),
		PreviewImage: r.NullStr("previewImage", 0),
		BodyMarkdown: r.Str("bodyMarkdown", 0),
		Stack:        r.StrList("stack"),
		Demo:         r.NullEnum("demo", limits.ProjectDemoIDs...),
		Order:        r.NonNegativeInt("order"),
		Href:         r.NullStr("href", 0),
		Publishable:  r.Publishable(),
	}
	if links, ok := r.Checked("links", func(v *api.Validator) any {
		links, ok := readLinks(v, "links", true, -1)
		if !ok {
			return nil
		}
		return links
	}).([]Link); ok {
		p.Links = links
	}
	flag := r.OptBool("hasUnpublishedChanges")
	r.OptStr("gsi1pk", 1)
	r.OptStr("gsi1sk", 1)
	return row{Project: p, storedFlag: flag}, r.Err(label)
}

// row is a stored project with its stored unpublished flag, absent on rows
// written before the flag was stored.
type row struct {
	Project
	storedFlag *bool
}

func parseProject(item data.Item) (Project, error) {
	r, err := parse(item)
	return r.Project, err
}

func linksItem(links []Link) types.AttributeValue {
	l := make([]any, len(links))
	for i, link := range links {
		l[i] = map[string]any{"label": link.Label, "url": link.URL}
	}
	return data.FromJSON(l)
}

func baseItem(p Project) data.Item {
	item := data.Key(keys.ProjectPk(p.ID), keys.SKMeta)
	item["entityType"] = data.S("project")
	item["projectId"] = data.S(p.ID)
	item["slug"] = data.S(p.Slug)
	item["name"] = data.S(p.Name)
	item["pitch"] = data.S(p.Pitch)
	item["stage"] = data.S(p.Stage)
	item["stageNote"] = data.S(p.StageNote)
	item["previewImage"] = data.OptS(p.PreviewImage)
	item["bodyMarkdown"] = data.S(p.BodyMarkdown)
	item["stack"] = data.StrList(p.Stack)
	item["links"] = linksItem(p.Links)
	item["demo"] = data.OptS(p.Demo)
	item["order"] = data.N(int64(p.Order))
	item["href"] = data.OptS(p.Href)
	item["status"] = data.S(p.Status)
	item["publishedAt"] = data.OptS(p.PublishedAt)
	item["updatedAt"] = data.S(p.UpdatedAt)
	item["version"] = data.N(int64(p.Version))
	return item
}

func metaItem(p Project) data.Item {
	item := baseItem(p)
	item["hasUnpublishedChanges"] = data.Bool(p.HasUnpublishedChanges)
	item["gsi1pk"] = data.S(keys.ProjectStatusGSI1Pk(p.Status))
	item["gsi1sk"] = data.S(keys.ProjectOrderGSI1Sk(p.Order, p.ID))
	return item
}

// publishedItem has no GSI1 keys, so the published-projects query only
// returns META rows.
func publishedItem(p Project) data.Item {
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

func contentEqual(a, b Project) bool {
	return a.Slug == b.Slug && a.Name == b.Name && a.Pitch == b.Pitch && a.Stage == b.Stage &&
		a.StageNote == b.StageNote && store.OptEqual(a.PreviewImage, b.PreviewImage) &&
		a.BodyMarkdown == b.BodyMarkdown && slices.Equal(a.Stack, b.Stack) && slices.Equal(a.Links, b.Links) &&
		store.OptEqual(a.Demo, b.Demo) && a.Order == b.Order && store.OptEqual(a.Href, b.Href)
}

// validatePublish is projectPublishFieldErrors: a demo needs a preview
// image.
func validatePublish(p Project) error {
	if p.Demo != nil && *p.Demo != "" && (p.PreviewImage == nil || api.TrimJS(*p.PreviewImage) == "") {
		return api.BadRequest("A project with a demo needs a preview image before it is published",
			map[string]string{"previewImage": "required_with_demo"})
	}
	return nil
}

// normalizeStack trims and drops blanks and repeats, keeping first-seen
// order.
func normalizeStack(stack []string) []string {
	out := []string{}
	for _, s := range stack {
		if s = api.TrimJS(s); s != "" && !slices.Contains(out, s) {
			out = append(out, s)
		}
	}
	return out
}

var (
	// JavaScript's \s, unlike RE2's, is Unicode whitespace.
	previewImagePattern = regexp.MustCompile(`^/media/[^\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}?#\\]+$`)
	ulidPattern         = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)
)

func previewImageRules() []api.StringRule {
	return []api.StringRule{
		api.Matches(previewImagePattern),
		api.Refine(func(s string) bool { return !slices.Contains(strings.Split(s, "/"), "..") }),
	}
}
