package notebook

import (
	"context"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

const (
	taskChangeType = "task"
	gsi2           = "gsi2"
	// carryInMax keeps a carried-in block readable; the rest stay in Still
	// open.
	carryInMax = 100
)

var (
	openStatuses     = []string{"todo", "in_progress"}
	gsi2CursorKeys   = []string{"pk", "sk", "gsi2pk", "gsi2sk"}
	scheduleNotRange = []*skRange{nil}
)

func taskKey(userID, id string) data.Item {
	return data.Key(keys.TaskPk(userID, id), keys.TaskMetaSk())
}

func taskCreateHash(t Task) string {
	opt := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	fields := []string{t.UserID, t.Area, t.Title, t.Description, t.Priority, t.Status, opt(t.DueDate), opt(t.NoteID), strings.Join(t.Tags, ",")}
	// Unscheduled creates hash as they did before tasks had a schedule, so
	// an older create's replay still matches its stored hash.
	if t.StartDate != nil || t.Someday {
		someday := ""
		if t.Someday {
			someday = "someday"
		}
		fields = append(fields, opt(t.StartDate), someday)
	}
	return hashCreateFields(fields...)
}

type tasksRepo struct {
	table *data.Table
	base  *versioned[Task, *Task]
}

func newTasksRepo(table *data.Table, now func() time.Time) *tasksRepo {
	return &tasksRepo{table: table, base: &versioned[Task, *Task]{
		table: table, now: now, label: "task", changeType: taskChangeType,
		key: taskKey, parse: ParseTask, item: taskItem, createHash: taskCreateHash,
	}}
}

// applySchedule: someday wins; a task is either someday or scheduled.
func applySchedule(startDate *string, someday bool, bodyStart *string, hasStart bool, bodySomeday *bool) (*string, bool) {
	next := someday
	switch {
	case bodySomeday != nil:
		next = *bodySomeday
	case hasStart && bodyStart != nil:
		next = false
	}
	if next {
		return nil, true
	}
	if hasStart {
		return bodyStart, false
	}
	return startDate, false
}

func completedAt(status string, existing *string, now string) *string {
	if status != "done" {
		return nil
	}
	if existing != nil {
		return existing
	}
	return &now
}

type createTaskInput struct {
	id, area, title, description, priority, status string
	dueDate, startDate, noteID                     *string
	hasStart                                       bool
	someday                                        *bool
	tags                                           []string
}

func (r *tasksRepo) create(ctx context.Context, userID string, in createTaskInput) (Task, error) {
	now := r.base.nowISO()
	t := Task{
		ID: in.id, UserID: userID, Area: in.area, Title: in.title, Description: in.description,
		Priority: in.priority, Status: in.status, DueDate: in.dueDate,
		CompletedAt: completedAt(in.status, nil, now), NoteID: in.noteID, Tags: NormalizeTags(in.tags),
		Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	t.StartDate, t.Someday = applySchedule(nil, false, in.startDate, in.hasStart, in.someday)
	return r.base.createIdempotent(ctx, t)
}

type taskFields struct {
	area, title, description, priority, status *string
	dueDate                                    *string
	hasDue                                     bool
	startDate                                  *string
	hasStart                                   bool
	someday                                    *bool
	noteID                                     *string
	hasNote                                    bool
	tags                                       []string
	hasTags                                    bool
}

func setIf(dst *string, src *string) {
	if src != nil {
		*dst = *src
	}
}

func (r *tasksRepo) update(ctx context.Context, userID, id string, expected api.Expected, f taskFields) (Task, error) {
	return r.base.mutate(ctx, userID, id, expected, func(t Task, now string) (Task, error) {
		setIf(&t.Area, f.area)
		setIf(&t.Title, f.title)
		setIf(&t.Description, f.description)
		setIf(&t.Priority, f.priority)
		setIf(&t.Status, f.status)
		if f.hasDue {
			t.DueDate = f.dueDate
		}
		t.StartDate, t.Someday = applySchedule(t.StartDate, t.Someday, f.startDate, f.hasStart, f.someday)
		if f.hasNote {
			t.NoteID = f.noteID
		}
		if f.hasTags {
			t.Tags = NormalizeTags(f.tags)
		}
		t.CompletedAt = completedAt(t.Status, t.CompletedAt, now)
		t.UpdatedAt = now
		return t, nil
	})
}

func (r *tasksRepo) complete(ctx context.Context, userID, id string, expected api.Expected) (Task, error) {
	return r.base.mutate(ctx, userID, id, expected, func(t Task, now string) (Task, error) {
		t.Status = "done"
		t.CompletedAt = completedAt("done", t.CompletedAt, now)
		t.UpdatedAt = now
		return t, nil
	})
}

// reopen undoes done or dropped only; an in-progress task keeps its status.
func (r *tasksRepo) reopen(ctx context.Context, userID, id string, expected api.Expected) (Task, error) {
	return r.base.mutate(ctx, userID, id, expected, func(t Task, now string) (Task, error) {
		if !isOpen(t.Status) {
			t.Status = "todo"
		}
		t.CompletedAt = nil
		t.UpdatedAt = now
		return t, nil
	})
}

func (r *tasksRepo) delete(ctx context.Context, userID, id string, expected api.Expected) (Task, error) {
	return r.base.softDelete(ctx, userID, id, expected, func(t Task, now string) Task {
		t.UpdatedAt = now
		t.Deleted = true
		return t
	})
}

// listTasksQuery is ListTasksQuerySchema.
type listTasksQuery struct {
	area, status, priority, dueOn, dueBefore     string
	startOn, startOnOrBefore, startAfter, before string
	someday                                      *bool
	undated                                      bool
	noteID                                       string
	open                                         bool
	today, cursor                                string
	limit                                        int
}

// afterDay sorts after every START#<day>#TASK#<id> for that day.
func afterDay(day string) string { return "START#" + day + "#TASK~" }

// scheduleRanges is one GSI1 range per walk; nil reads the whole partition.
func scheduleRanges(q listTasksQuery) []*skRange {
	switch {
	case q.someday != nil && *q.someday:
		return []*skRange{prefixRange("SOMEDAY#")}
	case q.undated:
		return []*skRange{prefixRange("UPDATED#")}
	case q.startOn != "":
		return []*skRange{{"START#" + q.startOn + "#", afterDay(q.startOn)}}
	case q.startOnOrBefore != "":
		return []*skRange{{"START#", afterDay(q.startOnOrBefore)}, prefixRange("UPDATED#")}
	case q.startAfter != "" || q.before != "":
		from, to := "START#", "START#\uffff"
		if q.startAfter != "" {
			from = afterDay(q.startAfter)
		}
		if q.before != "" {
			// `START#<day>#` sorts before every row for that day.
			to = "START#" + q.before + "#"
		}
		return []*skRange{{from, to}}
	}
	return scheduleNotRange
}

func showsOn(t Task, day string) bool {
	return !t.Someday && (t.StartDate == nil || *t.StartDate <= day)
}

func (q listTasksQuery) matches(t Task) bool {
	switch {
	case q.area != "" && t.Area != q.area,
		q.status != "" && t.Status != q.status,
		q.status == "" && q.open && !isOpen(t.Status),
		q.priority != "" && t.Priority != q.priority,
		q.dueOn != "" && (t.DueDate == nil || *t.DueDate != q.dueOn),
		q.dueBefore != "" && (t.DueDate == nil || *t.DueDate >= q.dueBefore),
		q.someday != nil && *q.someday != t.Someday,
		q.undated && (t.Someday || t.StartDate != nil),
		q.startOn != "" && (t.StartDate == nil || *t.StartDate != q.startOn),
		q.startOnOrBefore != "" && !showsOn(t, q.startOnOrBefore),
		q.startAfter != "" && (t.Someday || t.StartDate == nil || *t.StartDate <= q.startAfter),
		q.before != "" && (t.Someday || t.StartDate == nil || *t.StartDate >= q.before):
		return false
	}
	return true
}

type taskListPartition struct {
	area, status string
	rng          *skRange
}

func (r *tasksRepo) list(ctx context.Context, userID string, q listTasksQuery, onCorrupt func(*api.DataIntegrityError)) (store.Page[Task], error) {
	today := q.today
	if today == "" {
		today = r.base.now().UTC().Format("2006-01-02")
	}
	if q.noteID != "" {
		page, err := r.listByNote(ctx, userID, q, onCorrupt)
		SortTasksForList(page.Items, today)
		return page, err
	}
	areas := Areas
	if q.area != "" {
		areas = []string{q.area}
	}
	statuses := TaskStatuses
	switch {
	case q.status != "":
		statuses = []string{q.status}
	case q.open:
		statuses = openStatuses
	}
	var partitions []taskListPartition
	for _, a := range areas {
		for _, s := range statuses {
			for _, rng := range scheduleRanges(q) {
				partitions = append(partitions, taskListPartition{a, s, rng})
			}
		}
	}
	fetch := func(p taskListPartition, cursor string, limit, budget int) (store.Page[Task], error) {
		return gsi1Page(ctx, r.table, keys.TaskAreaStatusGSI1Pk(userID, p.area, p.status), p.rng, cursor, limit, budget,
			ParseTask, func(t Task) bool { return t.Deleted }, q.matches, onCorrupt)
	}
	var page store.Page[Task]
	var err error
	if len(partitions) == 1 {
		page, err = fetch(partitions[0], q.cursor, q.limit, store.PageByteBudget)
	} else {
		page, err = store.WalkPartitions(partitions, q.cursor, q.limit, fetch)
	}
	SortTasksForList(page.Items, today)
	return page, err
}

func (r *tasksRepo) listByNote(ctx context.Context, userID string, q listTasksQuery, onCorrupt func(*api.DataIntegrityError)) (store.Page[Task], error) {
	pk := keys.NoteTasksGSI2Pk(userID, q.noteID)
	page, err := store.QueryPage(ctx, r.table, store.PageQuery{
		Input: dynamodb.QueryInput{
			IndexName:                 aws.String(gsi2),
			KeyConditionExpression:    aws.String("gsi2pk = :pk"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
			ScanIndexForward:          aws.Bool(true),
		},
		Cursor: q.cursor, Limit: q.limit, CursorKeys: gsi2CursorKeys,
		PartitionAttr: "gsi2pk", PartitionValue: pk, ByteBudget: store.PageByteBudget,
	}, func(item data.Item) (Task, bool, error) {
		t, err := ParseTask(item)
		return t, err == nil && t.Deleted, err
	}, onCorrupt)
	page.Items = slices.DeleteFunc(page.Items, func(t Task) bool { return !q.matches(t) })
	return page, err
}

// carriedInto is the open tasks a new daily note for day carries in: what
// is still open from earlier days. Tasks starting on day itself stay in
// Still open.
func (r *tasksRepo) carriedInto(ctx context.Context, userID, area, day string, onCorrupt func(*api.DataIntegrityError)) ([]string, error) {
	q := listTasksQuery{area: area, open: true, startOnOrBefore: day, today: day, limit: 100}
	tasks, err := CollectPages(carryInMax, func(cursor string) (store.Page[Task], error) {
		q.cursor = cursor
		return r.list(ctx, userID, q, onCorrupt)
	}, func(t Task) bool { return t.StartDate == nil || *t.StartDate != day })
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
	}
	return ids, nil
}
