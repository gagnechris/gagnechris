package notebook

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
)

func ptr(s string) *string { return &s }

func recapTask(id, title, status string) Task {
	return Task{ID: id, UserID: "u1", Area: "work", Title: title, Status: status, Priority: "med",
		Tags: []string{}, Version: 1, CreatedAt: "2026-10-20T09:00:00.000Z", UpdatedAt: "2026-10-20T09:00:00.000Z"}
}

func TestRecapPromptSpellsOutTheWeek(t *testing.T) {
	done := recapTask("01JZ00000000000000000000T1", "Ship the export", "done")
	done.CompletedAt = ptr("2026-10-27T15:00:00.000Z")
	late := recapTask("01JZ00000000000000000000T2", "Renew passport", "todo")
	late.DueDate = ptr("2026-10-28")
	late.Priority = "high"
	next := recapTask("01JZ00000000000000000000T3", "Plan Q1", "todo")
	next.StartDate = ptr("2026-11-03")

	tue := newNote("01JZ00000000000000000000N2", "daily")
	tue.Date = ptr("2026-10-27")
	tue.BodyMarkdown = "## Focus\n{{task:" + done.ID + "}}\n  {{task:01JZ00000000000000000000T9}}\nGood day."
	mon := newNote("01JZ00000000000000000000N1", "daily")
	mon.Date = ptr("2026-10-26")
	mon.BodyMarkdown = "{{task:" + late.ID + "}}"

	got := RecapPrompt(RecapWeek{
		AreaName: "Work", Start: "2026-10-26", End: "2026-11-01", NextStart: "2026-11-02", NextEnd: "2026-11-08",
		Notes: []Note{tue, mon}, Held: []Task{done, late}, Open: []Task{late, next},
	})
	for _, want := range []string{
		"Area: Work\n",
		"This week: Monday, Oct 26 to Sunday, Nov 1\n",
		"Next week: Monday, Nov 2 to Sunday, Nov 8\n",
		"<note day=\"Tuesday, Oct 27\">\n## Focus\n- [done 2026-10-27; created 2026-10-20] Ship the export\n  - (a task that was since deleted)\nGood day.\n</note>",
		"- [open; high priority; due 2026-10-28 (overdue by the end of the week); created 2026-10-20] Renew passport",
		"- [open; starts 2026-11-03; created 2026-10-20] Plan Q1",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("prompt is missing %q:\n%s", want, got)
		}
	}
	if strings.Index(got, "Monday, Oct 26\">") > strings.Index(got, "Tuesday, Oct 27\">") {
		t.Errorf("notes are not in day order:\n%s", got)
	}
	if strings.Contains(got, "{{task:") {
		t.Errorf("prompt kept a task token:\n%s", got)
	}
}

func TestRecapPromptSaysWhenTheWeekIsEmpty(t *testing.T) {
	got := RecapPrompt(RecapWeek{AreaName: "Personal", Start: "2026-10-26", End: "2026-11-01", NextStart: "2026-11-02", NextEnd: "2026-11-08"})
	for _, want := range []string{"No daily notes this week.", "<tasks_in_this_weeks_notes>\nNone.", "<open_tasks_in_area>\nNone."} {
		if !strings.Contains(got, want) {
			t.Errorf("prompt is missing %q:\n%s", want, got)
		}
	}
}

func TestCleanRecapKeepsItANote(t *testing.T) {
	got := CleanRecap("# Weekly recap\n\n## Done\n- [x] Shipped\n[ ] Call Sam\n  - [ ] nested\n{{task:01JZ00000000000000000000T1}}\n```\n[ ] in code\n```\n")
	want := "## Done\n- Shipped\n- Call Sam\n  - nested\n{ {task:01JZ00000000000000000000T1}}\n```\n[ ] in code\n```"
	if got != want {
		t.Errorf("CleanRecap =\n%s\nwant\n%s", got, want)
	}
	if len(TaskEmbedIDs(got)) > 0 || CleanRecap("  \n") != RecapFailedMarkdown {
		t.Error("an embed survived, or an empty reply became an empty note")
	}
}

