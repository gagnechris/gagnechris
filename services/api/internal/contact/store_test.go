package contact

import "testing"

func TestTruncateUnits(t *testing.T) {
	cases := map[string]string{"abc": "ab", "a😀": "a", "😀a": "😀"}
	for in, want := range cases {
		if got := truncateUnits(in, 2); got != want {
			t.Errorf("truncateUnits(%q, 2) = %q, want %q", in, got, want)
		}
	}
}
