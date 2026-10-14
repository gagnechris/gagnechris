package notebook

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

// Routes are the Notebook notes, tasks, daily and note templates and sync
// feed.
func Routes(table *data.Table, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	h := handlers{
		notes:         newNotesRepo(table, now),
		tasks:         newTasksRepo(table, now),
		templates:     &templatesRepo{table: table, now: now},
		noteTemplates: &noteTemplatesRepo{table: table, now: now},
		table:         table,
		now:           now,
	}
	route := func(method, pattern, metric string, handler api.Handler) api.Route {
		return api.Route{Method: method, Pattern: pattern, Auth: api.Notebook, Metric: metric, Handler: handler}
	}
	const daily = "/notebook/notes/daily/:area/:date"
	const template = "/notebook/templates/daily/:area"
	const noteTemplates = "/notebook/templates/notes"
	return []api.Route{
		route(http.MethodPost, "/notebook/notes/batch", "BatchGetNotes", h.batchNotes),
		route(http.MethodGet, "/notebook/notes", "ListNotes", h.listNotes),
		route(http.MethodPost, "/notebook/notes", "CreateNote", h.createNote),
		route(http.MethodGet, daily, "GetDailyNote", h.getDaily),
		route(http.MethodPost, daily+"/open", "OpenDailyNote", h.openDaily),
		route(http.MethodPut, daily, "UpsertDailyNote", h.upsertDaily),
		route(http.MethodGet, "/notebook/notes/:id", "GetNote", h.getNote),
		route(http.MethodPut, "/notebook/notes/:id", "UpdateNote", h.updateNote),
		route(http.MethodDelete, "/notebook/notes/:id", "DeleteNote", h.deleteNote),

		route(http.MethodGet, "/notebook/tasks", "ListTasks", h.listTasks),
		route(http.MethodPost, "/notebook/tasks/batch", "BatchGetTasks", h.batchTasks),
		route(http.MethodPost, "/notebook/tasks", "CreateTask", h.createTask),
		route(http.MethodPost, "/notebook/tasks/:id/complete", "CompleteTask", h.taskAction((*tasksRepo).complete)),
		route(http.MethodPost, "/notebook/tasks/:id/reopen", "ReopenTask", h.taskAction((*tasksRepo).reopen)),
		route(http.MethodGet, "/notebook/tasks/:id", "GetTask", h.getTask),
		route(http.MethodPut, "/notebook/tasks/:id", "UpdateTask", h.updateTask),
		route(http.MethodDelete, "/notebook/tasks/:id", "DeleteTask", h.deleteTask),

		route(http.MethodGet, template, "GetDailyTemplate", h.getTemplate),
		route(http.MethodPut, template, "UpdateDailyTemplate", h.updateTemplate),
		route(http.MethodDelete, template, "ResetDailyTemplate", h.resetTemplate),

		route(http.MethodGet, noteTemplates, "ListNoteTemplates", h.listNoteTemplates),
		route(http.MethodPost, noteTemplates, "CreateNoteTemplate", h.createNoteTemplate),
		route(http.MethodGet, noteTemplates+"/:id", "GetNoteTemplate", h.getNoteTemplate),
		route(http.MethodPut, noteTemplates+"/:id", "UpdateNoteTemplate", h.updateNoteTemplate),
		route(http.MethodDelete, noteTemplates+"/:id", "DeleteNoteTemplate", h.deleteNoteTemplate),

		route(http.MethodGet, "/notebook/sync/changes", "SyncChanges", h.syncChanges),
	}
}

type handlers struct {
	notes         *notesRepo
	tasks         *tasksRepo
	templates     *templatesRepo
	noteTemplates *noteTemplatesRepo
	table         *data.Table
	now           func() time.Time
}

var dayPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// calendarDay is CalendarDateSchema: the shape, then a real day.
func calendarDay(s string) string {
	if !dayPattern.MatchString(s) {
		return api.CodeInvalidFormat
	}
	if _, ok := ParseCalendarDay(s); !ok {
		return api.CodeCustom
	}
	return ""
}

