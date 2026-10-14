// Package textcases replays the contract's text cases, the TypeScript text
// helpers' outputs, against their Go ports.
package textcases

import (
	"encoding/json"
	"reflect"
	"slices"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

// Owners names the package whose test replays each helper's cases.
var Owners = map[string]string{
	"taskEmbedIds":           "notebook",
	"carriedInMarkdown":      "notebook",
	"taskEmbedParents":       "notebook",
	"normalizeTags":          "notebook",
	"fillDailyTemplate":      "notebook",
	"dailyTemplateHasTasks":  "notebook",
	"dailyTemplateHeadings":  "notebook",
	"carryIntoDailyTemplate": "notebook",
	"markdownPlainText":      "notebook",
	"formatCalendarDayLong":  "notebook",
	"noteDisplayTitle":       "notebook",
	"slugify":                "store",
	"isSafeLinkHrefPost":     "projects",
	"isSafeLinkHrefProject":  "projects",
}

// Replay runs every case of the helpers pkg owns through run[helper] and
// compares the JSON of the result with the TypeScript output.
func Replay(t *testing.T, pkg string, run map[string]func(json.RawMessage) any) {
	t.Helper()
	var names []string
	for name, owner := range Owners {
		if owner == pkg {
			names = append(names, name)
		}
	}
	if len(names) == 0 {
		t.Fatalf("no contract text helpers are owned by %s", pkg)
	}
	slices.Sort(names)
	for name := range run {
		if Owners[name] != pkg {
			t.Errorf("%s replays %s, which Owners does not give it", pkg, name)
		}
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			fn, ok := run[name]
			if !ok {
				t.Fatalf("no Go check for %s", name)
			}
			cases := contract.Data.TextCases[name]
			if len(cases) == 0 {
				t.Fatalf("contract has no cases for %s", name)
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
		})
	}
}

// Decode unmarshals a case input.
func Decode[T any](t *testing.T, raw json.RawMessage) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}
