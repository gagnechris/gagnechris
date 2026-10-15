package notebook

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
)

// A sparse filter reads whole pages: 400 rows that don't match cost a few
// Queries, not one each.
func TestSparseTaskFilterReadsWholePages(t *testing.T) {
	f := &fakeDynamo{partitions: map[string][]data.Item{}}
	repo := newTasksRepo(fakeTable(f), func() time.Time { return testNow })
	pk := keys.TaskAreaStatusGSI1Pk("u1", "work", "todo")
	at := testNow.Format("2006-01-02T15:04:05.000Z")
	for i := range 401 {
		priority := "low"
		if i == 400 {
			priority = "high"
		}
		f.partitions[pk] = append(f.partitions[pk], repo.base.storedItem(Task{
			ID: fmt.Sprintf("01JZ%022d", i), UserID: "u1", Area: "work", Title: "t", Priority: priority,
			Status: "todo", Tags: []string{}, Version: 1, CreatedAt: at, UpdatedAt: at,
		}, nil, nil))
	}

	q := listTasksQuery{areas: []string{"work", "personal"}, priority: "high", limit: 1, today: "2026-10-11"}
	var found []Task
	requests := 0
	for {
		requests++
		page, err := repo.list(context.Background(), "u1", q, func(*api.DataIntegrityError) {})
		if err != nil {
			t.Fatal(err)
		}
		found = append(found, page.Items...)
		if page.NextCursor == "" {
			break
		}
		q.cursor = page.NextCursor
	}
	if len(found) != 1 || found[0].Priority != "high" {
		t.Fatalf("found = %+v, want the one high-priority task", found)
	}
	if f.queries > 20 {
		t.Fatalf("%d Queries over %d requests, want at most 20", f.queries, requests)
	}
}
