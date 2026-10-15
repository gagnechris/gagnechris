package notebook

import (
	"encoding/json"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/textcases"
)

func TestTextHelpersMatchTypeScript(t *testing.T) {
	type template struct{ Markdown, AreaName, Date string }
	type carry struct {
		Markdown string
		Tasks    []CarriedInTask
		Section  *string
	}
	textcases.Replay(t, "notebook", map[string]func(json.RawMessage) any{
		"taskEmbedIds": func(in json.RawMessage) any { return TaskEmbedIDs(textcases.Decode[string](t, in)) },
		"carriedInMarkdown": func(in json.RawMessage) any {
			return CarriedInMarkdown(textcases.Decode[[]CarriedInTask](t, in))
		},
		"taskEmbedParents": func(in json.RawMessage) any { return TaskEmbedParents(textcases.Decode[string](t, in)) },
		"normalizeTags":    func(in json.RawMessage) any { return NormalizeTags(textcases.Decode[[]string](t, in)) },
		"fillDailyTemplate": func(in json.RawMessage) any {
			c := textcases.Decode[template](t, in)
			return FillDailyTemplate(c.Markdown, c.AreaName, c.Date)
		},
		"dailyTemplateHasTasks": func(in json.RawMessage) any {
			return DailyTemplateHasTasks(textcases.Decode[string](t, in))
		},
		"dailyTemplateHeadings": func(in json.RawMessage) any {
			return DailyTemplateHeadings(textcases.Decode[string](t, in))
		},
		"carryIntoDailyTemplate": func(in json.RawMessage) any {
			c := textcases.Decode[carry](t, in)
			return CarryIntoDailyTemplate(c.Markdown, c.Tasks, c.Section)
		},
		"markdownPlainText": func(in json.RawMessage) any {
			return MarkdownPlainText(textcases.Decode[string](t, in))
		},
		"formatCalendarDayLong": func(in json.RawMessage) any { return LongDay(textcases.Decode[string](t, in)) },
		"noteDisplayTitle": func(in json.RawMessage) any {
			return NoteDisplayTitle(textcases.Decode[Note](t, in))
		},
	})
}
