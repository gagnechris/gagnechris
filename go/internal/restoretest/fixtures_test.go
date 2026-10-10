package restoretest

import (
	"context"
	"testing"

	"github.com/gagnechris/gagnechris/go/internal/contract"
)

// Row timestamps in the contract samples.
const sampleTS = "2026-10-01T12:00:00.000Z"

func healthyItems() []Item {
	return []Item{
		contract.Sample("home"),
		contract.Sample("resume"),
		contract.Sample("noteDaily"),
		contract.Sample("task"),
		contract.Sample("dailyNoteClaim"),
		// Key-only rows (no schema rule): rate counter, slug claim.
		{"pk": "RATE#ses#global", "sk": "DAY#2026-10-01", "count": 2.0},
		{"pk": "SLUG#hello", "sk": "POST", "entityType": "slug", "postId": "p1"},
		contract.Sample("project"),
		contract.Sample("projectPublished"),
		{"pk": "PROJECT_SLUG#notebook", "sk": "PROJECT", "entityType": "projectSlug", "projectId": "01PROJECT"},
	}
}

func without(items []Item, entityType string) []Item {
	var out []Item
	for _, item := range items {
		if item["entityType"] != entityType {
			out = append(out, item)
		}
	}
	return out
}

func notePageAt(id, ts string) Item {
	item := contract.Sample("notePage")
	item["id"] = id
	item["pk"] = "USER#" + item["userId"].(string) + "#NOTE#" + id
	item["createdAt"] = ts
	item["updatedAt"] = ts
	return item
}

func notePagesAt(ts string, n int) []Item {
	out := make([]Item, n)
	for i := range out {
		out[i] = notePageAt("01PAGE"+string(rune('A'+i)), ts)
	}
	return out
}

type fakeScan struct {
	items    []Item
	pageSize int
	calls    int
}

func pagedScan(items []Item, pageSize int) *fakeScan {
	return &fakeScan{items: items, pageSize: pageSize}
}

func (f *fakeScan) scan(_ context.Context, in ScanInput) (ScanPage, error) {
	f.calls++
	start := 0
	if in.ExclusiveStartKey != nil {
		start = in.ExclusiveStartKey.(int)
	}
	end := min(start+f.pageSize, len(f.items))
	page := ScanPage{Items: f.items[start:end]}
	if end < len(f.items) {
		page.LastEvaluatedKey = end
	}
	return page, nil
}

// fakeCount evaluates the floor's COUNT filter in memory, one item per page.
type fakeCount struct {
	items []Item
	calls []CountInput
}

func (f *fakeCount) count(_ context.Context, in CountInput) (CountPage, error) {
	f.calls = append(f.calls, in)
	start := 0
	if in.ExclusiveStartKey != nil {
		start = in.ExclusiveStartKey.(int)
	}
	cut := in.ExpressionAttributeValues[":cut"]
	at := func(v any) bool {
		s, ok := v.(string)
		return ok && s <= cut
	}
	page := CountPage{}
	if start < len(f.items) {
		item := f.items[start]
		if item["entityType"] == in.ExpressionAttributeValues[":t"] && (at(item["createdAt"]) || at(item["updatedAt"])) {
			page.Count = 1
		}
	}
	if start+1 < len(f.items) {
		page.LastEvaluatedKey = start + 1
	}
	return page, nil
}

func newValidator(t *testing.T) *Validator {
	t.Helper()
	v, err := NewValidator()
	if err != nil {
		t.Fatal(err)
	}
	return v
}
