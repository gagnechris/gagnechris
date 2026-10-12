package jstime

import (
	"testing"
	"time"
)

func TestISO(t *testing.T) {
	at := time.Date(2026, 1, 2, 3, 4, 5, 6_000_000, time.FixedZone("x", -5*3600))
	if got, want := ISO(at), "2026-01-02T08:04:05.006Z"; got != want {
		t.Errorf("ISO = %q, want %q", got, want)
	}
}
