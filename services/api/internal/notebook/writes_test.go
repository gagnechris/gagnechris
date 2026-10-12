package notebook

import (
	"context"
	"errors"
	"strconv"
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
)

// fakeDynamo is an in-memory DynamoDB for the calls these tests make, since
// DynamoDB Local can't produce a TransactionConflictException.
type fakeDynamo struct {
	datatest.Fake
	mu     sync.Mutex
	items  []data.Item // GetItem answers, in order; the last repeats
	gets   []bool      // ConsistentRead of each GetItem
	putErr error
	// partitions answer Query by :pk, each sorted by the index's sort key.
	partitions map[string][]data.Item
	queries    int
}

// indexKeys are each queried index's key attributes, as DynamoDB puts them
// in LastEvaluatedKey after the table's.
var indexKeys = map[string][2]string{keys.GSI1: {"gsi1pk", "gsi1sk"}, keys.GSI3: {"syncPk", "syncSk"}}

func (f *fakeDynamo) GetItem(_ context.Context, in *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets = append(f.gets, aws.ToBool(in.ConsistentRead))
	out := &dynamodb.GetItemOutput{}
	if len(f.items) > 0 {
		out.Item = f.items[0]
		if len(f.items) > 1 {
			f.items = f.items[1:]
		}
	}
	return out, nil
}

func (f *fakeDynamo) PutItem(context.Context, *dynamodb.PutItemInput, ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	return &dynamodb.PutItemOutput{}, f.putErr
}

func (f *fakeDynamo) Query(_ context.Context, in *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queries++
	index := indexKeys[aws.ToString(in.IndexName)]
	rows := f.partitions[attrS(in.ExpressionAttributeValues[":pk"])]
	start := 0
	if after := attrS(in.ExclusiveStartKey[index[1]]); after != "" {
		for start < len(rows) && attrS(rows[start][index[1]]) <= after {
			start++
		}
	}
	end := min(start+int(aws.ToInt32(in.Limit)), len(rows))
	out := &dynamodb.QueryOutput{Items: rows[start:end]}
	if end < len(rows) {
		last := rows[end-1]
		out.LastEvaluatedKey = data.Item{"pk": last["pk"], "sk": last["sk"], index[0]: last[index[0]], index[1]: last[index[1]]}
	}
	return out, nil
}

func attrS(v types.AttributeValue) string {
	if s, ok := v.(*types.AttributeValueMemberS); ok {
		return s.Value
	}
	return ""
}

func fakeTable(db data.Client) *data.Table {
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
	f := &fakeDynamo{putErr: &types.TransactionConflictException{}}
	repo := newNotesRepo(fakeTable(f), func() time.Time { return testNow })
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
	table := fakeTable(f)
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
