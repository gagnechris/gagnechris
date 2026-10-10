package posts

import (
	"context"
	"net/http"
	"time"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const (
	maxProjectIDs = 20
	maxSearch     = 200
)

// Routes are the admin posts routes.
func Routes(table *data.Table, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	h := handlers{repo: newRepo(table, now)}
	route := func(method, pattern, metric string, handler api.Handler) api.Route {
		return api.Route{Method: method, Pattern: pattern, Auth: api.SiteAdmin, Metric: metric, Handler: handler}
	}
	return []api.Route{
		route(http.MethodGet, "/admin/posts", "ListPosts", h.list),
		route(http.MethodPost, "/admin/posts", "CreatePost", h.create),
		route(http.MethodGet, "/admin/posts/:id", "GetPost", h.get),
		route(http.MethodPut, "/admin/posts/:id", "UpdatePost", h.update),
		route(http.MethodDelete, "/admin/posts/:id", "DeletePost", h.versioned((*repo).SoftDelete)),
		route(http.MethodPost, "/admin/posts/:id/publish", "PublishPost", h.versioned((*repo).Publish)),
		route(http.MethodPost, "/admin/posts/:id/unpublish", "UnpublishPost", h.versioned((*repo).Unpublish)),
		route(http.MethodPost, "/admin/posts/:id/discard", "DiscardPost", h.versioned((*repo).Discard)),
	}
}

type handlers struct{ repo *repo }

type listResponse struct {
	Items      []Summary `json:"items"`
	NextCursor string    `json:"nextCursor,omitempty"`
	Counts     *counts   `json:"counts,omitempty"`
}

func (h handlers) list(ctx context.Context, r *api.Request) (*api.Response, error) {
	v := api.NewQueryValidator(r.Query)
	status, _ := v.Enum("status", false, statuses...)
	q, _ := v.String("q", false, true, api.MaxLen(maxSearch))
	cursor, _ := v.String("cursor", false, false, api.MinLen(1))
	limit, ok := v.CoercedInt("limit", api.Positive, api.MaxInt(100))
	if err := v.ErrWith("Invalid query parameters"); err != nil {
		return nil, err
	}
	if !ok {
		limit = pageSize
	}
	page, err := h.repo.list(ctx, status, cursor, int(limit), q, store.LogCorrupt(r.Log, r.Metrics))
	if err != nil {
		return nil, err
	}
	res := listResponse{Items: page.Items, NextCursor: page.NextCursor}
	if res.Items == nil {
		res.Items = []Summary{}
	}
	if cursor == "" {
		c, err := h.repo.counts(ctx)
		if err != nil {
			return nil, err
		}
		res.Counts = &c
	}
	return api.JSON(http.StatusOK, res), nil
}

func readSeoInput(v *api.Validator) (seo *Seo, present bool) {
	sub, present := v.Object("seo", true)
	if sub == nil {
		return nil, present
	}
	seo = &Seo{}
	for key, dst := range map[string]**string{"title": &seo.Title, "description": &seo.Description, "ogImage": &seo.OgImage} {
		if s, ok := sub.String(key, false, false); ok {
			*dst = &s
		}
	}
	return seo, true
}

func (h handlers) create(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	in := createInput{title: "Untitled", tags: []string{}, projectIDs: []string{}}
	if s, ok := v.String("title", false, false, api.MinLen(1)); ok {
		in.title = s
	}
	if s, ok := v.String("slug", false, false, api.MinLen(1), api.MaxLen(maxSlugLength)); ok {
		in.slug = &s
	}
	in.excerpt, _ = v.String("excerpt", false, false)
	in.bodyMarkdown, _ = v.String("bodyMarkdown", false, false)
	if tags, ok := v.StringArray("tags", false, -1); ok {
		in.tags = tags
	}
	if ids, ok := v.StringArray("projectIds", false, maxProjectIDs, api.MinLen(1)); ok {
		in.projectIDs = ids
	}
	in.coverImage, _ = v.NullableString("coverImage")
	in.seo, _ = readSeoInput(v)
	if err := v.Err(); err != nil {
		return nil, err
	}
	if err := h.repo.assertKnownProjectIDs(ctx, in.projectIDs, nil); err != nil {
		return nil, err
	}
	post, err := h.repo.create(ctx, in)
	if err != nil {
		return nil, err
	}
	return api.JSON(http.StatusCreated, post), nil
}

func (h handlers) get(ctx context.Context, r *api.Request) (*api.Response, error) {
	post, err := h.repo.GetOrThrow(ctx, r.Params["id"])
	if err != nil {
		return nil, err
	}
	return api.JSON(http.StatusOK, post), nil
}

func strPtr(v *api.Validator, key string, rules ...api.StringRule) *string {
	if s, ok := v.String(key, false, false, rules...); ok {
		return &s
	}
	return nil
}

func (h handlers) update(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version, _ := v.Int("version", true, api.NonNegative)
	in := updateInput{
		version:      int(version),
		title:        strPtr(v, "title", api.MinLen(1)),
		slug:         strPtr(v, "slug", api.MinLen(1), api.MaxLen(maxSlugLength)),
		excerpt:      strPtr(v, "excerpt"),
		bodyMarkdown: strPtr(v, "bodyMarkdown"),
	}
	in.tags, _ = v.StringArray("tags", false, -1)
	in.projectIDs, _ = v.StringArray("projectIds", false, maxProjectIDs, api.MinLen(1))
	in.coverImage, in.setCover = v.NullableString("coverImage")
	in.seo, in.setSeo = readSeoInput(v)
	if err := v.Err(); err != nil {
		return nil, err
	}
	id := r.Params["id"]
	if len(in.projectIDs) > 0 {
		current, err := h.repo.Get(ctx, id, false)
		if err != nil {
			return nil, err
		}
		var existing []string
		if current != nil {
			existing = current.ProjectIDs
		}
		if err := h.repo.assertKnownProjectIDs(ctx, in.projectIDs, existing); err != nil {
			return nil, err
		}
	}
	post, err := h.repo.update(ctx, id, in)
	if err != nil {
		return nil, err
	}
	return api.JSON(http.StatusOK, post), nil
}

// versioned is a write that takes only body.version.
func (h handlers) versioned(mutate func(*repo, context.Context, string, int) (Post, error)) api.Handler {
	return func(ctx context.Context, r *api.Request) (*api.Response, error) {
		v, err := api.NewValidator(r.Body)
		if err != nil {
			return nil, err
		}
		version, _ := v.Int("version", true, api.NonNegative)
		if err := v.Err(); err != nil {
			return nil, err
		}
		post, err := mutate(h.repo, ctx, r.Params["id"], int(version))
		if err != nil {
			return nil, err
		}
		return api.JSON(http.StatusOK, post), nil
	}
}
