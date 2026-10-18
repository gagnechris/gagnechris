package notebook

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
)

const (
	openDay      = "2026-10-12"
	openNoteID   = "01JZ00000000000000000000N1"
	carriedID    = "01JZ00000000000000000000T1"
	embeddedID   = "01JZ00000000000000000000T2"
	movedID      = "01JZ00000000000000000000T3"
	openTemplate = "## Notes for {{weekday}}\n- \n\n## Focus for {{weekday}}\n- \n"
	// What a move to Monday leaves: the filled template, the moved task's
	// block after it, and a task from earlier already written in.
	movedBody = "## Notes for Monday\n{{task:" + embeddedID + "}}\n\n## Focus for Monday\n- \n\n{{task:" + movedID + "}}\n\n"
)

// openFixture is one user's table for an /open of openDay: the day's note,
// three open tasks and a template that carries into its second section.
type openFixture struct {
	t     *testing.T
	f     *datatest.Fake
	h     handlers
	mu    sync.Mutex
	note  Note
	notes []data.Item // GetItem answers for the note after the first read, in order
	puts  []data.Item
}

func newOpenFixture(t *testing.T, unopened bool) *openFixture {
	clock := func() time.Time { return testNow }
	f := &datatest.Fake{}
	table := fakeTable(f)
	x := &openFixture{t: t, f: f}
	x.h = handlers{
		notes: newNotesRepo(table, clock), tasks: newTasksRepo(table, clock), templates: &templatesRepo{table: table, now: clock},
		areas: &areasRepo{table: table, now: clock}, table: table, now: clock,
	}
	x.note = newNote(openNoteID, "daily")
	day := openDay
	x.note.Date = &day
	x.note.BodyMarkdown = movedBody
	x.note.TaskIDs = TaskEmbedIDs(movedBody)
	x.note.Unopened = unopened

	at := testNow.Format("2006-01-02T15:04:05.000Z")
	earlier, monday := "2026-10-09", openDay
	var tasks []data.Item
	for _, t := range []Task{
		{ID: carriedID},
		{ID: embeddedID, StartDate: &earlier},
		{ID: movedID, StartDate: &monday},
	} {
		t.UserID, t.Area, t.Title, t.Priority, t.Status = "u1", "work", "T", "med", "todo"
		t.Tags, t.Version, t.CreatedAt, t.UpdatedAt = []string{}, 1, at, at
		tasks = append(tasks, x.h.tasks.base.storedItem(t, nil, nil))
	}

	template := templateKey("u1", "work")
	template["entityType"] = data.S("dailyTemplate")
	template["userId"] = data.S("u1")
	template["area"] = data.S("work")
	template["isDefault"] = data.Bool(false)
	template["bodyMarkdown"] = data.S(openTemplate)
	template["carryOverSection"] = data.S("Focus for {{weekday}}")
	template["version"] = data.N(1)
	template["createdAt"] = data.S(at)
	template["updatedAt"] = data.S(at)

	claim := dailyClaimKey("u1", "work", openDay)
	claim["noteId"] = data.S(openNoteID)
	claimPk := attrS(claim["pk"])
	f.GetItemFn = func(in *dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
		x.mu.Lock()
		defer x.mu.Unlock()
		switch attrS(in.Key["pk"]) {
		case claimPk:
			return &dynamodb.GetItemOutput{Item: claim}, nil
		case attrS(template["pk"]):
			return &dynamodb.GetItemOutput{Item: template}, nil
		case keys.NotePk("u1", openNoteID):
			item := x.h.notes.base.storedItem(x.note, nil, nil)
			if len(x.notes) > 0 {
				item, x.notes = x.notes[0], x.notes[1:]
			}
			return &dynamodb.GetItemOutput{Item: item}, nil
		}
		return &dynamodb.GetItemOutput{}, nil
	}
	f.QueryFn = func(in *dynamodb.QueryInput) (*dynamodb.QueryOutput, error) {
		out := &dynamodb.QueryOutput{}
		if attrS(in.ExpressionAttributeValues[":pk"]) != keys.TaskAreaStatusGSI1Pk("u1", "work", "todo") {
			return out, nil
		}
		from, to := attrS(in.ExpressionAttributeValues[":from"]), attrS(in.ExpressionAttributeValues[":to"])
		for _, item := range tasks {
			if sk := attrS(item["gsi1sk"]); sk >= from && sk <= to {
				out.Items = append(out.Items, item)
			}
		}
		return out, nil
	}
	f.PutItemFn = func(in *dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error) {
		x.mu.Lock()
		defer x.mu.Unlock()
		x.puts = append(x.puts, in.Item)
		return &dynamodb.PutItemOutput{}, nil
	}
	return x
}

