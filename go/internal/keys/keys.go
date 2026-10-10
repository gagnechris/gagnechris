// Package keys builds DynamoDB keys in the formats packages/data/src/keys.ts
// defines; keys_test.go holds them to the generated contract.
package keys

import "time"

const (
	SKMeta      = "META"
	SKPublished = "PUBLISHED"
	skMsg       = "MSG"
	skNote      = "NOTE"

	homeID   = "current"
	resumeID = "current"
)

func PostPk(postID string) string { return "POST#" + postID }

func ProjectPk(projectID string) string { return "PROJECT#" + projectID }

func HomePk() string { return "HOME#" + homeID }

func ResumePk() string { return "RESUME#" + resumeID }

func ContactPk(contactID string) string { return "CONTACT#" + contactID }

func ContactMsgSk() string { return skMsg }

func RemovedUsersPk() string { return "REMOVED_USERS" }

func RemovedUserSk(userID string) string { return "USER#" + userID }

func NotePk(userID, noteID string) string { return "USER#" + userID + "#NOTE#" + noteID }

func NoteMetaSk() string { return SKMeta }

func TaskPk(userID, taskID string) string { return "USER#" + userID + "#TASK#" + taskID }

func TaskMetaSk() string { return SKMeta }

func DailyNoteClaimPk(userID, area, date string) string {
	return "USER#" + userID + "#DAILY#" + area + "#" + date
}

func DailyNoteClaimSk() string { return skNote }

func DailyTemplatePk(userID, area string) string {
	return "USER#" + userID + "#DAILY_TEMPLATE#" + area
}

func DailyTemplateSk() string { return SKMeta }

func RateContactIPPk(ip string) string { return "RATE#contact#ip#" + ip }

func RateResumeIPPk(ip string) string { return "RATE#resume#ip#" + ip }

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