func TestRecapTitleAndWeekStart(t *testing.T) {
	if got := RecapTitle("2026-10-26"); got != "Week of Oct 26, 2026" {
		t.Errorf("RecapTitle = %q", got)
	}
	for day, want := range map[string]string{"2026-10-26": "", "2026-10-27": api.CodeCustom, "2026-02-30": api.CodeCustom, "26-10-2026": api.CodeInvalidFormat} {
		if got := monday(day); got != want {
			t.Errorf("monday(%q) = %q, want %q", day, got, want)
		}
	}
}

// finishFake serves stored as the note and keeps the row Finish writes.
func finishFake(stored *Note) (*datatest.Fake, *data.Item) {
	f := &datatest.Fake{}
	var written data.Item
	f.GetItemFn = func(*dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
		if stored == nil {
			return &dynamodb.GetItemOutput{}, nil
		}
		return &dynamodb.GetItemOutput{Item: noteItem(*stored)}, nil
	}
	f.PutItemFn = func(in *dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error) {
		written = in.Item
		return &dynamodb.PutItemOutput{}, nil
	}
	return f, &written
}

func TestFinishReplacesThePlaceholder(t *testing.T) {
	pending := contract.Data.Notebook.WeeklyRecapPendingMarkdown
	for _, tc := range []struct{ body, want string }{
		{pending, "## The week\nCalm."},
		{"My own thoughts.", "My own thoughts.\n\n## The week\nCalm."},
	} {
		n := newNote(newNoteID, "page")
		n.Tags = []string{RecapTag}
		n.BodyMarkdown = tc.body
		f, written := finishFake(&n)
		rc := NewRecapper(fakeTable(f), nil, nil)
		if _, err := rc.Finish(context.Background(), RecapJob{UserID: "u1", NoteID: newNoteID}, "## The week\nCalm."); err != nil {
			t.Fatal(err)
		}
		got, err := ParseNote(*written)
		if err != nil {
			t.Fatal(err)
		}
		if got.BodyMarkdown != tc.want || got.Version != 2 {
			t.Errorf("from %q: body %q, version %d", tc.body, got.BodyMarkdown, got.Version)
		}
	}
}

func TestFinishLeavesADeletedNoteAlone(t *testing.T) {
	f, written := finishFake(nil)
	rc := NewRecapper(fakeTable(f), nil, nil)
	if _, err := rc.Finish(context.Background(), RecapJob{UserID: "u1", NoteID: newNoteID}, "text"); err != nil {
		t.Fatal(err)
	}
	if *written != nil {
		t.Error("Finish wrote a note that is gone")
	}
}

type failingModel struct{}

func (failingModel) WriteRecap(context.Context, string, string) (string, error) {
	return "", errors.New("throttled")
}

func TestRunWritesTheFailureIntoTheNote(t *testing.T) {
	n := newNote(newNoteID, "page")
	n.BodyMarkdown = contract.Data.Notebook.WeeklyRecapPendingMarkdown
	f, written := finishFake(&n)
	f.QueryFn = func(*dynamodb.QueryInput) (*dynamodb.QueryOutput, error) { return &dynamodb.QueryOutput{}, nil }
	f.GetItemFn = func(in *dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
		if pk, _ := in.Key["pk"].(*types.AttributeValueMemberS); strings.HasSuffix(pk.Value, "#NOTEBOOK_AREAS") {
			return &dynamodb.GetItemOutput{}, nil
		}
		return &dynamodb.GetItemOutput{Item: noteItem(n)}, nil
	}
	rc := NewRecapper(fakeTable(f), failingModel{}, nil)
	err := rc.Run(context.Background(), RecapJob{UserID: "u1", NoteID: newNoteID, Area: "work", WeekStart: "2026-10-26"})
	if err == nil || !strings.Contains(err.Error(), "throttled") {
		t.Errorf("err = %v", err)
	}
	got, perr := ParseNote(*written)
	if perr != nil || got.BodyMarkdown != RecapFailedMarkdown {
		t.Errorf("note body %q (%v)", got.BodyMarkdown, perr)
	}
}
