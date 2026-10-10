package notebook

import (
	"errors"
	"regexp"

	"github.com/gagnechris/gagnechris/go/internal/api"
)

var ulid = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)

// checkNote holds a stored note to NoteSchema beyond what its row schema
// checks, as the API's responses and sync changes are.
func checkNote(n Note) error {
	for _, id := range n.TaskIDs {
		if !ulid.MatchString(id) {
			return errors.New("taskIds: Must be a ULID")
		}
	}
	switch {
	case !api.IsDatetime(n.CreatedAt), !api.IsDatetime(n.UpdatedAt):
		return errors.New("timestamps: Invalid ISO datetime")
	case n.Type == "daily" && n.Date == nil:
		return errors.New("date: Daily notes require date (yyyy-mm-dd)")
	case n.Type == "page" && n.Date != nil:
		return errors.New("date: Page notes must not set date")
	}
	return nil
}

// checkTask holds a stored task to TaskSchema.
func checkTask(t Task) error {
	switch {
	case !ulid.MatchString(t.ID):
		return errors.New("id: Must be a ULID")
	case !api.IsDatetime(t.CreatedAt), !api.IsDatetime(t.UpdatedAt),
		t.CompletedAt != nil && !api.IsDatetime(*t.CompletedAt):
		return errors.New("timestamps: Invalid ISO datetime")
	}
	return nil
}
