package store

import (
	"context"
	"errors"
	"net/http"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
)

// Singleton is a publishable entity with one fixed id, such as Home, seeded
// from its default on first read.
type Singleton[T any] struct {
	*PublishableStore[T]
	ID      string
	Default func() T
}

func (s *Singleton[T]) GetOrCreate(ctx context.Context) (T, error) {
	if e, err := s.Get(ctx, s.ID, false); err != nil || e != nil {
		return deref(e), err
	}
	seeded := s.Default()
	st := s.cfg.State(&seeded)
	*st = Publishable{Status: StatusDraft, UpdatedAt: s.nowISO(), Version: 1}
	created, err := s.InsertDraft(ctx, seeded)
	var conflict *api.ConflictError
	if errors.As(err, &conflict) {
		if raced, getErr := s.Get(ctx, s.ID, false); getErr != nil || raced != nil {
			return deref(raced), getErr
		}
	}
	return created, err
}

func deref[T any](e *T) T {
	if e == nil {
		var zero T
		return zero
	}
	return *e
}

func (s *Singleton[T]) loadOrCreate(ctx context.Context) (*Pair[T], error) {
	if pair, err := s.Load(ctx, s.ID, true); err != nil || pair != nil {
		return pair, err
	}
	if _, err := s.GetOrCreate(ctx); err != nil {
		return nil, err
	}
	return s.loadOrThrow(ctx, s.ID)
}

// Update applies build to the draft, seeding it first if there is none.
func (s *Singleton[T]) Update(ctx context.Context, expected int, build func(T) T) (T, error) {
	pair, err := s.Load(ctx, s.ID, true)
	if err == nil && pair == nil {
		var draft T
		if draft, err = s.GetOrCreate(ctx); err == nil {
			pair = &Pair[T]{Draft: draft}
		}
	}
	if err != nil {
		var zero T
		return zero, err
	}
	return s.MutateLoaded(ctx, pair, expected, build)
}

func (s *Singleton[T]) PublishSingleton(ctx context.Context, expected int) (T, error) {
	pair, err := s.loadOrCreate(ctx)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.PublishLoaded(ctx, pair, expected, nil)
}

func (s *Singleton[T]) UnpublishSingleton(ctx context.Context, expected int) (T, error) {
	pair, err := s.loadOrCreate(ctx)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.UnpublishLoaded(ctx, pair, expected)
}

func (s *Singleton[T]) DiscardSingleton(ctx context.Context, expected int) (T, error) {
	pair, err := s.loadOrCreate(ctx)
	if err != nil {
		var zero T
		return zero, err
	}
	return s.DiscardLoaded(ctx, pair, expected)
}

// SingletonRoutes are GET, PUT and the publish verbs on base, all
// site-admin. readUpdate checks a PUT body's entity fields and returns the
// change to apply.
func SingletonRoutes[T any](s *Singleton[T], base, metric string, readUpdate func(*api.Validator) func(T) T) []api.Route {
	route := func(method, pattern, name string, handler api.Handler) api.Route {
		return api.Route{Method: method, Pattern: pattern, Auth: api.SiteAdmin, Metric: name + metric, Handler: handler}
	}
	versioned := func(mutate func(context.Context, int) (T, error)) api.Handler {
		return func(ctx context.Context, r *api.Request) (*api.Response, error) {
			v, err := api.NewValidator(r.Body)
			if err != nil {
				return nil, err
			}
			version, _ := v.Int("version", true, api.NonNegative)
			if err := v.Err(); err != nil {
				return nil, err
			}
			e, err := mutate(ctx, int(version))
			if err != nil {
				return nil, err
			}
			return api.JSON(http.StatusOK, e), nil
		}
	}
	return []api.Route{
		route(http.MethodGet, base, "Get", func(ctx context.Context, _ *api.Request) (*api.Response, error) {
			e, err := s.GetOrCreate(ctx)
			if err != nil {
				return nil, err
			}
			return api.JSON(http.StatusOK, e), nil
		}),
		route(http.MethodPut, base, "Update", func(ctx context.Context, r *api.Request) (*api.Response, error) {
			v, err := api.NewValidator(r.Body)
			if err != nil {
				return nil, err
			}
			version, _ := v.Int("version", true, api.NonNegative)
			build := readUpdate(v)
			if err := v.Err(); err != nil {
				return nil, err
			}
			e, err := s.Update(ctx, int(version), build)
			if err != nil {
				return nil, err
			}
			return api.JSON(http.StatusOK, e), nil
		}),
		route(http.MethodPost, base+"/publish", "Publish", versioned(s.PublishSingleton)),
		route(http.MethodPost, base+"/unpublish", "Unpublish", versioned(s.UnpublishSingleton)),
		route(http.MethodPost, base+"/discard", "Discard", versioned(s.DiscardSingleton)),
	}
}
