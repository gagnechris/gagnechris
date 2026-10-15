// Package keys builds DynamoDB keys in the formats packages/data/src/keys.ts
// defines; keys_test.go holds them to the generated contract.
package keys

import (
	"fmt"
	"strings"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

// Index names, as packages/data/src/keys.ts names them.
var (
	GSI1 = contract.Data.GSINames.GSI1
	GSI2 = contract.Data.GSINames.GSI2
	GSI3 = contract.Data.GSINames.GSI3
)

const (
	SKMeta      = "META"
	SKPublished = "PUBLISHED"
	skMsg       = "MSG"
	skNote      = "NOTE"
	skPost      = "POST"
	SKRedirect  = "REDIRECT"
	skProject   = "PROJECT"

	homeID   = "current"
	resumeID = "current"
)

func PostPk(postID string) string { return "POST#" + postID }

func SlugPk(slug string) string { return "SLUG#" + slug }

func SlugPostSk() string { return skPost }

func StatusGSI1Pk(status string) string { return "STATUS#" + status }

func StatusGSI1Sk(sortTS, postID string) string { return "TS#" + sortTS + "#POST#" + postID }

func ProjectPk(projectID string) string { return "PROJECT#" + projectID }

func ProjectSlugPk(slug string) string { return "PROJECT_SLUG#" + slug }

func ProjectSlugClaimSk() string { return skProject }

func SlugRedirectSk() string { return SKRedirect }

func ProjectStatusGSI1Pk(status string) string { return "PROJECT_STATUS#" + status }

func ProjectOrderGSI1Sk(order int, projectID string) string {
	return fmt.Sprintf("ORDER#%06d#PROJECT#%s", order, projectID)
}

func HomePk() string { return "HOME#" + homeID }

func ResumePk() string { return "RESUME#" + resumeID }

func ContactPk(contactID string) string { return "CONTACT#" + contactID }

func ContactMsgSk() string { return skMsg }

func SitePublishPk() string { return "SITE#publish" }

func SitePublishSk() string { return SKMeta }

func RemovedUsersPk() string { return "REMOVED_USERS" }

func RemovedUserSk(userID string) string { return "USER#" + userID }

func UserRevocationsPk() string { return "USER_REVOCATIONS" }

func UserRevocationSk(userID string) string { return "USER#" + userID }

func NotePk(userID, noteID string) string { return "USER#" + userID + "#NOTE#" + noteID }

func NoteMetaSk() string { return SKMeta }

func TaskPk(userID, taskID string) string { return "USER#" + userID + "#TASK#" + taskID }

func TaskMetaSk() string { return SKMeta }

// NotebookAreaGSI1Pk is namespaced by user so Notebook never shares post
// STATUS# partitions.
func NotebookAreaGSI1Pk(userID, area string) string { return "USER#" + userID + "#AREA#" + area }

func TaskAreaStatusGSI1Pk(userID, area, status string) string {
	return NotebookAreaGSI1Pk(userID, area) + "#STATUS#" + status
}

func NoteDateGSI1Sk(noteDate, noteID string) string { return "DATE#" + noteDate + "#NOTE#" + noteID }

// NotePageGSI1Sk keeps freeform pages out of DATE# calendar ranges.
func NotePageGSI1Sk(updatedAt, noteID string) string { return "PAGE#" + updatedAt + "#NOTE#" + noteID }

func TaskStartGSI1Sk(startDate, taskID string) string {
	return "START#" + startDate + "#TASK#" + taskID
}

// TaskUpdatedGSI1Sk is a task that shows now: no startDate, not someday.
func TaskUpdatedGSI1Sk(updatedAt, taskID string) string {
	return "UPDATED#" + updatedAt + "#TASK#" + taskID
}

func TaskSomedayGSI1Sk(updatedAt, taskID string) string {
	return "SOMEDAY#" + updatedAt + "#TASK#" + taskID
}

func NoteTasksGSI2Pk(userID, noteID string) string {
	return "USER#" + userID + "#NOTE#" + noteID + "#TASKS"
}

func NoteTasksGSI2Sk(taskID string) string { return "TASK#" + taskID }

// SyncPk is written on each record's META row, not a separate ledger row.
func SyncPk(userID string) string { return "SYNC#" + userID }

// OwnerSyncCreateClaimPk includes the owner so two users never share a
// claim even if ULIDs collide.
func OwnerSyncCreateClaimPk(userID, changeType, entityID string) string {
	return "CREATED#" + strings.ToUpper(changeType) + "#USER#" + userID + "#" + entityID
}

func SyncCreateClaimSk() string { return SKMeta }

func DailyNoteClaimPk(userID, area, date string) string {
	return "USER#" + userID + "#DAILY#" + area + "#" + date
}

func DailyNoteClaimSk() string { return skNote }

func DailyTemplatePk(userID, area string) string {
	return "USER#" + userID + "#DAILY_TEMPLATE#" + area
}

func DailyTemplateSk() string { return SKMeta }

// NoteTemplatesPk is one partition per user, so a Query lists every template.
func NoteTemplatesPk(userID string) string { return "USER#" + userID + "#NOTE_TEMPLATES" }

func NoteTemplateSk(templateID string) string { return "TEMPLATE#" + templateID }

func NotebookAreasPk(userID string) string { return "USER#" + userID + "#NOTEBOOK_AREAS" }

func NotebookAreasSk() string { return SKMeta }

func RateContactIPPk(ip string) string { return "RATE#contact#ip#" + ip }

func RateResumeIPPk(ip string) string { return "RATE#resume#ip#" + ip }

func RateNotebookImageUserPk(userID string) string { return "RATE#notebook-image#user#" + userID }

func RateSESGlobalPk() string { return "RATE#ses#global" }

func RateHourSk(at time.Time) string { return "HOUR#" + at.UTC().Format("2006-01-02T15") }

func RateDaySk(at time.Time) string { return "DAY#" + at.UTC().Format("2006-01-02") }

// TTLEndOfUTCHour is the end of at's UTC hour plus an hour for clock skew,
// in epoch seconds.
func TTLEndOfUTCHour(at time.Time) int64 {
	return at.UTC().Truncate(time.Hour).Add(2 * time.Hour).Unix()
}

// TTLEndOfUTCDay is the end of at's UTC day plus a day, in epoch seconds.
func TTLEndOfUTCDay(at time.Time) int64 {
	y, m, d := at.UTC().Date()
	return time.Date(y, m, d+2, 0, 0, 0, 0, time.UTC).Unix()
}