func (x *openFixture) open() Note {
	x.t.Helper()
	var logs bytes.Buffer
	res, err := x.h.openDaily(context.Background(), &api.Request{
		Body: []byte(`{"id":"01JZ00000000000000000000N9"}`), Headers: map[string]string{},
		Params: map[string]string{"area": "work", "date": openDay}, Claims: map[string]string{"sub": "u1"},
		Log: observability.NewLogger(&logs, "test"), Metrics: observability.NewMetrics(&logs, "test", "test"),
	})
	if err != nil {
		x.t.Fatalf("openDaily: %v", err)
	}
	var n Note
	if err := json.Unmarshal(res.Body, &n); err != nil || res.Status != 200 {
		x.t.Fatalf("response = %d %s, want 200 with a note", res.Status, res.Body)
	}
	return n
}

const carriedBody = "## Notes for Monday\n{{task:" + embeddedID + "}}\n\n## Focus for Monday\n- \n\n{{task:" + movedID + "}}\n\n{{task:" + carriedID + "}}\n"

func TestOpenCarriesIntoAnUnopenedDailyNote(t *testing.T) {
	x := newOpenFixture(t, true)
	n := x.open()
	if n.BodyMarkdown != carriedBody || n.Version != 2 {
		t.Fatalf("note = v%d %q, want v2 %q", n.Version, n.BodyMarkdown, carriedBody)
	}
	if len(x.puts) != 1 {
		t.Fatalf("puts = %d, want 1", len(x.puts))
	}
	put := x.puts[0]
	if _, ok := put["unopened"]; ok {
		t.Fatal("the carried note is still marked unopened")
	}
	if got := attrS(put["bodyMarkdown"]); got != carriedBody {
		t.Fatalf("stored body = %q, want %q", got, carriedBody)
	}
	if ids, _ := put["taskIds"].(*types.AttributeValueMemberL); ids == nil || len(ids.Value) != 3 {
		t.Fatalf("stored taskIds = %v, want the three embeds", put["taskIds"])
	}
}

func TestOpenLeavesAnOpenedDailyNoteAlone(t *testing.T) {
	x := newOpenFixture(t, false)
	n := x.open()
	if n.BodyMarkdown != movedBody || n.Version != 1 {
		t.Fatalf("note = v%d %q, want it unchanged", n.Version, n.BodyMarkdown)
	}
	if writes := len(x.puts) + x.f.Count("UpdateItem") + x.f.Count("TransactWriteItems"); writes != 0 {
		t.Fatalf("writes = %d, want none", writes)
	}
}

// With nothing to carry the mark goes without a new version, so an editor
// holding the note is not made stale.
func TestOpenClearsTheMarkWhenNothingCarries(t *testing.T) {
	x := newOpenFixture(t, true)
	x.note.BodyMarkdown += "{{task:" + carriedID + "}}\n"
	x.note.TaskIDs = TaskEmbedIDs(x.note.BodyMarkdown)
	var update *dynamodb.UpdateItemInput
	x.f.UpdateItemFn = func(in *dynamodb.UpdateItemInput) (*dynamodb.UpdateItemOutput, error) {
		update = in
		return &dynamodb.UpdateItemOutput{}, nil
	}
	n := x.open()
	if n.Version != 1 || n.BodyMarkdown != x.note.BodyMarkdown || len(x.puts) != 0 {
		t.Fatalf("note = v%d with %d puts, want v1 unchanged and no put", n.Version, len(x.puts))
	}
	if update == nil || aws.ToString(update.UpdateExpression) != "REMOVE unopened" ||
		!strings.Contains(aws.ToString(update.ConditionExpression), "version = :v") {
		t.Fatalf("update = %+v, want the mark removed at version 1", update)
	}
}

