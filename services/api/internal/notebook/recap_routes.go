package notebook

import (
	"context"
	"net/http"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

// RecapTag marks a recap note; the web app reads it with the placeholder
// body to know a recap is still being written.
const RecapTag = "recap"

// RecapRoutes start weekly recaps; starter is nil where none can run.
func RecapRoutes(table *data.Table, starter RecapStarter, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	h := recapHandlers{
		notes: newNotesRepo(table, now), areas: &areasRepo{table: table, now: now},
		table: table, starter: starter, now: now,
	}
	return []api.Route{{
		Method: http.MethodPost, Pattern: "/notebook/recaps/weekly", Auth: api.Notebook,
		Metric: "CreateWeeklyRecap", Handler: h.createWeekly,
	}}
}

type recapHandlers struct {
	notes   *notesRepo
	areas   *areasRepo
	table   *data.Table
	starter RecapStarter
	now     func() time.Time
}

func monday(s string) string {
	if code := calendarDay(s); code != "" {
		return code
	}
	if t, _ := ParseCalendarDay(s); t.Weekday() != time.Monday {
		return api.CodeCustom
	}
	return ""
}

// RecapTitle is the recap note's title: "Week of Oct 26, 2026".
func RecapTitle(weekStart string) string {
	t, _ := ParseCalendarDay(weekStart)
	return "Week of " + t.Format("Jan 2, 2006")
}

func (h recapHandlers) createWeekly(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	id, _ := v.ULID("id", true)
	area, _ := v.String("area", true, false, AreaRule)
	weekStart, _ := v.String("weekStart", true, false, monday)
	if err := v.Err(); err != nil {
		return nil, err
	}
	if h.starter == nil {
		return nil, &api.ServiceUnavailableError{Message: "Weekly recaps are not set up here"}
	}
	if _, err := h.areas.require(ctx, r.UserID(), area); err != nil {
		return nil, err
	}
	now := h.now()
	ok, err := store.TryIncrement(ctx, h.table, keys.RateNotebookRecapUserPk(r.UserID()), keys.RateDaySk(now),
		contract.Data.API.NotebookRecapsPerUserPerDay, keys.TTLEndOfUTCDay(now))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, &api.RateLimitedError{Message: "Too many recaps today. Try again tomorrow."}
	}
	n, err := h.notes.create(ctx, r.UserID(), createNoteInput{
		id: id, area: area, noteType: "page", title: RecapTitle(weekStart),
		body: contract.Data.Notebook.WeeklyRecapPendingMarkdown, tags: []string{RecapTag},
	})
	if err != nil {
		return nil, err
	}
	if n.Version == 1 && n.BodyMarkdown == contract.Data.Notebook.WeeklyRecapPendingMarkdown {
		job := RecapJob{UserID: r.UserID(), NoteID: n.ID, Area: area, WeekStart: weekStart}
		if err := h.starter.StartRecap(ctx, job); err != nil {
			if r.Log != nil {
				r.Log.Error("weekly recap did not start", "error", err)
			}
			if n, err = (&Recapper{notes: h.notes}).Finish(ctx, job, RecapFailedMarkdown); err != nil {
				return nil, err
			}
		}
	}
	return noteResponse(http.StatusCreated, n)
}
