package search

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/notebook"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	note, err := notebook.ParseNote(samplerows.Item("noteDaily"))
	if err != nil {
		t.Fatal(err)
	}
	task, err := notebook.ParseTask(samplerows.Item("task"))
	if err != nil {
		t.Fatal(err)
	}
	noteMatch, ok := noteHit("private", note, nil)
	if !ok {
		t.Fatal("no note hit")
	}
	taskMatch, ok := taskHit("do", task)
	if !ok {
		t.Fatal("no task hit")
	}
	apitypestest.Conforms[apitypes.NotebookSearchResponse](t, response{
		Notes:     []Hit{noteMatch},
		Tasks:     []Hit{taskMatch},
		Truncated: true,
	})
}