// The size checks report zod's messages, since a 413 carries the first one.
// Lengths count code points, as zod does.

func maxChars(v *api.Validator, key, s string, limit int) {
	if utf8.RuneCountInString(s) > limit {
		v.FailWith(key, api.CodeTooBig, "Too big: expected string to have <="+strconv.Itoa(limit)+" characters")
	}
}

// text is NotebookTextSchema, limited in UTF-8 bytes.
func text(v *api.Validator, key string, required bool) (string, bool) {
	s, ok := v.String(key, required, false)
	if ok && len(s) > contract.Data.Notebook.TextMaxBytes {
		v.FailWith(key, api.CodeTooBig, "Text is over the "+strconv.Itoa(contract.Data.Notebook.TextMaxBytes/1000)+" KB limit")
	}
	return s, ok
}

func title(v *api.Validator, key string, minLen int, required bool) (string, bool) {
	s, ok := v.String(key, required, false)
	if ok {
		if utf8.RuneCountInString(s) < minLen {
			v.Fail(key, api.CodeTooSmall)
		}
		maxChars(v, key, s, contract.Data.Notebook.TitleMaxLength)
	}
	return s, ok
}

func tags(v *api.Validator) ([]string, bool) {
	nb := contract.Data.Notebook
	list, ok := v.StringArray("tags", false, false, -1)
	for i, t := range list {
		maxChars(v, "tags."+strconv.Itoa(i), t, nb.TagMaxLength)
	}
	if len(list) > nb.TagsMax {
		v.FailWith("tags", api.CodeTooBig, "Too big: expected array to have <="+strconv.Itoa(nb.TagsMax)+" items")
	}
	return list, ok
}

func optBool(v *api.Validator, key string) *bool {
	if b, ok := v.Bool(key, false); ok {
		return &b
	}
	return nil
}

func optStr(s string, ok bool) *string {
	if ok {
		return &s
	}
	return nil
}

func bodyVersion(v *api.Validator) *int {
	if n, ok := v.Int("version", false, api.NonNegative); ok {
		version := int(n)
		return &version
	}
	return nil
}

func idParam(r *api.Request) (string, error) {
	v := api.NewQueryValidator(map[string]string{"id": r.Params["id"]})
	id, _ := v.ULID("id", true)
	return id, v.ErrWith("Invalid path parameters")
}

func dailyParams(r *api.Request) (area, date string, err error) {
	v := api.NewQueryValidator(map[string]string{"area": r.Params["area"], "date": r.Params["date"]})
	area, _ = v.Enum("area", true, Areas...)
	date, _ = v.String("date", true, false, calendarDay)
	return area, date, v.ErrWith("Invalid path parameters")
}

func areaParam(r *api.Request) (string, error) {
	v := api.NewQueryValidator(map[string]string{"area": r.Params["area"]})
	area, _ := v.Enum("area", true, Areas...)
	return area, v.ErrWith("Invalid path parameters")
}

// expected resolves the write's version; a missing one is a 400 unless the
// route has a versionless form.
func expected(r *api.Request, version *int, required bool) (api.Expected, error) {
	e, err := api.ResolveExpected(r, version)
	if err == nil && required && !e.Set {
		err = api.BadRequest("Expected version required (If-Match or body.version)", nil)
	}
	return e, err
}

func noteResponse(status int, n Note) (*api.Response, error) {
	if err := checkNote(n); err != nil {
		return nil, err
	}
	return api.JSONWithETag(status, n, n.Version), nil
}

func taskResponse(status int, t Task) (*api.Response, error) {
	if err := checkTask(t); err != nil {
		return nil, err
	}
	return api.JSONWithETag(status, t, t.Version), nil
}

