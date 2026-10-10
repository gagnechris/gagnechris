package posts

import (
	"reflect"
	"strings"
	"testing"

	"github.com/gagnechris/gagnechris/go/internal/store"
)

// Expected values are what packages/data's slugify and normalizeTags return.
func TestSlugifyMatchesData(t *testing.T) {
	long := strings.Repeat("a", 119)
	for in, want := range map[string]string{
		"Hello, World!":    "hello-world",
		"  Crème Brûlée  ": "creme-brulee",
		"Ⅻ ﬁle":            "xii-file",
		"---":              "untitled",
		"":                 "untitled",
		long + " b":        long,
		"İstanbul ΟΔΟΣ":    "istanbul",
		"日本語 text":         "text",
	} {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeTagsMatchesData(t *testing.T) {
	got := normalizeTags([]string{" Go  Lang ", "go-lang", "ΟΔΟΣ", " ", "İ", "A　B"})
	want := []string{"go-lang", "οδος", "i̇", "a-b"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestJSLowerFinalSigma(t *testing.T) {
	for in, want := range map[string]string{
		"ΟΔΟΣ ΟΔΟΣ": "οδος οδος",
		"Σ":         "σ",
		"ΣΑ":        "σα",
		"ΑΣ.":       "ας.",
	} {
		if got := jsLower(in); got != want {
			t.Errorf("jsLower(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTagSyncItems(t *testing.T) {
	at := func(s string) *string { return &s }
	before := Post{ID: "p", Tags: []string{"keep", "drop"}, Publishable: store.Publishable{Status: "published", PublishedAt: at("T1")}}
	after := Post{ID: "p", Slug: "s", Tags: []string{"keep", "add"}, Publishable: store.Publishable{Status: "published", PublishedAt: at("T1")}}
	ops := func(opts store.PersistOptions[Post]) []string {
		var out []string
		for _, item := range tagSyncItems("t", after, opts) {
			switch {
			case item.Put != nil:
				out = append(out, "put "+attr(item.Put.Item["pk"]))
			case item.Delete != nil:
				out = append(out, "delete "+attr(item.Delete.Key["pk"]))
			}
		}
		return out
	}
	if got := ops(store.PersistOptions[Post]{}); got != nil {
		t.Errorf("draft edit: %v", got)
	}
	if got, want := ops(store.PersistOptions[Post]{SyncPublished: true, PreviousPublished: &before}), []string{"delete TAG#drop", "put TAG#add"}; !reflect.DeepEqual(got, want) {
		t.Errorf("republish: %v, want %v", got, want)
	}
	if got, want := ops(store.PersistOptions[Post]{DeletePublished: true, PreviousPublished: &before}), []string{"delete TAG#keep", "delete TAG#drop"}; !reflect.DeepEqual(got, want) {
		t.Errorf("unpublish: %v, want %v", got, want)
	}
}

func attr(v any) string {
	if s, ok := v.(interface{ GetValue() string }); ok {
		return s.GetValue()
	}
	return reflect.ValueOf(v).Elem().FieldByName("Value").String()
}
