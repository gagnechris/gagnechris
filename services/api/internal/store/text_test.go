package store

import "testing"

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
