package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
)

const testUser = "u1"

// fakeIndex answers GSI1 Queries from rows kept sorted by gsi1sk.
type fakeIndex struct {
	datatest.Fake
	mu         sync.Mutex
	partitions map[string][]data.Item
}

func (f *fakeIndex) add(item data.Item) {
	f.mu.Lock()
	defer f.mu.Unlock()
	pk := attrS(item["gsi1pk"])
	f.partitions[pk] = append(f.partitions[pk], item)
	slices.SortFunc(f.partitions[pk], func(a, b data.Item) int {
		return strings.Compare(attrS(a["gsi1sk"]), attrS(b["gsi1sk"]))
	})
}

func (f *fakeIndex) Query(_ context.Context, in *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rows := slices.Clone(f.partitions[attrS(in.ExpressionAttributeValues[":pk"])])
	if !aws.ToBool(in.ScanIndexForward) {
		slices.Reverse(rows)
	}
	start := 0
	if after := attrS(in.ExclusiveStartKey["gsi1sk"]); after != "" {
		for start < len(rows) && attrS(rows[start]["gsi1sk"]) != after {
			start++
		}
		start++
	}
	end := min(start+int(aws.ToInt32(in.Limit)), len(rows))
	out := &dynamodb.QueryOutput{Items: rows[start:end]}
	if end < len(rows) {
		last := rows[end-1]
		out.LastEvaluatedKey = data.Item{"pk": last["pk"], "sk": last["sk"], "gsi1pk": last["gsi1pk"], "gsi1sk": last["gsi1sk"]}
	}
	return out, nil
}

func attrS(v types.AttributeValue) string {
	if s, ok := v.(*types.AttributeValueMemberS); ok {
		return s.Value
	}
	return ""
}

func row(sample string, fields map[string]string) data.Item {
	item := maps.Clone(samplerows.Item(sample))
	for k, v := range fields {
		item[k] = data.S(v)
	}
	return item
}

func (f *fakeIndex) note(area, id, title, date string) {
	fields := map[string]string{
		"pk": "USER#" + testUser + "#NOTE#" + id, "id": id, "userId": testUser, "area": area,
		"title": title, "bodyMarkdown": title, "gsi1pk": keys.NotebookAreaGSI1Pk(testUser, area),
	}
	if date == "" {
		item := row("notePage", fields)
		item["gsi1sk"] = data.S(keys.NotePageGSI1Sk(attrS(item["updatedAt"]), id))
		f.add(item)
		return
	}
	fields["date"] = date
	fields["gsi1sk"] = keys.NoteDateGSI1Sk(date, id)
	f.add(row("noteDaily", fields))
}

func (f *fakeIndex) task(area, status, id, title string) {
	f.add(row("task", map[string]string{
		"pk": "USER#" + testUser + "#TASK#" + id, "id": id, "userId": testUser, "area": area,
		"status": status, "title": title, "gsi1pk": keys.TaskAreaStatusGSI1Pk(testUser, area, status),
		"gsi1sk": keys.TaskUpdatedGSI1Sk("2026-10-01T12:00:00.000Z", id),
	}))
}

func runSearch(t *testing.T, f *fakeIndex, body string) (*bool, []string, []string) {
	t.Helper()
	h := handler{table: &data.Table{DB: f, Name: "test"}, now: time.Now}
	var logs, emf bytes.Buffer
	res, err := h.search(context.Background(), &api.Request{
		Body:    []byte(body),
		Claims:  map[string]string{"sub": testUser},
		Log:     observability.NewLogger(&logs, "test"),
		Metrics: observability.NewMetrics(&emf, "test", "test"),
	})
	if err != nil {
		t.Fatal(err)
	}
	var raw struct {
		Notes     []struct{ ID string } `json:"notes"`
		Tasks     []struct{ ID string } `json:"tasks"`
		Truncated *bool                 `json:"truncated"`
	}
	if err := json.Unmarshal(res.Body, &raw); err != nil {
		t.Fatal(err)
	}
	var notes, tasks []string
	for _, n := range raw.Notes {
		notes = append(notes, n.ID)
	}
	for _, x := range raw.Tasks {
		tasks = append(tasks, x.ID)
	}
	slices.Sort(notes)
	slices.Sort(tasks)
	return raw.Truncated, notes, tasks
}

func TestSearchPastTheScanCapKeepsOpenTasksOfEveryArea(t *testing.T) {
	f := &fakeIndex{partitions: map[string][]data.Item{}}
	for i := range scanCap + 100 {
		f.task("work", "done", fmt.Sprintf("01DONE%020d", i), "Archive")
	}
	f.task("work", "todo", "01OPENWORK", "Ship the release")
	f.task("personal", "todo", "01OPENHOME", "Ship the parcel")
	f.task("personal", "in_progress", "01STARTED", "Ship the boxes")

	truncated, _, tasks := runSearch(t, f, `{"q":"ship","limit":50}`)
	for _, id := range []string{"01OPENWORK", "01OPENHOME", "01STARTED"} {
		if !slices.Contains(tasks, id) {
			t.Errorf("open task %s missing from %d hits", id, len(tasks))
		}
	}
	if truncated == nil || !*truncated {
		t.Errorf("truncated = %v, want true", truncated)
	}
}

func TestSearchPastTheScanCapReadsNewestNotesAndPagesFirst(t *testing.T) {
	f := &fakeIndex{partitions: map[string][]data.Item{}}
	day := time.Date(2016, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := range scanCap + 100 {
		f.note("work", fmt.Sprintf("01OLD%021d", i), "Daily", day.AddDate(0, 0, i).Format("2006-01-02"))
	}
	f.note("work", "01NEWDAILY", "Roadmap review", "2026-10-13")
	f.note("work", "01WORKPAGE", "Roadmap", "")
	f.note("personal", "01HOMEPAGE", "Roadmap for the garden", "")

	truncated, notes, _ := runSearch(t, f, `{"q":"roadmap"}`)
	if want := []string{"01HOMEPAGE", "01NEWDAILY", "01WORKPAGE"}; !slices.Equal(notes, want) {
		t.Errorf("notes %v, want %v", notes, want)
	}
	if truncated == nil || !*truncated {
		t.Errorf("truncated = %v, want true", truncated)
	}
}

func TestSearchUnderTheScanCapIsNotTruncated(t *testing.T) {
	f := &fakeIndex{partitions: map[string][]data.Item{}}
	f.note("work", "01PAGE", "Roadmap", "")
	f.task("personal", "done", "01DONE", "Roadmap sign-off")

	truncated, notes, tasks := runSearch(t, f, `{"q":"roadmap"}`)
	if !slices.Equal(notes, []string{"01PAGE"}) || !slices.Equal(tasks, []string{"01DONE"}) {
		t.Errorf("notes %v tasks %v", notes, tasks)
	}
	if truncated == nil || *truncated {
		t.Errorf("truncated = %v, want false", truncated)
	}
}
