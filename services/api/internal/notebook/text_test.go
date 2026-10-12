package notebook

import (
	"reflect"
	"testing"
)

func TestFindTaskEmbedsSkipsFencedLines(t *testing.T) {
	id := "01ARZ3NDEKTSV4RRFFQ69G5FAV"
	md := "  {{task:" + "01arz3ndektsv4rrffq69g5fav" + "}} \r\n```\n{{task:" + id + "}}\n~~~\n{{task:" + id + "}}\n````\ntext {{task:" + id + "}}"
	got := FindTaskEmbeds(md)
	want := []TaskEmbed{{ID: id, Line: 0, Indent: "  "}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("embeds %+v, want %+v", got, want)
	}
	done := &Task{Title: "Call", Status: "done"}
	out := ReplaceTaskEmbeds(md, func(e TaskEmbed) string { return TaskEmbedFallbackLine(e.Indent, done) })
	if want := "  - [x] Call\r\n```"; out[:len(want)] != want {
		t.Errorf("replaced %q", out)
	}
}

func TestTaskEmbedFallbackLine(t *testing.T) {
	for _, tc := range []struct {
		task *Task
		want string
	}{
		{nil, "- [ ] (deleted task)"},
		{&Task{Title: "A", Status: "dropped"}, "- [ ] ~~A~~ (dropped)"},
		{&Task{Title: "A", Status: "done"}, "- [x] A"},
		{&Task{Title: "A", Status: "in_progress"}, "- [ ] A"},
	} {
		if got := TaskEmbedFallbackLine("", tc.task); got != tc.want {
			t.Errorf("got %q, want %q", got, tc.want)
		}
	}
}

func TestSortTasksForList(t *testing.T) {
	d := func(s string) *string { return &s }
	tasks := []Task{
		{ID: "6", Status: "todo", Someday: true},
		{ID: "5", Status: "todo", Priority: "low"},
		{ID: "4", Status: "todo", Priority: "high"},
		{ID: "3", Status: "todo", StartDate: d("2026-10-12")},
		{ID: "2", Status: "done", StartDate: d("2026-10-01")},
		{ID: "1", Status: "todo", StartDate: d("2026-10-01")},
	}
	SortTasksForList(tasks, "2026-10-10")
	var ids string
	for _, task := range tasks {
		ids += task.ID
	}
	if ids != "123456" {
		t.Errorf("order %s", ids)
	}
}
