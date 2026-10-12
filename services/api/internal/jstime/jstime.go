// Package jstime formats times the way the TypeScript side writes them.
package jstime

import "time"

// ISOLayout is Date.toISOString's format.
const ISOLayout = "2006-01-02T15:04:05.000Z"

// ISO is Date.toISOString.
func ISO(t time.Time) string { return t.UTC().Format(ISOLayout) }
