package keys

import (
	"strconv"
	"testing"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

func TestKeysMatchTheTypeScriptBuilders(t *testing.T) {
	const keyTime = "2026-01-02T23:04:05.678Z"
	at, err := time.Parse(time.RFC3339Nano, keyTime)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{
		"SK_META":                                        SKMeta,
		"SK_PUBLISHED":                                   SKPublished,
		"postPk({postId})":                               PostPk("{postId}"),
		"slugPk({slug})":                                 SlugPk("{slug}"),
		"slugPostSk()":                                   SlugPostSk(),
		"statusGsi1Pk({status})":                         StatusGSI1Pk("{status}"),
		"statusGsi1Sk({sortTs},{postId})":                StatusGSI1Sk("{sortTs}", "{postId}"),
		"projectPk({projectId})":                         ProjectPk("{projectId}"),
		"projectSlugPk({slug})":                          ProjectSlugPk("{slug}"),
		"projectSlugClaimSk()":                           ProjectSlugClaimSk(),
		"slugRedirectSk()":                               SlugRedirectSk(),
		"projectStatusGsi1Pk({status})":                  ProjectStatusGSI1Pk("{status}"),
		"projectOrderGsi1Sk(42,{projectId})":             ProjectOrderGSI1Sk(42, "{projectId}"),
		"homePk()":                                       HomePk(),
		"resumePk()":                                     ResumePk(),
		"contactPk({contactId})":                         ContactPk("{contactId}"),
		"contactMsgSk()":                                 ContactMsgSk(),
		"sitePublishPk()":                                SitePublishPk(),
		"sitePublishSk()":                                SitePublishSk(),
		"removedUsersPk()":                               RemovedUsersPk(),
		"removedUserSk({userId})":                        RemovedUserSk("{userId}"),
		"userRevocationsPk()":                            UserRevocationsPk(),
		"userRevocationSk({userId})":                     UserRevocationSk("{userId}"),
		"notePk({userId},{noteId})":                      NotePk("{userId}", "{noteId}"),
		"noteMetaSk()":                                   NoteMetaSk(),
		"taskPk({userId},{taskId})":                      TaskPk("{userId}", "{taskId}"),
		"taskMetaSk()":                                   TaskMetaSk(),
		"notebookAreaGsi1Pk({userId},{area})":            NotebookAreaGSI1Pk("{userId}", "{area}"),
		"taskAreaStatusGsi1Pk({userId},{area},{status})": TaskAreaStatusGSI1Pk("{userId}", "{area}", "{status}"),
		"dailyNoteClaimPk({userId},{area},{date})":       DailyNoteClaimPk("{userId}", "{area}", "{date}"),
		"noteDateGsi1Sk({date},{noteId})":                NoteDateGSI1Sk("{date}", "{noteId}"),
		"notePageGsi1Sk({updatedAt},{noteId})":           NotePageGSI1Sk("{updatedAt}", "{noteId}"),
		"taskStartGsi1Sk({date},{taskId})":               TaskStartGSI1Sk("{date}", "{taskId}"),
		"taskUpdatedGsi1Sk({updatedAt},{taskId})":        TaskUpdatedGSI1Sk("{updatedAt}", "{taskId}"),
		"taskSomedayGsi1Sk({updatedAt},{taskId})":        TaskSomedayGSI1Sk("{updatedAt}", "{taskId}"),
		"noteTasksGsi2Pk({userId},{noteId})":             NoteTasksGSI2Pk("{userId}", "{noteId}"),
		"noteTasksGsi2Sk({taskId})":                      NoteTasksGSI2Sk("{taskId}"),
		"syncPk({userId})":                               SyncPk("{userId}"),
		"ownerSyncCreateClaimPk({userId},task,{taskId})": OwnerSyncCreateClaimPk("{userId}", "task", "{taskId}"),
		"syncCreateClaimSk()":                            SyncCreateClaimSk(),
		"dailyNoteClaimSk()":                             DailyNoteClaimSk(),
		"dailyTemplatePk({userId},{area})":               DailyTemplatePk("{userId}", "{area}"),
		"dailyTemplateSk()":                              DailyTemplateSk(),
		"noteTemplatesPk({userId})":                      NoteTemplatesPk("{userId}"),
		"noteTemplateSk({templateId})":                   NoteTemplateSk("{templateId}"),
		"rateContactIpPk({ip})":                          RateContactIPPk("{ip}"),
		"rateResumeIpPk({ip})":                           RateResumeIPPk("{ip}"),
		"rateNotebookImageUserPk({userId})":              RateNotebookImageUserPk("{userId}"),
		"rateSesGlobalPk()":                              RateSESGlobalPk(),
		"rateHourSk(" + keyTime + ")":                    RateHourSk(at),
		"rateDaySk(" + keyTime + ")":                     RateDaySk(at),
		"ttlEndOfUtcHour(" + keyTime + ")":               strconv.FormatInt(TTLEndOfUTCHour(at), 10),
		"ttlEndOfUtcDay(" + keyTime + ")":                strconv.FormatInt(TTLEndOfUTCDay(at), 10),
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
