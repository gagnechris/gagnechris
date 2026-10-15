package notebook

import (
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

var (
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
	Archived     bool     `json:"archived"`
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
	ParentID    *string  `json:"parentId"`
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
		Area:   readArea(r, "area"),
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
	if archived := r.OptBool("archived"); archived != nil {
		n.Archived = *archived
	}
	if _, ok := item["taskIds"]; ok {
		n.TaskIDs = r.StrList("taskIds")
	} else {
		n.TaskIDs = TaskEmbedIDs(n.BodyMarkdown)
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
		Area:        readArea(r, "area"),
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
	if _, ok := item["parentId"]; ok {
		t.ParentID = r.NullStr("parentId", 1)
	}
	t.Tags = r.StrList("tags")
	t.Version, t.CreatedAt, t.UpdatedAt, t.Deleted = versionedMeta(r)
	return t, r.Err("task")
}

func optS(s *string) types.AttributeValue { return data.OptS(s) }

// noteItem is buildNoteMetaItem: a tombstone leaves the list index.
func noteItem(n Note) data.Item {
	item := data.Key(keys.NotePk(n.UserID, n.ID), keys.NoteMetaSk())
	item["entityType"] = data.S("note")
	item["id"] = data.S(n.ID)
	item["userId"] = data.S(n.UserID)
	item["area"] = data.S(n.Area)
	item["type"] = data.S(n.Type)
	item["date"] = optS(n.Date)
	item["title"] = data.S(n.Title)
	item["bodyMarkdown"] = data.S(n.BodyMarkdown)
	item["tags"] = data.StrList(n.Tags)
	item["pinned"] = data.Bool(n.Pinned)
	item["archived"] = data.Bool(n.Archived)
	item["taskIds"] = data.StrList(n.TaskIDs)
	item["version"] = data.N(int64(n.Version))
	item["createdAt"] = data.S(n.CreatedAt)
	item["updatedAt"] = data.S(n.UpdatedAt)
	item["deleted"] = data.Bool(n.Deleted)
	if !n.Deleted {
		item["gsi1pk"] = data.S(keys.NotebookAreaGSI1Pk(n.UserID, n.Area))
		if n.Type == "daily" && n.Date != nil && *n.Date != "" {
			item["gsi1sk"] = data.S(keys.NoteDateGSI1Sk(*n.Date, n.ID))
		} else {
			item["gsi1sk"] = data.S(keys.NotePageGSI1Sk(n.UpdatedAt, n.ID))
		}
	}
	return item
}

func taskGSI1Sk(t Task) string {
	switch {
	case t.Someday:
		return keys.TaskSomedayGSI1Sk(t.UpdatedAt, t.ID)
	case t.StartDate != nil && *t.StartDate != "":
		return keys.TaskStartGSI1Sk(*t.StartDate, t.ID)
	}
	return keys.TaskUpdatedGSI1Sk(t.UpdatedAt, t.ID)
}

// taskItem is buildTaskMetaItem: a tombstone leaves the list indexes.
func taskItem(t Task) data.Item {
	item := data.Key(keys.TaskPk(t.UserID, t.ID), keys.TaskMetaSk())
	item["entityType"] = data.S("task")
	item["id"] = data.S(t.ID)
	item["userId"] = data.S(t.UserID)
	item["area"] = data.S(t.Area)
	item["title"] = data.S(t.Title)
	item["description"] = data.S(t.Description)
	item["priority"] = data.S(t.Priority)
	item["status"] = data.S(t.Status)
	item["dueDate"] = optS(t.DueDate)
	item["startDate"] = optS(t.StartDate)
	item["someday"] = data.Bool(t.Someday)
	item["completedAt"] = optS(t.CompletedAt)
	item["noteId"] = optS(t.NoteID)
	item["parentId"] = optS(t.ParentID)
	item["tags"] = data.StrList(t.Tags)
	item["version"] = data.N(int64(t.Version))
	item["createdAt"] = data.S(t.CreatedAt)
	item["updatedAt"] = data.S(t.UpdatedAt)
	item["deleted"] = data.Bool(t.Deleted)
	if !t.Deleted {
		item["gsi1pk"] = data.S(keys.TaskAreaStatusGSI1Pk(t.UserID, t.Area, t.Status))
		item["gsi1sk"] = data.S(taskGSI1Sk(t))
		if t.NoteID != nil && *t.NoteID != "" {
			item["gsi2pk"] = data.S(keys.NoteTasksGSI2Pk(t.UserID, *t.NoteID))
			item["gsi2sk"] = data.S(keys.NoteTasksGSI2Sk(t.ID))
		}
	}
	return item
}
