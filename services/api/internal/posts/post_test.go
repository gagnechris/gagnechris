package posts

import (
	"reflect"
	"testing"
)

// Expected values are what packages/data's normalizeTags returns.
func TestNormalizeTagsMatchesData(t *testing.T) {
	got := normalizeTags([]string{" Go  Lang ", "go-lang", "ΟΔΟΣ", " ", "İ", "A　B"})
	want := []string{"go-lang", "οδος", "i̇", "a-b"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}
