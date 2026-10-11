package projects

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/oklog/ulid/v2"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

// listMax caps each status: projects are a short hand-curated list that
// one admin page holds.
const listMax = 500

type repo struct {
	*store.PublishableStore[Project]
	now func() time.Time
}

// Routes are the admin projects routes.
func Routes(table *data.Table, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	r := &repo{now: now}
	r.PublishableStore = store.NewPublishableStore(store.PublishableConfig[Project]{
		Label: label,
		Keys: func(id string) store.PublishKeys {
			return store.PublishKeys{PK: keys.ProjectPk(id), MetaSK: keys.SKMeta, PublishedSK: keys.SKPublished}
		},
		ID:              func(p *Project) string { return p.ID },
		State:           func(p *Project) *store.Publishable { return &p.Publishable },
		Parse:           parseProject,
		MetaItem:        metaItem,
		PublishedItem:   publishedItem,
		ContentEqual:    contentEqual,
		Slug:            func(p Project) string { return p.Slug },
		SlugClaims:      slugClaims,
		PublishedIDSet:  "projectIds",
		ValidatePublish: validatePublish,
	}, table, now)
	route := func(method, pattern, metric string, handler api.Handler) api.Route {
		return api.Route{Method: method, Pattern: pattern, Auth: api.SiteAdmin, Metric: metric, Handler: handler}
	}
	return []api.Route{
		route(http.MethodGet, "/admin/projects", "ListProjects", r.list),
		route(http.MethodPost, "/admin/projects", "CreateProject", r.create),
		route(http.MethodGet, "/admin/projects/:id", "GetProject", r.get),
		route(http.MethodPut, "/admin/projects/:id", "UpdateProject", r.update),
		route(http.MethodDelete, "/admin/projects/:id", "DeleteProject", r.versioned((*repo).SoftDelete)),
		route(http.MethodPost, "/admin/projects/:id/publish", "PublishProject", r.versioned((*repo).Publish)),
		route(http.MethodPost, "/admin/projects/:id/unpublish", "UnpublishProject", r.versioned((*repo).Unpublish)),
		route(http.MethodPost, "/admin/projects/:id/discard", "DiscardProject", r.versioned((*repo).Discard)),
	}
}

// idParam is UlidSchema, which uppercases before matching.
func idParam(r *api.Request) (string, error) {
	v := api.NewQueryValidator(map[string]string{"id": strings.ToUpper(r.Params["id"])})
	id, _ := v.String("id", true, false, api.Matches(ulidPattern))
	return id, v.ErrWith("Invalid path parameters")
}

func ok(status int, p Project, err error) (*api.Response, error) {
	if err != nil {
		return nil, err
	}
	return api.JSON(status, p), nil
}

var byName = collate.New(language.Und)

// sortByOrder is sortProjectsByOrder: order, then name and id as
// localeCompare orders them.
func sortByOrder(ps []Project) {
	slices.SortStableFunc(ps, func(a, b Project) int {
		if a.Order != b.Order {
			return a.Order - b.Order
		}
		if c := byName.CompareString(a.Name, b.Name); c != 0 {
			return c
		}
		return byName.CompareString(a.ID, b.ID)
	})
}

func (r *repo) queryStatus(ctx context.Context, status string, onCorrupt func(*api.DataIntegrityError)) ([]Project, error) {
	pk := keys.ProjectStatusGSI1Pk(status)
	spec := store.ListSpec[row]{
		Parse:      parse,
		ID:         func(row row) string { return row.ID },
		Status:     func(row row) string { return row.Status },
		StoredFlag: func(row row) *bool { return row.storedFlag },
	}
	out := []Project{}
	cursor := ""
	for {
		page, flags, err := store.QueryListPage(ctx, r.PublishableStore, store.PageQuery{
			Input: dynamodb.QueryInput{
				IndexName:                 aws.String("gsi1"),
				KeyConditionExpression:    aws.String("gsi1pk = :pk"),
				ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
			},
			Cursor:     cursor,
			CursorKeys: store.GSI1CursorKeys,
		}, spec, onCorrupt)
		if err != nil {
			return nil, err
		}
		for i, row := range page.Items {
			p := row.Project
			p.HasUnpublishedChanges = flags[i]
			out = append(out, p)
		}
		cursor = page.NextCursor
		if cursor == "" || len(out) >= listMax {
			return out, nil
		}
	}
}

type listResponse struct {
	Items []Project `json:"items"`
}

func (r *repo) list(ctx context.Context, req *api.Request) (*api.Response, error) {
	v := api.NewQueryValidator(req.Query)
	status, _ := v.Enum("status", false, store.StatusDraft, store.StatusPublished)
	if err := v.ErrWith("Invalid query parameters"); err != nil {
		return nil, err
	}
	statuses := []string{store.StatusPublished, store.StatusDraft}
	if status != "" {
		statuses = []string{status}
	}
	res := listResponse{Items: []Project{}}
	for _, s := range statuses {
		ps, err := r.queryStatus(ctx, s, store.LogCorrupt(req.Log, req.Metrics))
		if err != nil {
			return nil, err
		}
		kept := ps[:0]
		for _, p := range ps {
			if p.Status == s {
				kept = append(kept, p)
			}
		}
		sortByOrder(kept)
		res.Items = append(res.Items, kept...)
	}
	return api.JSON(http.StatusOK, res), nil
}

type input struct {
	name, slug, pitch, stage, stageNote, bodyMarkdown *string
	stack                                             []string
	links                                             []Link
	setPreviewImage, setDemo, setHref                 bool
	previewImage, demo, href                          *string
	order                                             *int
}

