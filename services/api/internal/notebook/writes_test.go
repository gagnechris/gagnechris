package notebook

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

// fakeDynamo answers DynamoDB's JSON protocol, since DynamoDB Local can't
// produce a TransactionConflictException.
type fakeDynamo struct {
	mu       sync.Mutex
	items    []data.Item // GetItem answers, in order; the last repeats
	gets     []bool      // ConsistentRead of each GetItem
	putError string      // PutItem's __type, or "" for success
}

func (f *fakeDynamo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var body struct{ ConsistentRead bool }
	_ = json.NewDecoder(r.Body).Decode(&body)
	w.Header().Set("Content-Type", "application/x-amz-json-1.0")
	switch op := strings.TrimPrefix(r.Header.Get("X-Amz-Target"), "DynamoDB_20120810."); op {
	case "GetItem":
		f.gets = append(f.gets, body.ConsistentRead)
		var item data.Item
		if len(f.items) > 0 {
			item = f.items[0]
			if len(f.items) > 1 {
				f.items = f.items[1:]
			}
		}
		out := map[string]any{}
		if item != nil {
			out["Item"] = wireItem(item)
		}
		_ = json.NewEncoder(w).Encode(out)
	case "PutItem":
		if f.putError != "" {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"__type": "com.amazonaws.dynamodb.v20120810#" + f.putError, "message": "conflict"})
			return
		}
		_, _ = w.Write([]byte("{}"))
	default:
		http.Error(w, "unexpected "+op, http.StatusNotImplemented)
	}
}

func wireItem(item data.Item) map[string]any {
	out := make(map[string]any, len(item))
	for k, v := range item {
		out[k] = wireValue(v)
	}
	return out
}

func wireValue(v types.AttributeValue) any {
	switch v := v.(type) {
	case *types.AttributeValueMemberS:
		return map[string]string{"S": v.Value}
	case *types.AttributeValueMemberN:
		return map[string]string{"N": v.Value}
	case *types.AttributeValueMemberBOOL:
		return map[string]bool{"BOOL": v.Value}
	case *types.AttributeValueMemberNULL:
		return map[string]bool{"NULL": true}
	case *types.AttributeValueMemberSS:
		return map[string][]string{"SS": v.Value}
	case *types.AttributeValueMemberL:
		list := make([]any, len(v.Value))
		for i, e := range v.Value {
			list[i] = wireValue(e)
		}
		return map[string]any{"L": list}
	case *types.AttributeValueMemberM:
		return map[string]any{"M": wireItem(v.Value)}
	}
	panic("unsupported attribute value")
}

func fakeTable(t *testing.T, f *fakeDynamo) *data.Table {
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	db := dynamodb.New(dynamodb.Options{
		Region:           "us-east-1",
		BaseEndpoint:     aws.String(srv.URL),
		Credentials:      aws.AnonymousCredentials{},
		RetryMaxAttempts: 1,
	})
	return &data.Table{DB: db, Name: "test"}
}

var testNow = time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)

func storedNote(r *notesRepo, version int) data.Item {
	at := testNow.Add(time.Duration(version) * time.Minute).Format("2006-01-02T15:04:05.000Z")
	return r.base.storedItem(Note{
		ID: "01JZ0000000000000000000001", UserID: "u1", Area: "work", Type: "page",
		Title: "Plan", BodyMarkdown: "v" + strconv.Itoa(version), Tags: []string{}, TaskIDs: []string{},
		Version: version, CreatedAt: at, UpdatedAt: at,
	}, nil, nil)
}

// Another request's transaction held the note: a version conflict, not a 500.
func TestUpdateHittingATransactionIsAVersionConflict(t *testing.T) {
	f := &fakeDynamo{putError: "TransactionConflictException"}
	repo := newNotesRepo(fakeTable(t, f), func() time.Time { return testNow })
	f.items = []data.Item{storedNote(repo, 3), storedNote(repo, 4)}

	title := "Plan B"
	_, err := repo.update(context.Background(), "u1", "01JZ0000000000000000000001", api.Expected{Set: true, Version: 3}, noteFields{title: &title})

	var conflict *api.ConflictError
	if !errors.As(err, &conflict) {
		t.Fatalf("err = %v, want a ConflictError", err)
	}
	if conflict.Code != api.CodeVersionConflict || conflict.CurrentVersion == nil || *conflict.CurrentVersion != 4 {
		t.Fatalf("conflict = %+v, want version_conflict with current version 4", conflict)
	}
	if cur, ok := conflict.Current.(Note); !ok || cur.BodyMarkdown != "v4" {
		t.Fatalf("current = %#v, want the version 4 note", conflict.Current)
	}
}

// A task created right after its note must see that note.
func TestLinkedNoteCheckReadsConsistently(t *testing.T) {
	f := &fakeDynamo{}
	table := fakeTable(t, f)
	h := handlers{notes: newNotesRepo(table, time.Now), table: table}
	f.items = []data.Item{storedNote(h.notes, 1)}

	noteID := "01JZ0000000000000000000001"
	if err := h.checkLinkedNote(context.Background(), "u1", &noteID); err != nil {
		t.Fatalf("checkLinkedNote: %v", err)
	}
	if len(f.gets) != 1 || !f.gets[0] {
		t.Fatalf("GetItem ConsistentRead = %v, want [true]", f.gets)
	}
}
