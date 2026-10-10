package notebook

import (
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

var (
	Areas          = []string{"work", "personal"}
	NoteTypes      = []string{"daily", "page"}
	TaskStatuses   = []string{"todo", "in_progress", "done", "dropped"}
	TaskPriorities = []string{"low", "med", "high"}
)

// Note is the API's Note, in NoteSchema's field order.
type Note struct {
	ID           string   `json:"id"`
	UserID       string   `json:"userId"`
	Area         string   `json:"area"`
	Type         string   `json:"type"`
	Date         *string  `json:"date"`
	Title        string   `json:"title"`
	BodyMarkdown string   `json:"bodyMarkdown"`
	Tags         []string `json:"tags"`
	Pinned       bool     `json:"pinned"`
	TaskIDs      []string `json:"taskIds"`
	Version      int      `json:"version"`
	CreatedAt    string   `json:"createdAt"`
	UpdatedAt    string   `json:"updatedAt"`
	Deleted      bool     `json:"deleted"`
}

// Task is the API's Task, in metaToTask's field order.
type Task struct {
	ID          string   `json:"id"`
	UserID      string   `json:"userId"`
	Area        string   `json:"area"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Priority    string   `json:"priority"`
	Status      string   `json:"status"`
	DueDate     *string  `json:"dueDate"`
	StartDate   *string  `json:"startDate"`
	Someday     bool     `json:"someday"`
	CompletedAt *string  `json:"completedAt"`
	NoteID      *string  `json:"noteId"`
	Tags        []string `json:"tags"`
	Version     int      `json:"version"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	Deleted     bool     `json:"deleted"`
}

// versionedMeta reads VersionedMetaFieldsSchema.
func versionedMeta(r *store.ItemReader) (version int, createdAt, updatedAt string, deleted bool) {
	version = r.NonNegativeInt("version")
	createdAt = r.Str("createdAt", 1)
	updatedAt = r.Str("updatedAt", 1)
	deleted = r.Bool("deleted")
	for _, key := range []string{"createHash", "syncPk", "syncSk", "gsi1pk", "gsi1sk", "gsi2pk", "gsi2sk"} {
		r.OptOnlyStr(key, 1)
	}
	r.OptPositiveInt("ttl")
	return
}

// calendarDate is CalendarDateSchema.nullable(); present is false when the
// attribute is missing.
func calendarDate(r *store.ItemReader, key string, item data.Item) (day *string, present bool) {
	if _, ok := item[key]; !ok {
		return nil, false
	}
	day = r.NullStr(key, 0)
	if day != nil {
		if _, ok := ParseCalendarDay(*day); !ok {
			r.Fail(key, "not a calendar date")
		}
	}
	return day, true
}

func ParseNote(item data.Item) (Note, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "note")
	n := Note{
		ID:     r.Str("id", 1),
		UserID: r.Str("userId", 1),
		Area:   r.Enum("area", Areas...),
		Type:   r.Enum("type", NoteTypes...),
	}
	var present bool
	if n.Date, present = calendarDate(r, "date", item); !present {
		r.Fail("date", "missing")
	}
	n.Title = r.Str("title", 0)
	n.BodyMarkdown = r.Str("bodyMarkdown", 0)
	n.Tags = r.StrList("tags")
	n.Pinned = r.Bool("pinned")
	if _, ok := item["taskIds"]; ok {
		n.TaskIDs = r.StrList("taskIds")
	} else {
		n.TaskIDs = []string{}
		seen := map[string]bool{}
		for _, e := range FindTaskEmbeds(n.BodyMarkdown) {
			if !seen[e.ID] {
				seen[e.ID] = true
				n.TaskIDs = append(n.TaskIDs, e.ID)
			}
		}
	}
	n.Version, n.CreatedAt, n.UpdatedAt, n.Deleted = versionedMeta(r)
	return n, r.Err("note")
}

func ParseTask(item data.Item) (Task, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "task")
	t := Task{
		ID:          r.Str("id", 1),
		UserID:      r.Str("userId", 1),
		Area:        r.Enum("area", Areas...),
		Title:       r.Str("title", 1),
		Description: r.Str("description", 0),
		Priority:    r.Enum("priority", TaskPriorities...),
		Status:      r.Enum("status", TaskStatuses...),
	}
	var present bool
	if t.DueDate, present = calendarDate(r, "dueDate", item); !present {
		r.Fail("dueDate", "missing")
	}
	// A row with no startDate shows on its dueDate; an explicit null means now.
	if start, present := calendarDate(r, "startDate", item); present {
		t.StartDate = start
	} else {
		t.StartDate = t.DueDate
	}
	if someday := r.OptBool("someday"); someday != nil {
		t.Someday = *someday
	}
	t.CompletedAt = r.NullStr("completedAt", 0)
	t.NoteID = r.NullStr("noteId", 1)
	t.Tags = r.StrList("tags")
	t.Version, t.CreatedAt, t.UpdatedAt, t.Deleted = versionedMeta(r)
	return t, r.Err("task")
}
