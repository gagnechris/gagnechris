package notebook

import (
	"encoding/json"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/textcases"
)

func TestTextHelpersMatchTypeScript(t *testing.T) {
	type template struct{ Markdown, Area, Date string }
	textcases.Replay(t, "notebook", map[string]func(json.RawMessage) any{
		"taskEmbedIds": func(in json.RawMessage) any { return TaskEmbedIDs(textcases.Decode[string](t, in)) },
		"carriedInMarkdown": func(in json.RawMessage) any {
			return CarriedInMarkdown(textcases.Decode[[]string](t, in))
		},
		"normalizeTags": func(in json.RawMessage) any { return NormalizeTags(textcases.Decode[[]string](t, in)) },
		"fillDailyTemplate": func(in json.RawMessage) any {
			c := textcases.Decode[template](t, in)
			return FillDailyTemplate(c.Markdown, c.Area, c.Date)
		},
		"dailyTemplateHasTasks": func(in json.RawMessage) any {
			return DailyTemplateHasTasks(textcases.Decode[string](t, in))
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
