package search

import (
	"context"
	"net/http"
	"slices"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/notebook"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

const (
	scanPage = 100
	// scanCap is per type. Notes are read newest first and open tasks before
	// done ones, so what a full notebook leaves unread is the oldest.
	scanCap      = 2000
	defaultLimit = 20
)

// scanByteCap bounds the text read per type, so a notebook of long notes
// stops well inside the Lambda's memory and time.
var scanByteCap = 16_000_000

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
	q, _ := v.String("q", true, true, api.MinLen(1), api.MaxLen(contract.Data.Notebook.SearchMaxLength))
	area, _ := v.String("area", false, false, notebook.AreaRule)
	limit, hasLimit := v.Int("limit", false, api.Positive, api.MaxInt(contract.Data.Notebook.SearchLimitMax))
	if err := v.Err(); err != nil {
		return nil, err
	}
	if !hasLimit {
		limit = defaultLimit
	}

	rd := notebook.Reader{Table: h.table, OnCorrupt: store.LogCorrupt(r.Log, r.Metrics)}
	userID := r.UserID()
	areas := []string{area}
	if area == "" {
		if areas, err = rd.AreaIDs(ctx, userID); err != nil {
			return nil, err
		}
	}
	var noteSources []source[notebook.Note]
	for _, a := range areas {
		noteSources = append(noteSources, func(cursor string, limit, limitBytes int) (store.Page[notebook.Note], error) {
			return rd.AreaNotesNewestFirst(ctx, userID, a, cursor, limit, limitBytes)
		})
	}
	notes, notesCut, err := scan([][]source[notebook.Note]{noteSources}, func(n notebook.Note) int {
		return len(n.Title) + len(n.BodyMarkdown)
	})
	if err != nil {
		return nil, err
	}
	today := h.now().UTC().Format("2006-01-02")
	taskPhases := make([][]source[notebook.Task], 2)
	for _, status := range notebook.TaskStatuses {
		phase := 1
		if status == "todo" || status == "in_progress" {
			phase = 0
		}
		for _, a := range areas {
			taskPhases[phase] = append(taskPhases[phase], func(cursor string, limit, limitBytes int) (store.Page[notebook.Task], error) {
				page, err := rd.AreaStatusTasks(ctx, userID, a, status, cursor, limit, limitBytes)
				notebook.SortTasksForList(page.Items, today)
				return page, err
			})
		}
	}
	tasks, tasksCut, err := scan(taskPhases, func(t notebook.Task) int {
		return len(t.Title) + len(t.Description)
	})
	if err != nil {
		return nil, err
	}

	tasksByID := make(map[string]*notebook.Task, len(tasks))
	for i := range tasks {
		tasksByID[tasks[i].ID] = &tasks[i]
	}

	var noteHits []Hit
	for _, n := range notes {
		if hit, ok := noteHit(q, n, tasksByID); ok {
			noteHits = append(noteHits, hit)
		}
	}
	var taskHits []Hit
	for _, t := range tasks {
		if hit, ok := taskHit(q, t); ok {
			taskHits = append(taskHits, hit)
		}
	}

	return api.JSON(http.StatusOK, response{
		Notes:     top(noteHits, int(limit)),
		Tasks:     top(taskHits, int(limit)),
		Truncated: notesCut || tasksCut,
	}), nil
}

type response struct {
	Notes     []Hit `json:"notes"`
	Tasks     []Hit `json:"tasks"`
	Truncated bool  `json:"truncated"`
}

type source[T any] func(cursor string, limit, limitBytes int) (store.Page[T], error)

// scan reads up to scanCap rows and about scanByteCap bytes of their text,
// phase by phase, a page from each source in turn so no one area or status
// uses up the cap; truncated reports rows it left unread.
func scan[T any](phases [][]source[T], size func(T) int) (rows []T, truncated bool, err error) {
	read := 0
	for _, sources := range phases {
		cursors := make([]string, len(sources))
		done := make([]bool, len(sources))
		for slices.Contains(done, false) {
			for i, fetch := range sources {
				if done[i] {
					continue
				}
				if len(rows) >= scanCap || read >= scanByteCap {
					return rows, true, nil
				}
				page, err := fetch(cursors[i], min(scanPage, scanCap-len(rows)), min(store.PageByteBudget, scanByteCap-read))
				if err != nil {
					return nil, false, err
				}
				for _, row := range page.Items {
					read += size(row)
				}
				rows = append(rows, page.Items...)
				cursors[i] = page.NextCursor
				done[i] = page.NextCursor == ""
			}
		}
	}
	return rows, false, nil
}

func noteHit(q string, n notebook.Note, tasksByID map[string]*notebook.Task) (Hit, bool) {
	// Embeds match and read as the task's title, never as the raw token.
	body := notebook.ReplaceTaskEmbeds(n.BodyMarkdown, func(e notebook.TaskEmbed) string {
		if t := tasksByID[e.ID]; t != nil {
			return notebook.TaskEmbedFallbackLine(e.Indent, t)
		}
		return ""
	})
	hit, ok := rankFields(q, notebook.NoteDisplayTitle(n), notebook.MarkdownPlainText(body), n.Tags)
	if !ok {
		return Hit{}, false
	}
	h := Hit{Type: "note", ID: n.ID, Area: n.Area, Title: hit.title, Snippet: Text(hit.snippet), Matches: hit.matches, score: hit.score}
	if n.Type == "daily" && n.Date != nil && *n.Date != "" {
		h.Date = n.Date
	}
	return h, true
}

func taskHit(q string, t notebook.Task) (Hit, bool) {
	hit, ok := rankFields(q, t.Title, notebook.MarkdownPlainText(t.Description), t.Tags)
	if !ok {
		return Hit{}, false
	}
	version := t.Version
	return Hit{
		Type: "task", ID: t.ID, Area: t.Area, Title: hit.title, Status: t.Status, Version: &version,
		Snippet: Text(hit.snippet), Matches: hit.matches, score: hit.score,
	}, true
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
