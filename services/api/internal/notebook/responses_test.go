package notebook

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	daily, err := ParseNote(samplerows.Item("noteDaily"))
	if err != nil {
		t.Fatal(err)
	}
	page, err := ParseNote(samplerows.Item("notePage"))
	if err != nil {
		t.Fatal(err)
	}
	task, err := ParseTask(samplerows.Item("task"))
	if err != nil {
		t.Fatal(err)
	}
	day := "2026-10-02"
	scheduled := task
	scheduled.DueDate, scheduled.StartDate, scheduled.CompletedAt, scheduled.Tags = &day, &day, &task.UpdatedAt, []string{"home"}
	stored, err := parseTemplate(samplerows.Item("dailyTemplate"))
	if err != nil {
		t.Fatal(err)
	}

	for _, n := range []Note{daily, page} {
		apitypestest.Conforms[apitypes.Note](t, n)
	}
	for _, task := range []Task{task, scheduled} {
		apitypestest.Conforms[apitypes.Task](t, task)
	}
	apitypestest.Conforms[apitypes.NoteListResponse](t, itemsResponse[Note]{Items: []Note{daily, page}, NextCursor: "cursor"})
	apitypestest.Conforms[apitypes.NoteListResponse](t, itemsResponse[Note]{Items: []Note{}})
	apitypestest.Conforms[apitypes.NoteBatchResponse](t, itemsResponse[Note]{Items: []Note{page}})
	apitypestest.Conforms[apitypes.TaskListResponse](t, itemsResponse[Task]{Items: []Task{task, scheduled}, NextCursor: "cursor"})
	apitypestest.Conforms[apitypes.TaskBatchResponse](t, itemsResponse[Task]{Items: []Task{task}})
	apitypestest.Conforms[apitypes.EmptyDailyNote](t, emptyDaily{
		Exists: false, UserID: daily.UserID, Area: "work", Type: "daily", Date: day, Tags: []string{},
		TemplateMarkdown: "## Today",
	})
	apitypestest.Conforms[apitypes.DailyTemplate](t, stored.DailyTemplate)
	apitypestest.Conforms[apitypes.DailyTemplate](t, defaultTemplate("work"))

	live := func(typ string, id string, version int, updatedAt string, entity any) Change {
		return Change{Type: typ, ID: id, Version: version, UpdatedAt: updatedAt, Entity: entity}
	}
	gone := func(c Change) Change {
		c.Deleted, c.Entity = true, nil
		return c
	}
	noteChange := live(noteChangeType, daily.ID, daily.Version, daily.UpdatedAt, daily)
	taskChange := live(taskChangeType, task.ID, task.Version, task.UpdatedAt, task)
	apitypestest.Conforms[apitypes.NoteSyncChange0](t, noteChange)
	apitypestest.Conforms[apitypes.NoteSyncChange1](t, gone(noteChange))
	apitypestest.Conforms[apitypes.TaskSyncChange0](t, taskChange)
	apitypestest.Conforms[apitypes.TaskSyncChange1](t, gone(taskChange))
	apitypestest.Conforms[apitypes.SyncChangesResponse](t, changesPage{
		Changes:   []Change{noteChange, gone(taskChange)},
		NextSince: daily.UpdatedAt, NextCursor: "cursor",
	})
}