// readInput checks ProjectInputFieldsSchema; with create, name is required.
func readInput(v *api.Validator, create bool) input {
	var in input
	str := func(key string, required, trim bool, rules ...api.StringRule) *string {
		if s, ok := v.String(key, required, trim, rules...); ok {
			return &s
		}
		return nil
	}
	in.name = str("name", create, true, api.MinLen(1), api.MaxLen(limits.ProjectNameMaxLength))
	in.slug = str("slug", false, false, api.MinLen(1), api.MaxLen(store.MaxSlugLength))
	in.pitch = str("pitch", false, false, api.MaxLen(limits.ProjectPitchMaxLength))
	if s, ok := v.Enum("stage", false, stages...); ok {
		in.stage = &s
	}
	in.stageNote = str("stageNote", false, false, api.MaxLen(limits.ProjectStageNoteMaxLength))
	in.previewImage, in.setPreviewImage = v.NullableString("previewImage", previewImageRules()...)
	in.bodyMarkdown = str("bodyMarkdown", false, false)
	if stack, ok := v.StringArray("stack", false, true, limits.ProjectStackMax, api.MinLen(1), api.MaxLen(limits.ProjectStackItemMaxLength)); ok {
		in.stack = stack
	}
	if links, ok := readLinks(v, "links", false, limits.ProjectLinksMax); ok {
		in.links = links
	}
	in.demo, in.setDemo = v.NullableEnum("demo", limits.ProjectDemoIDs...)
	if n, ok := v.Int("order", false, api.MinInt(0), api.MaxInt(limits.ProjectOrderMax)); ok {
		o := int(n)
		in.order = &o
	}
	in.href, in.setHref = v.NullableString("href", api.Refine(safeHref(limits.ProjectHrefSchemes)))
	return in
}

func or[T any](p *T, fallback T) T {
	if p != nil {
		return *p
	}
	return fallback
}

func (r *repo) create(ctx context.Context, req *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(req.Body)
	if err != nil {
		return nil, err
	}
	in := readInput(v, true)
	if err := v.Err(); err != nil {
		return nil, err
	}
	name := api.TrimJS(*in.name)
	slugSource := name
	if in.slug != nil && api.TrimJS(*in.slug) != "" {
		slugSource = api.TrimJS(*in.slug)
	}
	links := in.links
	if links == nil {
		links = []Link{}
	}
	p, err := r.InsertDraft(ctx, Project{
		ID:           ulid.Make().String(),
		Slug:         store.Slugify(slugSource),
		Name:         name,
		Pitch:        or(in.pitch, ""),
		Stage:        or(in.stage, "idea"),
		StageNote:    or(in.stageNote, ""),
		PreviewImage: in.previewImage,
		BodyMarkdown: or(in.bodyMarkdown, ""),
		Stack:        normalizeStack(in.stack),
		Links:        links,
		Demo:         in.demo,
		Order:        or(in.order, 0),
		Href:         in.href,
		Publishable: store.Publishable{
			Status:    store.StatusDraft,
			UpdatedAt: store.ISOTime(r.now()),
			Version:   1,
		},
	})
	return ok(http.StatusCreated, p, err)
}

func (r *repo) get(ctx context.Context, req *api.Request) (*api.Response, error) {
	id, err := idParam(req)
	if err != nil {
		return nil, err
	}
	p, err := r.GetOrThrow(ctx, id)
	return ok(http.StatusOK, p, err)
}

func (r *repo) update(ctx context.Context, req *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(req.Body)
	if err != nil {
		return nil, err
	}
	version, _ := v.Int("version", true, api.NonNegative)
	in := readInput(v, false)
	if err := v.Err(); err != nil {
		return nil, err
	}
	id, err := idParam(req)
	if err != nil {
		return nil, err
	}
	p, err := r.Mutate(ctx, id, int(version), func(p Project) Project {
		if in.name != nil {
			p.Name = api.TrimJS(*in.name)
		}
		if in.slug != nil && *in.slug != "" {
			p.Slug = store.Slugify(*in.slug)
		}
		p.Pitch = or(in.pitch, p.Pitch)
		p.Stage = or(in.stage, p.Stage)
		p.StageNote = or(in.stageNote, p.StageNote)
		if in.setPreviewImage {
			p.PreviewImage = in.previewImage
		}
		p.BodyMarkdown = or(in.bodyMarkdown, p.BodyMarkdown)
		if in.stack != nil {
			p.Stack = normalizeStack(in.stack)
		}
		if in.links != nil {
			p.Links = in.links
		}
		if in.setDemo {
			p.Demo = in.demo
		}
		p.Order = or(in.order, p.Order)
		if in.setHref {
			p.Href = in.href
		}
		return p
	})
	return ok(http.StatusOK, p, err)
}

// versioned is a write that takes only body.version.
func (r *repo) versioned(mutate func(*repo, context.Context, string, int) (Project, error)) api.Handler {
	return func(ctx context.Context, req *api.Request) (*api.Response, error) {
		v, err := api.NewValidator(req.Body)
		if err != nil {
			return nil, err
		}
		version, _ := v.Int("version", true, api.NonNegative)
		if err := v.Err(); err != nil {
			return nil, err
		}
		id, err := idParam(req)
		if err != nil {
			return nil, err
		}
		p, err := mutate(r, ctx, id, int(version))
		return ok(http.StatusOK, p, err)
	}
}
