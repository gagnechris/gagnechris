package notebook

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

func TestTextHelpersMatchTypeScript(t *testing.T) {
	type template struct{ Markdown, Area, Date string }
	run := map[string]func(json.RawMessage) any{
		"taskEmbedIds": func(in json.RawMessage) any { return TaskEmbedIDs(decode[string](t, in)) },
		"carriedInMarkdown": func(in json.RawMessage) any {
			return CarriedInMarkdown(decode[[]string](t, in))
		},
		"normalizeTags": func(in json.RawMessage) any { return NormalizeTags(decode[[]string](t, in)) },
		"fillDailyTemplate": func(in json.RawMessage) any {
			c := decode[template](t, in)
			return FillDailyTemplate(c.Markdown, c.Area, c.Date)
		},
		"dailyTemplateHasTasks": func(in json.RawMessage) any {
			return DailyTemplateHasTasks(decode[string](t, in))
		},
		"markdownPlainText": func(in json.RawMessage) any {
			return MarkdownPlainText(decode[string](t, in))
		},
	}
	for name, cases := range contract.Data.TextCases {
		fn, ok := run[name]
		if !ok {
			t.Errorf("no Go check for %s", name)
			continue
		}
		for _, c := range cases {
			got, err := json.Marshal(fn(c.Input))
			if err != nil {
				t.Fatal(err)
			}
			var gotV, wantV any
			_ = json.Unmarshal(got, &gotV)
			_ = json.Unmarshal(c.Want, &wantV)
			if !reflect.DeepEqual(gotV, wantV) {
				t.Errorf("%s(%s) = %s, want %s", name, c.Input, got, c.Want)
			}
		}
	}
	if len(contract.Data.TextCases) != len(run) {
		t.Errorf("contract has %d text helpers, Go checks %d", len(contract.Data.TextCases), len(run))
	}
}

func decode[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}
