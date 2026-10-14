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

func TestRateKeyIP(t *testing.T) {
	cases := map[string]string{
		"203.0.113.7":                    "203.0.113.7",
		"2001:db8:1:2:aaaa:bbbb:cccc:dd": "2001:db8:1:2::/64",
		"2001:db8:1:2::1":                "2001:db8:1:2::/64",
		"2001:DB8:1:2:ffff::9":           "2001:db8:1:2::/64",
		"::ffff:203.0.113.7":             "203.0.113.7",
		"unknown":                        "unknown",
	}
	for in, want := range cases {
		if got := rateKeyIP(in); got != want {
			t.Errorf("rateKeyIP(%q) = %q, want %q", in, got, want)
		}
	}
}
