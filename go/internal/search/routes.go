package search

import (
	"context"
	"net/http"
	"slices"
	"time"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/notebook"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const (
	scanPage = 100
	// scanCap is per type; a personal notebook stays well under it.
	scanCap      = 2000
	defaultLimit = 20
)

// Hit is NotebookSearchHitSchema, in its field order.
type Hit struct {
	Type    string  `json:"type"`
	ID      string  `json:"id"`
	Area    string  `json:"area"`
	Title   string  `json:"title"`
	Date    *string `json:"date,omitempty"`
	Status  string  `json:"status,omitempty"`
	Version *int    `json:"version,omitempty"`
	Snippet Text    `json:"snippet"`
	Matches []Range `json:"matches"`
	score   int
}

// Routes: search is a POST with a JSON body so its terms never appear in a
// URL, and so never in CloudFront or API Gateway access logs.
func Routes(table *data.Table, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	h := handler{table: table, now: now}
	return []api.Route{
		{Method: http.MethodPost, Pattern: "/notebook/search", Auth: api.Notebook, Metric: "NotebookSearch", Handler: h.search},
	}
}

type handler struct {
	table *data.Table
	now   func() time.Time
}

func (h handler) search(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	q, _ := v.String("q", true, true, api.MinLen(1), api.MaxLen(200))
	area, _ := v.Enum("area", false, notebook.Areas...)
	limit, hasLimit := v.Int("limit", false, api.Positive, api.MaxInt(50))
	if err := v.Err(); err != nil {
		return nil, err
	}
	if !hasLimit {
		limit = defaultLimit
	}

	rd := notebook.Reader{Table: h.table, OnCorrupt: store.LogCorrupt(r.Log, r.Metrics)}
	userID := r.UserID()
	notes, err := notebook.CollectPages(scanCap, func(cursor string) (store.Page[notebook.Note], error) {
		return rd.NotesPage(ctx, userID, area, cursor, scanPage)
	}, func(n notebook.Note) bool { return !n.Deleted })
	if err != nil {
		return nil, err
	}
	today := h.now().UTC().Format("2006-01-02")
	tasks, err := notebook.CollectPages(scanCap, func(cursor string) (store.Page[notebook.Task], error) {
		return rd.TasksPage(ctx, userID, area, cursor, scanPage, today)
	}, func(t notebook.Task) bool { return !t.Deleted })
	if err != nil {
		return nil, err
	}

	tasksByID := make(map[string]*notebook.Task, len(tasks))
	for i := range tasks {
		tasksByID[tasks[i].ID] = &tasks[i]
	}

	var noteHits []Hit
	for _, n := range notes {
		// Embeds match and read as the task's title, never as the raw token.
		body := notebook.ReplaceTaskEmbeds(n.BodyMarkdown, func(e notebook.TaskEmbed) string {
			if t := tasksByID[e.ID]; t != nil {
				return notebook.TaskEmbedFallbackLine(e.Indent, t)
			}
			return ""
		})
		hit, ok := rankFields(q, notebook.NoteDisplayTitle(n), body, n.Tags)
		if !ok {
			continue
		}
		h := Hit{Type: "note", ID: n.ID, Area: n.Area, Title: hit.title, Snippet: Text(hit.snippet), Matches: hit.matches, score: hit.score}
		if n.Type == "daily" && n.Date != nil && *n.Date != "" {
			h.Date = n.Date
		}
		noteHits = append(noteHits, h)
	}

	var taskHits []Hit
	for _, t := range tasks {
		hit, ok := rankFields(q, t.Title, t.Description, t.Tags)
		if !ok {
			continue
		}
		version := t.Version
		taskHits = append(taskHits, Hit{
			Type: "task", ID: t.ID, Area: t.Area, Title: hit.title, Status: t.Status, Version: &version,
			Snippet: Text(hit.snippet), Matches: hit.matches, score: hit.score,
		})
	}

	return api.JSON(http.StatusOK, map[string][]Hit{
		"notes": top(noteHits, int(limit)),
		"tasks": top(taskHits, int(limit)),
	}), nil
}

func top(hits []Hit, limit int) []Hit {
	slices.SortStableFunc(hits, func(a, b Hit) int { return b.score - a.score })
	if len(hits) > limit {
		hits = hits[:limit]
	}
	if hits == nil {
		hits = []Hit{}
	}
	return hits
}
