package api

import (
	"regexp"
	"strconv"
	"time"
)

// datetimeOffset is z.string().datetime({ offset: true }): seconds are
// required, with any fraction, and Z or a ±hh:mm offset.
var datetimeOffset = regexp.MustCompile(`^((?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8]))))T((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d+))?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d))$`)

// IsDatetime is zod's offset datetime check.
func IsDatetime(s string) bool { return datetimeOffset.MatchString(s) }

// ParseDatetime is Date.parse for a string IsDatetime accepts: millisecond
// precision, the rest of the fraction dropped.
func ParseDatetime(s string) (time.Time, bool) {
	m := datetimeOffset.FindStringSubmatch(s)
	if m == nil {
		return time.Time{}, false
	}
	t, err := time.Parse("2006-01-02T15:04:05", m[1]+"T"+m[2])
	if err != nil {
		return time.Time{}, false
	}
	if frac := m[3]; frac != "" {
		for len(frac) < 3 {
			frac += "0"
		}
		ms, _ := strconv.Atoi(frac[:3])
		t = t.Add(time.Duration(ms) * time.Millisecond)
	}
	if off := m[4]; off != "" {
		h, _ := strconv.Atoi(off[1:3])
		mi, _ := strconv.Atoi(off[4:6])
		d := time.Duration(h)*time.Hour + time.Duration(mi)*time.Minute
		if off[0] == '+' {
			d = -d
		}
		t = t.Add(d)
	}
	return t.UTC(), true
}
