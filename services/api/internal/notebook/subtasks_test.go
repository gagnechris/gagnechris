package notebook

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
)

// rowTable is an in-memory table: GetItem and PutItem by key, and Query on
// GSI1 and GSI2 honouring a BETWEEN sort-key condition. read is the id of
// every row a Query returned.
type rowTable struct {
	datatest.Fake
	mu   sync.Mutex
	rows []data.Item
	read []string
}

func (f *rowTable) find(key data.Item) int {
	return slices.IndexFunc(f.rows, func(r data.Item) bool {
		return attrS(r["pk"]) == attrS(key["pk"]) && attrS(r["sk"]) == attrS(key["sk"])
	})
}

func (f *rowTable) GetItem(_ context.Context, in *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := &dynamodb.GetItemOutput{}
	if i := f.find(in.Key); i >= 0 {
		out.Item = f.rows[i]
	}
	return out, nil
}

func (f *rowTable) PutItem(_ context.Context, in *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if i := f.find(in.Item); i >= 0 {
		f.rows[i] = in.Item
	} else {
		f.rows = append(f.rows, in.Item)
	}
	return &dynamodb.PutItemOutput{}, nil
}

func (f *rowTable) Query(_ context.Context, in *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	pkAttr, skAttr := "gsi1pk", "gsi1sk"
	if aws.ToString(in.IndexName) == keys.GSI2 {
		pkAttr, skAttr = "gsi2pk", "gsi2sk"
	}
	from, to := attrS(in.ExpressionAttributeValues[":from"]), attrS(in.ExpressionAttributeValues[":to"])
	after := attrS(in.ExclusiveStartKey[skAttr])
	var match []data.Item
	for _, r := range f.rows {
		sk := attrS(r[skAttr])
		if attrS(r[pkAttr]) != attrS(in.ExpressionAttributeValues[":pk"]) || (from != "" && (sk < from || sk > to)) || sk <= after {
			continue
		}
		match = append(match, r)
	}
	slices.SortFunc(match, func(a, b data.Item) int { return strings.Compare(attrS(a[skAttr]), attrS(b[skAttr])) })
	end := min(int(aws.ToInt32(in.Limit)), len(match))
	out := &dynamodb.QueryOutput{Items: match[:end]}
	if end < len(match) {
		last := match[end-1]
		out.LastEvaluatedKey = data.Item{"pk": last["pk"], "sk": last["sk"], pkAttr: last[pkAttr], skAttr: last[skAttr]}
	}
	for _, r := range out.Items {
		f.read = append(f.read, attrS(r["id"]))
	}
	return out, nil
}

// Deleting a parent reads its home note and the notes written since it was
// created, never the area's older notes.
func TestClearSubtasksSkipsNotesOlderThanTheParent(t *testing.T) {
	f := &rowTable{}
	table := fakeTable(f)
	clock := func() time.Time { return testNow }
	h := handlers{notes: newNotesRepo(table, clock), tasks: newTasksRepo(table, clock), table: table, now: clock}
	at := jstime.ISO(testNow)
	old := jstime.ISO(testNow.AddDate(0, -2, 0))

	const (
		parentID   = "01JZ00000000000000000000P0"
		homeID     = "01JZ00000000000000000000H0"
		carriedID  = "01JZ00000000000000000000D0"
		subHomeID  = "01JZ00000000000000000000S1"
		subDailyID = "01JZ00000000000000000000S2"
	)
	note := func(id, typ, date, updated string, taskIDs ...string) {
		n := Note{
			ID: id, UserID: "u1", Area: "work", Type: typ, Title: "N", Tags: []string{},
			TaskIDs: append([]string{}, taskIDs...), Version: 1, CreatedAt: updated, UpdatedAt: updated,
		}
		if date != "" {
			n.Date = &date
		}
		f.rows = append(f.rows, h.notes.base.storedItem(n, nil, nil))
	}
	task := func(id, noteID string, parent *string, created string) {
		f.rows = append(f.rows, h.tasks.base.storedItem(Task{
			ID: id, UserID: "u1", Area: "work", Title: "T", Priority: "med", Status: "todo",
			NoteID: &noteID, ParentID: parent, Tags: []string{}, Version: 1, CreatedAt: created, UpdatedAt: created,
		}, nil, nil))
	}

	// The parent's home is an old page; it was carried into today's daily
	// note, where the second subtask lives.
	note(homeID, "page", "", old, parentID, subHomeID)
	note(carriedID, "daily", "2026-10-11", at, parentID, subDailyID)
	for i := range 30 {
		day := testNow.AddDate(0, 0, -60+i).Format("2006-01-02")
		note(fmt.Sprintf("01JZOLD%019d", i), "daily", day, old, "01JZ00000000000000000000X0")
		note(fmt.Sprintf("01JZOLP%019d", i), "page", "", old)
	}
	parent := Task{ID: parentID, UserID: "u1", Area: "work", NoteID: aws.String(homeID), CreatedAt: at}
	pid := parentID
	task(subHomeID, homeID, &pid, at)
	task(subDailyID, carriedID, &pid, at)

	if err := h.clearSubtasks(context.Background(), "u1", parent, func(e *api.DataIntegrityError) { t.Fatalf("corrupt row: %v", e) }); err != nil {
		t.Fatalf("clearSubtasks: %v", err)
	}
	for _, id := range []string{subHomeID, subDailyID} {
		got, err := h.tasks.base.getOrThrow(context.Background(), "u1", id)
		if err != nil {
			t.Fatalf("get %s: %v", id, err)
		}
		if got.ParentID != nil {
			t.Fatalf("%s parent = %s, want none", id, *got.ParentID)
		}
	}
	for _, id := range f.read {
		if strings.HasPrefix(id, "01JZOL") {
			t.Fatalf("read older note %s; reads = %v", id, f.read)
		}
	}
}
