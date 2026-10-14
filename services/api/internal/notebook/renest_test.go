package notebook

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
)

// The task was deleted between its area change and its renest: the change is
// committed, so the response is the updated task, not the renest's conflict.
func TestUpdateTaskReturnsTheCommittedTaskWhenRenestHitsADeletedTask(t *testing.T) {
	const (
		taskID   = "01JZ00000000000000000000T1"
		parentID = "01JZ00000000000000000000T0"
		noteID   = "01JZ00000000000000000000N1"
	)
	clock := func() time.Time { return testNow }
	f := &datatest.Fake{}
	table := fakeTable(f)
	h := handlers{notes: newNotesRepo(table, clock), tasks: newTasksRepo(table, clock), table: table, now: clock}
	at := testNow.Format("2006-01-02T15:04:05.000Z")
	home := noteID
	stored := Task{
		ID: taskID, UserID: "u1", Area: "work", Title: "T", Priority: "med", Status: "todo",
		NoteID: &home, Tags: []string{}, Version: 1, CreatedAt: at, UpdatedAt: at,
	}
	tombstone := stored
	tombstone.Version, tombstone.Area, tombstone.Deleted = 3, "personal", true
	parent := stored
	parent.ID, parent.Area, parent.NoteID = parentID, "personal", nil
	note := newNote(noteID, "page")
	note.BodyMarkdown = "{{task:" + parentID + "}}\n  {{task:" + taskID + "}}"
	note.TaskIDs = []string{parentID, taskID}

	taskReads := []data.Item{h.tasks.base.storedItem(stored, nil, nil), h.tasks.base.storedItem(tombstone, nil, nil)}
	f.GetItemFn = func(in *dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
		if attrS(in.Key["pk"]) == keys.NotePk("u1", noteID) {
			return &dynamodb.GetItemOutput{Item: h.notes.base.storedItem(note, nil, nil)}, nil
		}
		item := taskReads[0]
		if len(taskReads) > 1 {
			taskReads = taskReads[1:]
		}
		return &dynamodb.GetItemOutput{Item: item}, nil
	}
	f.PutItemFn = func(*dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error) { return &dynamodb.PutItemOutput{}, nil }
	f.BatchGetItemFn = func(*dynamodb.BatchGetItemInput) (*dynamodb.BatchGetItemOutput, error) {
		return &dynamodb.BatchGetItemOutput{Responses: map[string][]data.Item{"test": {h.tasks.base.storedItem(parent, nil, nil)}}}, nil
	}

	var logs bytes.Buffer
	res, err := h.updateTask(context.Background(), &api.Request{
		Body: []byte(`{"version":1,"area":"personal"}`), Headers: map[string]string{},
		Params: map[string]string{"id": taskID}, Claims: map[string]string{"sub": "u1"},
		Log: observability.NewLogger(&logs, "test"), Metrics: observability.NewMetrics(&logs, "test", "test"),
	})
	if err != nil {
		t.Fatalf("updateTask: %v", err)
	}
	if res.Status != 200 || !bytes.Contains(res.Body, []byte(`"area":"personal"`)) || !bytes.Contains(res.Body, []byte(`"version":2`)) {
		t.Fatalf("response = %d %s, want 200 with the version 2 task in personal", res.Status, res.Body)
	}
	if !bytes.Contains(logs.Bytes(), []byte("Subtask nesting failed")) {
		t.Fatalf("logs = %s, want the renest failure logged", logs.String())
	}
}
