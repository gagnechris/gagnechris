// Package keys builds DynamoDB keys in the formats packages/data/src/keys.ts
// defines; keys_test.go holds them to the generated contract.
package keys

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
