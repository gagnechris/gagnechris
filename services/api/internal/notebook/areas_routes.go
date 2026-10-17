package notebook

import (
	"context"
	"errors"
	"net/http"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
)

func areasResponse(a Areas) *api.Response {
	return api.JSONWithETag(http.StatusOK, a, a.Version)
}

func (h handlers) getAreas(ctx context.Context, r *api.Request) (*api.Response, error) {
	a, err := h.areas.get(ctx, r.UserID())
	if err != nil {
		return nil, err
	}
	return areasResponse(a), nil
}

func (h handlers) updateAreas(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version := bodyVersion(v)
	list := readAreaList(v)
	if err := v.Err(); err != nil {
		return nil, err
	}
	e, err := expected(r, version, true)
	if err != nil {
		return nil, err
	}
	a, err := h.areas.write(ctx, r.UserID(), list, e)
	var conflict *api.ConflictError
	if errors.As(err, &conflict) && conflict.Code == api.CodeVersionConflict {
		err = e.IfMatchConflict(err)
	}
	if err != nil {
		return nil, err
	}
	return areasResponse(a), nil
}