type itemsResponse[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"nextCursor,omitempty"`
}

func listResponse[T any](page store.Page[T], check func(T) error) (*api.Response, error) {
	items := page.Items
	if items == nil {
		items = []T{}
	}
	for _, item := range items {
		if err := check(item); err != nil {
			return nil, err
		}
	}
	return api.JSON(http.StatusOK, itemsResponse[T]{Items: items, NextCursor: page.NextCursor}), nil
}

func batchIDs(r *api.Request) ([]string, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	ids, _ := v.ULIDArray("ids", true, 1, contract.Data.Notebook.BatchMaxIDs)
	return ids, v.Err()
}

func pageLimit(v *api.Validator) int {
	if n, ok := v.CoercedInt("limit", api.Positive, api.MaxInt(contract.Data.Limits.PageLimitMax)); ok {
		return int(n)
	}
	return 0
}

// Notes.

func (h handlers) batchNotes(ctx context.Context, r *api.Request) (*api.Response, error) {
	ids, err := batchIDs(r)
	if err != nil {
		return nil, err
	}
	notes, err := h.notes.base.getMany(ctx, r.UserID(), ids)
	if err != nil {
		return nil, err
	}
	return listResponse(store.Page[Note]{Items: notes}, checkNote)
}

func (h handlers) listNotes(ctx context.Context, r *api.Request) (*api.Response, error) {
	v := api.NewQueryValidator(r.Query)
	q := listNotesQuery{}
	q.area, _ = v.Enum("area", false, Areas...)
	q.from, _ = v.String("from", false, false, calendarDay)
	q.to, _ = v.String("to", false, false, calendarDay)
	q.noteType, _ = v.Enum("type", false, NoteTypes...)
	q.taskID, _ = v.ULID("taskId", false)
	q.cursor, _ = v.String("cursor", false, false, api.MinLen(1))
	q.limit = pageLimit(v)
	if err := v.ErrWith("Invalid query parameters"); err != nil {
		return nil, err
	}
	if q.limit == 0 {
		q.limit = contract.Data.Notebook.PageSize
	}
	page, err := h.notes.list(ctx, r.UserID(), q, store.LogCorrupt(r.Log, r.Metrics))
	if err != nil {
		return nil, err
	}
	return listResponse(page, checkNote)
}

func (h handlers) createNote(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	in := createNoteInput{tags: []string{}}
	in.id, _ = v.ULID("id", true)
	in.area, _ = v.Enum("area", true, Areas...)
	in.noteType, _ = v.Enum("type", true, NoteTypes...)
	in.date = optStr(v.String("date", false, false, calendarDay))
	in.title, _ = title(v, "title", 0, false)
	in.body, _ = text(v, "bodyMarkdown", false)
	if list, ok := tags(v); ok {
		in.tags = list
	}
	if p := optBool(v, "pinned"); p != nil {
		in.pinned = *p
	}
	_, hasDate := v.Raw("date")
	if v.Continuable() {
		if in.noteType == "daily" && !hasDate {
			v.Fail("date", api.CodeCustom)
		}
		if in.noteType == "page" && hasDate {
			v.Fail("date", api.CodeCustom)
		}
	}
	if err := v.ErrMaybeTooLarge(); err != nil {
		return nil, err
	}
	n, err := h.notes.create(ctx, r.UserID(), in)
	if err != nil {
		return nil, err
	}
	h.nestSubtasks(ctx, r, n)
	return noteResponse(http.StatusCreated, n)
}

// readNoteFields reads the optional fields of a note write.
func readNoteFields(v *api.Validator, withArea bool) noteFields {
	var f noteFields
	f.title = optStr(title(v, "title", 0, false))
	f.bodyMarkdown = optStr(text(v, "bodyMarkdown", false))
	f.tags, f.hasTags = tags(v)
	f.pinned = optBool(v, "pinned")
	if withArea {
		f.area = optStr(v.Enum("area", false, Areas...))
	}
	return f
}

// nestSubtasks sets the parents the note's indentation gives its tasks. The
// note is already saved, so a failure is logged and the next save retries.
func (h handlers) nestSubtasks(ctx context.Context, r *api.Request, n Note) {
	if err := h.tasks.syncParents(ctx, r.UserID(), n, store.LogCorrupt(r.Log, r.Metrics)); err != nil {
		r.Log.Warn("Subtask nesting failed", "noteId", n.ID, "errMessage", err.Error())
	}
}

func (h handlers) emptyDay(ctx context.Context, userID, area, date string) (*api.Response, error) {
	template, err := h.templates.get(ctx, userID, area)
	if err != nil {
		return nil, err
	}
	return api.JSON(http.StatusOK, emptyDaily{
		Exists: false, UserID: userID, Area: area, Type: "daily", Date: date, Tags: []string{},
		TemplateMarkdown: FillDailyTemplate(template.BodyMarkdown, area, date),
	}), nil
}

func (h handlers) dayResponse(ctx context.Context, userID, area, date string, n *Note) (*api.Response, error) {
	if n == nil {
		return h.emptyDay(ctx, userID, area, date)
	}
	return noteResponse(http.StatusOK, *n)
}

func (h handlers) getDaily(ctx context.Context, r *api.Request) (*api.Response, error) {
	area, date, err := dailyParams(r)
	if err != nil {
		return nil, err
	}
	n, err := h.notes.getDaily(ctx, r.UserID(), area, date)
	if err != nil {
		return nil, err
	}
	return h.dayResponse(ctx, r.UserID(), area, date, n)
}

// openDaily creates the day's note when tasks carry into it, so the
// carried-in block is written once whichever device opens the day first.
func (h handlers) openDaily(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	id, _ := v.ULID("id", true)
	if err := v.Err(); err != nil {
		return nil, err
	}
	area, date, err := dailyParams(r)
	if err != nil {
		return nil, err
	}
	userID := r.UserID()
	existing, err := h.notes.getDaily(ctx, userID, area, date)
	if err != nil || existing != nil {
		if err != nil {
			return nil, err
		}
		return h.dayResponse(ctx, userID, area, date, existing)
	}
	carried, err := h.tasks.carriedInto(ctx, userID, area, date, store.LogCorrupt(r.Log, r.Metrics))
	if err != nil {
		return nil, err
	}
	if len(carried) == 0 {
		return h.emptyDay(ctx, userID, area, date)
	}
	template, err := h.templates.get(ctx, userID, area)
	if err != nil {
		return nil, err
	}
	body := FillDailyTemplate(CarryIntoDailyTemplate(template.BodyMarkdown, carried, template.CarryOverSection), area, date)
	n, err := h.notes.createDaily(ctx, userID, area, date, dailyFields{id: id, noteFields: noteFields{bodyMarkdown: &body}})
	var conflict *api.ConflictError
	if errors.As(err, &conflict) {
		// Another device opened the day first: its note is the one record.
		current, cerr := h.notes.getDaily(ctx, userID, area, date)
		if cerr != nil {
			return nil, cerr
		}
		if current == nil {
			return nil, err
		}
		return noteResponse(http.StatusOK, *current)
	}
	if err != nil {
		return nil, err
	}
	return noteResponse(http.StatusOK, n)
}

func (h handlers) upsertDaily(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	f := dailyFields{}
	f.id, _ = v.ULID("id", true)
	version := bodyVersion(v)
	f.noteFields = readNoteFields(v, false)
	if err := v.ErrMaybeTooLarge(); err != nil {
		return nil, err
	}
	area, date, err := dailyParams(r)
	if err != nil {
		return nil, err
	}
	e, err := expected(r, version, false)
	if err != nil {
		return nil, err
	}
	var n Note
	if e.Set {
		n, err = h.notes.updateDaily(ctx, r.UserID(), area, date, f, e)
		err = e.IfMatchConflict(err)
	} else {
		n, err = h.notes.createDailyOrReplay(ctx, r.UserID(), area, date, f)
	}
	if err != nil {
		return nil, err
	}
	if f.bodyMarkdown != nil {
		h.nestSubtasks(ctx, r, n)
	}
	return noteResponse(http.StatusOK, n)
}

func (h handlers) getNote(ctx context.Context, r *api.Request) (*api.Response, error) {
	id, err := idParam(r)
	if err != nil {
		return nil, err
	}
	n, err := h.notes.base.getOrThrow(ctx, r.UserID(), id)
	if err != nil {
		return nil, err
	}
	return noteResponse(http.StatusOK, n)
}

func (h handlers) updateNote(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version := bodyVersion(v)
	f := readNoteFields(v, true)
	if err := v.ErrMaybeTooLarge(); err != nil {
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
	n, err := h.notes.update(ctx, r.UserID(), id, e, f)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	if f.bodyMarkdown != nil {
		h.nestSubtasks(ctx, r, n)
	}
	return noteResponse(http.StatusOK, n)
}

// versionOnly reads ExpectedVersionRequestSchema.partial(), the body of a
// delete or task action, and the id.
func versionOnly(r *api.Request) (id string, e api.Expected, err error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return "", e, err
	}
	version := bodyVersion(v)
	if err := v.Err(); err != nil {
		return "", e, err
	}
	if id, err = idParam(r); err != nil {
		return "", e, err
	}
	e, err = expected(r, version, true)
	return id, e, err
}

func (h handlers) deleteNote(ctx context.Context, r *api.Request) (*api.Response, error) {
	id, e, err := versionOnly(r)
	if err != nil {
		return nil, err
	}
	n, err := h.notes.delete(ctx, r.UserID(), id, e)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	return noteResponse(http.StatusOK, n)
}

// Tasks.

func (h handlers) listTasks(ctx context.Context, r *api.Request) (*api.Response, error) {
	v := api.NewQueryValidator(r.Query)
	q := listTasksQuery{}
	q.area, _ = v.Enum("area", false, Areas...)
	q.status, _ = v.Enum("status", false, TaskStatuses...)
	q.priority, _ = v.Enum("priority", false, TaskPriorities...)
	q.dueOn, _ = v.String("dueOn", false, false, calendarDay)
	q.dueBefore, _ = v.String("dueBefore", false, false, calendarDay)
	q.startOn, _ = v.String("startOn", false, false, calendarDay)
	q.startOnOrBefore, _ = v.String("startOnOrBefore", false, false, calendarDay)
	q.startAfter, _ = v.String("startAfter", false, false, calendarDay)
	q.before, _ = v.String("startBefore", false, false, calendarDay)
	if s, ok := v.Enum("someday", false, "true", "false"); ok {
		someday := s == "true"
		q.someday = &someday
	}
	if _, ok := v.Enum("undated", false, "true"); ok {
		q.undated = true
	}
	q.noteID, _ = v.String("noteId", false, false, api.MinLen(1))
	if s, ok := v.Enum("open", false, "true", "false"); ok {
		q.open = s == "true"
	}
	q.today, _ = v.String("today", false, false, calendarDay)
	q.cursor, _ = v.String("cursor", false, false, api.MinLen(1))
	q.limit = pageLimit(v)
	if v.Continuable() {
		ranges := 0
		for _, set := range []bool{q.startOn != "", q.startOnOrBefore != "", q.startAfter != "" || q.before != ""} {
			if set {
				ranges++
			}
		}
		if ranges > 1 {
			v.Fail("startOn", api.CodeCustom)
		}
		if q.someday != nil && *q.someday && ranges > 0 {
			v.Fail("someday", api.CodeCustom)
		}
		if q.undated && (ranges > 0 || q.someday != nil && *q.someday) {
			v.Fail("undated", api.CodeCustom)
		}
	}
	if err := v.ErrWith("Invalid query parameters"); err != nil {
		return nil, err
	}
	if q.limit == 0 {
		q.limit = contract.Data.Notebook.PageSize
	}
	page, err := h.tasks.list(ctx, r.UserID(), q, store.LogCorrupt(r.Log, r.Metrics))
	if err != nil {
		return nil, err
	}
	return listResponse(page, checkTask)
}

func (h handlers) batchTasks(ctx context.Context, r *api.Request) (*api.Response, error) {
	ids, err := batchIDs(r)
	if err != nil {
		return nil, err
	}
	tasks, err := h.tasks.base.getMany(ctx, r.UserID(), ids)
	if err != nil {
		return nil, err
	}
	return listResponse(store.Page[Task]{Items: tasks}, checkTask)
}

// checkLinkedNote is a 400 unless noteID names a live note of the user's.
// The read is consistent: an outbox replays a note's create just before the
// task that links it.
func (h handlers) checkLinkedNote(ctx context.Context, userID string, noteID *string) error {
	if noteID == nil {
		return nil
	}
	n, err := h.notes.base.getLive(ctx, userID, *noteID, true)
	if err != nil || n != nil {
		return err
	}
	return api.BadRequest("noteId must reference an existing note", map[string]string{"noteId": "not_found"})
}

// rejectDatedSomeday: someday tasks have no startDate.
func rejectDatedSomeday(v *api.Validator, someday *bool, hasStart bool) {
	if v.Continuable() && someday != nil && *someday && hasStart {
		v.Fail("startDate", api.CodeCustom)
	}
}

// nonNullStart is whether startDate holds a value, valid or not, as zod's
// refinement sees it.
func nonNullStart(v *api.Validator) bool {
	raw, ok := v.Raw("startDate")
	return ok && string(raw) != "null"
}

func (h handlers) createTask(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	in := createTaskInput{description: "", priority: "med", status: "todo", tags: []string{}}
	in.id, _ = v.ULID("id", true)
	in.area, _ = v.Enum("area", true, Areas...)
	in.title, _ = title(v, "title", 1, true)
	in.description, _ = text(v, "description", false)
	if p, ok := v.Enum("priority", false, TaskPriorities...); ok {
		in.priority = p
	}
	if s, ok := v.Enum("status", false, TaskStatuses...); ok {
		in.status = s
	}
	in.dueDate, _ = v.NullableString("dueDate", calendarDay)
	in.startDate, in.hasStart = v.NullableString("startDate", calendarDay)
	in.someday = optBool(v, "someday")
	in.noteID, _, _ = v.NullableULID("noteId")
	if list, ok := tags(v); ok {
		in.tags = list
	}
	rejectDatedSomeday(v, in.someday, nonNullStart(v))
	if err := v.ErrMaybeTooLarge(); err != nil {
		return nil, err
	}
	if err := h.checkLinkedNote(ctx, r.UserID(), in.noteID); err != nil {
		return nil, err
	}
	task, err := h.tasks.create(ctx, r.UserID(), in)
	if err != nil {
		return nil, err
	}
	return taskResponse(http.StatusCreated, task)
}

func (h handlers) getTask(ctx context.Context, r *api.Request) (*api.Response, error) {
	id, err := idParam(r)
	if err != nil {
		return nil, err
	}
	t, err := h.tasks.base.getOrThrow(ctx, r.UserID(), id)
	if err != nil {
		return nil, err
	}
	return taskResponse(http.StatusOK, t)
}

func (h handlers) updateTask(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	version := bodyVersion(v)
	var f taskFields
	f.area = optStr(v.Enum("area", false, Areas...))
	f.title = optStr(title(v, "title", 1, false))
	f.description = optStr(text(v, "description", false))
	f.priority = optStr(v.Enum("priority", false, TaskPriorities...))
	f.status = optStr(v.Enum("status", false, TaskStatuses...))
	f.dueDate, f.hasDue = v.NullableString("dueDate", calendarDay)
	f.startDate, f.hasStart = v.NullableString("startDate", calendarDay)
	f.someday = optBool(v, "someday")
	f.noteID, f.hasNote, _ = v.NullableULID("noteId")
	f.tags, f.hasTags = tags(v)
	rejectDatedSomeday(v, f.someday, nonNullStart(v))
	if err := v.ErrMaybeTooLarge(); err != nil {
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
	// Only a changed link is checked: the web resends noteId on every save,
	// and a task whose note was later deleted must stay editable.
	if f.noteID != nil {
		existing, err := h.tasks.base.getOrThrow(ctx, r.UserID(), id)
		if err != nil {
			return nil, err
		}
		if existing.NoteID == nil || *existing.NoteID != *f.noteID {
			if err := h.checkLinkedNote(ctx, r.UserID(), f.noteID); err != nil {
				return nil, err
			}
		}
	}
	t, err := h.tasks.update(ctx, r.UserID(), id, e, f)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	if f.hasNote || f.area != nil {
		// The update is committed: a failed renest is logged, and the next
		// save of the home note retries it.
		if nested, err := h.renest(ctx, r.UserID(), t); err != nil {
			r.Log.Warn("Subtask nesting failed", "taskId", t.ID, "errMessage", err.Error())
		} else {
			t = nested
		}
	}
	return taskResponse(http.StatusOK, t)
}

func (h handlers) taskAction(act func(*tasksRepo, context.Context, string, string, api.Expected) (Task, error)) api.Handler {
	return func(ctx context.Context, r *api.Request) (*api.Response, error) {
		id, e, err := versionOnly(r)
		if err != nil {
			return nil, err
		}
		t, err := act(h.tasks, ctx, r.UserID(), id, e)
		if err != nil {
			return nil, e.IfMatchConflict(err)
		}
		return taskResponse(http.StatusOK, t)
	}
}

func (h handlers) deleteTask(ctx context.Context, r *api.Request) (*api.Response, error) {
	id, e, err := versionOnly(r)
	if err != nil {
		return nil, err
	}
	t, err := h.tasks.delete(ctx, r.UserID(), id, e)
	if err != nil {
		return nil, e.IfMatchConflict(err)
	}
	if err := h.clearSubtasks(ctx, r.UserID(), t, store.LogCorrupt(r.Log, r.Metrics)); err != nil {
		r.Log.Warn("Clearing subtasks failed", "taskId", t.ID, "errMessage", err.Error())
	}
	return taskResponse(http.StatusOK, t)
}

// Daily templates.

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

// Note templates.

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
	if ok && len(s) > contract.Data.Notebook.NoteTemplateMaxBytes {
		v.FailWith("bodyMarkdown", api.CodeTooBig, "Template is over the "+strconv.Itoa(contract.Data.Notebook.NoteTemplateMaxBytes/1000)+" KB limit")
	}
	return s, ok
}

func (h handlers) listNoteTemplates(ctx context.Context, r *api.Request) (*api.Response, error) {
	items, err := h.noteTemplates.list(ctx, r.UserID(), store.LogCorrupt(r.Log, r.Metrics))
	if err != nil {
		return nil, err
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
	if err := v.ErrMaybeTooLarge(); err != nil {
		return nil, err
	}
	t, err := h.noteTemplates.create(ctx, r.UserID(), id, name, body)
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
	if err := v.ErrMaybeTooLarge(); err != nil {
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
	t, err := h.noteTemplates.update(ctx, r.UserID(), id, e, name, body)
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

// Sync.

func (h handlers) syncChanges(ctx context.Context, r *api.Request) (*api.Response, error) {
	v := api.NewQueryValidator(r.Query)
	var q syncQuery
	q.since, _ = v.String("since", false, false, func(s string) string {
		if !api.IsDatetime(s) {
			return api.CodeInvalidFormat
		}
		return ""
	})
	q.cursor, _ = v.String("cursor", false, false, api.MinLen(1))
	q.limit = pageLimit(v)
	if err := v.ErrWith("Invalid query parameters"); err != nil {
		return nil, err
	}
	if err := assertClientVersion(r, contract.Data.Sync.MinClientVersion); err != nil {
		return nil, err
	}
	page, err := changesSince(ctx, h.table, h.now(), r.UserID(), q, logSyncCorrupt(r))
	if err != nil {
		return nil, err
	}
	return api.JSON(http.StatusOK, page), nil
}
