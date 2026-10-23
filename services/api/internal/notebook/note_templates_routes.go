package notebook

import (
	"context"
	"net/http"
	"strconv"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

func noteTemplateResponse(status int, t NoteTemplate) (*api.Response, error) {
	if err := checkNoteTemplate(t); err != nil {
		return nil, err
	}
	return api.JSONWithETag(status, t, t.Version), nil
}

func noteTemplateName(v *api.Validator, required bool) (string, bool) {
	return v.String("name", required, true, api.MinLen(1), api.MaxLen(contract.Data.Notebook.NoteTemplateNameMaxLength))
}

func noteTemplateBody(v *api.Validator) (string, bool) {
	s, ok := v.String("bodyMarkdown", false, false)
	nb := contract.Data.Notebook
	switch {
	case !ok:
	case len(s) > nb.NoteTemplateMaxBytes:
		v.FailWith("bodyMarkdown", api.CodeTooBig, "Template is over the "+strconv.Itoa(nb.NoteTemplateMaxBytes/1000)+" KB limit")
	case len(FindTaskEmbeds(s)) > 0:
		v.FailWith("bodyMarkdown", api.CodeCustom, nb.NoteTemplateEmbedMessage)
	}
	return s, ok
}

// noteTemplateArea reads the template's area: null for every area, else one
// of the user's areas.
func (h handlers) noteTemplateArea(ctx context.Context, r *api.Request, v *api.Validator) (area *string, present bool, err error) {
	area, present = v.NullableString("area", AreaRule)
	if err := v.ErrMaybeTooLarge(); err != nil {
		return nil, false, err
	}
	if area != nil {
		if _, err := h.areas.require(ctx, r.UserID(), *area); err != nil {
			return nil, false, err
		}
	}
	return area, present, nil
}

func (h handlers) listNoteTemplates(ctx context.Context, r *api.Request) (*api.Response, error) {
	items, err := h.noteTemplates.list(ctx, r.UserID(), store.LogCorrupt(r.Log, r.Metrics))
	if err != nil {
		return nil, err
	}
	areas, err := h.areas.get(ctx, r.UserID())
	if err != nil {
		return nil, err
	}
	// A removed area's templates show in every area rather than in none.
	for i, t := range items {
		if t.Area != nil && !areas.Has(*t.Area) {
			items[i].Area = nil
		}
	}
	return listResponse(store.Page[NoteTemplate]{Items: items}, checkNoteTemplate)
}

func (h handlers) createNoteTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	id, _ := v.ULID("id", true)
	name, _ := noteTemplateName(v, true)
	body, _ := noteTemplateBody(v)
	area, _, err := h.noteTemplateArea(ctx, r, v)
	if err != nil {
		return nil, err
	}
	t, err := h.noteTemplates.create(ctx, r.UserID(), id, name, area, body)
	if err != nil {
		return nil, err
	}
	return noteTemplateResponse(http.StatusCreated, t)
}

func (h handlers) getNoteTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	id, err := idParam(r)
	if err != nil {
		return nil, err
	}
	t, err := h.noteTemplates.getOrThrow(ctx, r.UserID(), id)
	if err != nil {
		return nil, err
	}
	return noteTemplateResponse(http.StatusOK, t.NoteTemplate)
}

func (h handlers) updateNoteTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version := bodyVersion(v)
	name := optStr(noteTemplateName(v, false))
	body := optStr(noteTemplateBody(v))
	area, hasArea, err := h.noteTemplateArea(ctx, r, v)
	if err != nil {
		return nil, err
	}
	id, err := idParam(r)
	if err != nil {
		return nil, err
	}
	e, err := expected(r, version, true)
	if err != nil {
		return nil, err
	}
	t, err := h.noteTemplates.update(ctx, r.UserID(), id, e, name, body, area, hasArea)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	return noteTemplateResponse(http.StatusOK, t)
}

func (h handlers) deleteNoteTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	id, e, err := versionOnly(r)
	if err != nil {
		return nil, err
	}
	if err := h.noteTemplates.delete(ctx, r.UserID(), id, e); err != nil {
		return nil, e.IfMatchConflict(err)
	}
	return &api.Response{Status: http.StatusNoContent}, nil
}
