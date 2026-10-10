package store

import (
	"strings"
	"testing"
)

// Expected values are what packages/data's slugify returns.
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
		if got := Slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestJSLowerFinalSigma(t *testing.T) {
	for in, want := range map[string]string{
		"ΟΔΟΣ ΟΔΟΣ": "οδος οδος",
		"Σ":         "σ",
		"ΣΑ":        "σα",
		"ΑΣ.":       "ας.",
	} {
		if got := JSLower(in); got != want {
			t.Errorf("jsLower(%q) = %q, want %q", in, got, want)
		}
	}
}
