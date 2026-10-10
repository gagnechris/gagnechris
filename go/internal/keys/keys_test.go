package keys

import (
	"testing"

	"github.com/gagnechris/gagnechris/go/internal/contract"
)

func TestKeysMatchTheTypeScriptBuilders(t *testing.T) {
	got := map[string]string{
		"SK_META":                   SKMeta,
		"SK_PUBLISHED":              SKPublished,
		"postPk({postId})":          PostPk("{postId}"),
		"projectPk({projectId})":    ProjectPk("{projectId}"),
		"homePk()":                  HomePk(),
		"resumePk()":                ResumePk(),
		"contactPk({contactId})":    ContactPk("{contactId}"),
		"contactMsgSk()":            ContactMsgSk(),
		"removedUsersPk()":          RemovedUsersPk(),
		"removedUserSk({userId})":   RemovedUserSk("{userId}"),
		"notePk({userId},{noteId})": NotePk("{userId}", "{noteId}"),
		"noteMetaSk()":              NoteMetaSk(),
		"taskPk({userId},{taskId})": TaskPk("{userId}", "{taskId}"),
		"taskMetaSk()":              TaskMetaSk(),
		"dailyNoteClaimPk({userId},{area},{date})": DailyNoteClaimPk("{userId}", "{area}", "{date}"),
		"dailyNoteClaimSk()":                       DailyNoteClaimSk(),
		"dailyTemplatePk({userId},{area})":         DailyTemplatePk("{userId}", "{area}"),
		"dailyTemplateSk()":                        DailyTemplateSk(),
	}
	for call, want := range contract.Data.Keys {
		value, ok := got[call]
		if !ok {
			t.Errorf("no Go builder for %s", call)
			continue
		}
		if value != want {
			t.Errorf("%s = %q, TypeScript builds %q", call, value, want)
		}
	}
	for call := range got {
		if _, ok := contract.Data.Keys[call]; !ok {
			t.Errorf("%s is not in the contract", call)
		}
	}
}
