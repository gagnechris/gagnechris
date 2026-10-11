package search

import (
	"strings"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/notebook"
)

func TestNoteSnippetIsPlainText(t *testing.T) {
	task := notebook.Task{ID: "01HTASKAAAAAAAAAAAAAAAAAAA", Title: "Review the Q4 plan", Status: "todo"}
	n := notebook.Note{
		ID:           "n1",
		Area:         "work",
		Type:         "page",
		Title:        "Focus",
		BodyMarkdown: "## Focus\nPrep for the **roadmap** review. See [[Project notes]].\n{{task:" + task.ID + "}}\n- [ ] Book the room",
	}
	hit, ok := noteHit("roadmap", n, map[string]*notebook.Task{task.ID: &task})
	if !ok {
		t.Fatal("no hit")
	}
	snippet := string(rune16(units(hit.Snippet)))
	if want := "Focus Prep for the roadmap review. See Project notes. Review the Q4 plan Book the room"; snippet != want {
		t.Errorf("snippet %q, want %q", snippet, want)
	}
	for _, marker := range []string{"##", "**", "[[", "- [ ]"} {
		if strings.Contains(snippet, marker) {
			t.Errorf("snippet %q holds %q", snippet, marker)
		}
	}
	if m := hit.Matches; len(m) != 1 || snippet[m[0].Start:m[0].End] != "roadmap" {
		t.Errorf("matches %v in %q", m, snippet)
	}
}

func TestTaskTitleHitShowsTheDescription(t *testing.T) {
	bare := notebook.Task{ID: "t1", Title: "Renew passport", Status: "todo", Version: 2}
	hit, ok := taskHit("passport", bare)
	if !ok || len(hit.Snippet) != 0 || len(hit.Matches) != 0 || hit.Matches == nil {
		t.Errorf("bare task: %+v", hit)
	}
	described := bare
	described.Description = "Photos at the **pharmacy** first"
	hit, ok = taskHit("passport", described)
	if got := string(rune16(units(hit.Snippet))); !ok || got != "Photos at the pharmacy first" || len(hit.Matches) != 0 {
		t.Errorf("described task: %q %+v", got, hit)
	}
}