// Two opens read the unopened note at once: the slower one's write fails its
// version condition and it returns the note the faster one carried into.
func TestOpenRacingAnotherOpenCarriesOnce(t *testing.T) {
	x := newOpenFixture(t, true)
	carried := x.note
	carried.BodyMarkdown, carried.TaskIDs, carried.Version, carried.Unopened = carriedBody, TaskEmbedIDs(carriedBody), 2, false
	stale := x.h.notes.base.storedItem(x.note, nil, nil)
	won := x.h.notes.base.storedItem(carried, nil, nil)
	// getDaily, mutate's read, the conflict's read, then getDaily again.
	x.notes = []data.Item{stale, stale, won, won}
	x.f.PutItemFn = func(in *dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error) {
		x.mu.Lock()
		defer x.mu.Unlock()
		x.puts = append(x.puts, in.Item)
		return nil, &types.ConditionalCheckFailedException{Message: aws.String("version")}
	}
	n := x.open()
	if n.BodyMarkdown != carriedBody || n.Version != 2 {
		t.Fatalf("note = v%d %q, want the other open's v2", n.Version, n.BodyMarkdown)
	}
	if len(x.puts) != 1 {
		t.Fatalf("puts = %d, want 1", len(x.puts))
	}
}

func TestDailyNotesMadeOutsideOpenAreUnopened(t *testing.T) {
	f := &datatest.Fake{TransactWriteFn: func(*dynamodb.TransactWriteItemsInput) (*dynamodb.TransactWriteItemsOutput, error) {
		return &dynamodb.TransactWriteItemsOutput{}, nil
	}}
	repo := newNotesRepo(fakeTable(f), func() time.Time { return testNow })
	ctx := context.Background()
	body := "{{task:" + movedID + "}}"
	moved, err := repo.createDaily(ctx, "u1", "work", openDay, dailyFields{id: openNoteID, noteFields: noteFields{bodyMarkdown: &body}})
	if err != nil || !moved.Unopened {
		t.Fatalf("PUT create = %+v, %v; want it unopened", moved, err)
	}
	opened, err := repo.createDaily(ctx, "u1", "work", openDay, dailyFields{id: openNoteID, opened: true})
	if err != nil || opened.Unopened {
		t.Fatalf("/open create = %+v, %v; want it opened", opened, err)
	}
	page, err := repo.create(ctx, "u1", createNoteInput{id: openNoteID, area: "work", noteType: "page"})
	if err != nil || page.Unopened {
		t.Fatalf("page = %+v, %v; want no mark", page, err)
	}

	edited, err := applyNoteUpdate(moved, noteFields{bodyMarkdown: &body}, "later")
	if err != nil || !edited.Unopened {
		t.Fatal("an edit before the day opens dropped the mark")
	}
	stored := noteItem(moved)
	if _, ok := stored["unopened"]; !ok {
		t.Fatal("the stored row has no unopened mark")
	}
	parsed, err := ParseNote(stored)
	if err != nil || !parsed.Unopened {
		t.Fatalf("ParseNote = %+v, %v; want the mark read back", parsed, err)
	}
	if out, _ := json.Marshal(moved); bytes.Contains(out, []byte("nopened")) {
		t.Fatalf("API note %s shows the mark", out)
	}
	if _, ok := noteItem(opened)["unopened"]; ok {
		t.Fatal("an opened note's row carries the mark")
	}
}
