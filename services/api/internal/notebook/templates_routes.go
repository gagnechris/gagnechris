package notebook

import (
	"context"
	"net/http"
	"slices"
	"strconv"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

func templateResponse(t DailyTemplate) *api.Response {
	return api.JSONWithETag(http.StatusOK, t, t.Version)
}

func (h handlers) getTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	area, err := areaParam(r)
	if err != nil {
		return nil, err
	}
	t, err := h.templates.get(ctx, r.UserID(), area)
	if err != nil {
		return nil, err
	}
	return templateResponse(t), nil
}

func (h handlers) updateTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version := bodyVersion(v)
	body, ok := v.String("bodyMarkdown", true, false)
	nb := contract.Data.Notebook
	if ok {
		switch {
		case len(body) > nb.DailyTemplateMaxBytes:
			v.FailWith("bodyMarkdown", api.CodeTooBig, "Template is over the "+strconv.Itoa(nb.DailyTemplateMaxBytes/1000)+" KB limit")
		case DailyTemplateHasTasks(body):
			v.FailWith("bodyMarkdown", api.CodeCustom, nb.DailyTemplateTaskMessage)
		}
	}
	section, sectionSent := v.NullableString("carryOverSection")
	if section != nil && !slices.Contains(DailyTemplateHeadings(body), *section) {
		v.FailWith("carryOverSection", api.CodeCustom, nb.DailyTemplateSectionMessage)
	}
	if err := v.ErrMaybeTooLarge(); err != nil {
		return nil, err
	}
	area, err := areaParam(r)
	if err != nil {
		return nil, err
	}
	if _, err := h.areas.require(ctx, r.UserID(), area); err != nil {
		return nil, err
	}
	e, err := expected(r, version, true)
	if err != nil {
		return nil, err
	}
	t, err := h.templates.write(ctx, r.UserID(), area, templateEdit{bodyMarkdown: body, section: section, keepSection: !sectionSent}, false, e)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	return templateResponse(t), nil
}

func (h handlers) resetTemplate(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version := bodyVersion(v)
	if err := v.Err(); err != nil {
		return nil, err
	}
	area, err := areaParam(r)
	if err != nil {
		return nil, err
	}
	if _, err := h.areas.require(ctx, r.UserID(), area); err != nil {
		return nil, err
	}
	e, err := expected(r, version, true)
	if err != nil {
		return nil, err
	}
	t, err := h.templates.write(ctx, r.UserID(), area, templateEdit{}, true, e)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	return templateResponse(t), nil
}
