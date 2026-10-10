package api

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
)

// Expected is the version a Notebook write expects: from If-Match, which
// wins, or body.version.
type Expected struct {
	Set bool
	// Any is If-Match `*`: whatever version the write reads.
	Any         bool
	Version     int
	FromIfMatch bool
}

var (
	weakPrefix = regexp.MustCompile(`(?i)^W/`)
	digits     = regexp.MustCompile(`^[0-9]+$`)
)

// ResolveExpected reads If-Match, else bodyVersion (nil when absent).
func ResolveExpected(r *Request, bodyVersion *int) (Expected, error) {
	raw := r.Headers["if-match"]
	if raw == "" {
		if bodyVersion != nil {
			return Expected{Set: true, Version: *bodyVersion}, nil
		}
		return Expected{}, nil
	}
	trimmed := TrimJS(raw)
	if trimmed == "*" {
		return Expected{Set: true, Any: true, FromIfMatch: true}, nil
	}
	if strings.Contains(trimmed, ",") {
		return Expected{}, InvalidHeader("If-Match")
	}
	stripped := weakPrefix.ReplaceAllString(trimmed, "")
	stripped = strings.TrimPrefix(stripped, `"`)
	stripped = strings.TrimSuffix(stripped, `"`)
	if !digits.MatchString(stripped) {
		return Expected{}, InvalidHeader("If-Match")
	}
	n, err := strconv.ParseFloat(stripped, 64)
	if err != nil || n > maxSafeInteger {
		return Expected{}, InvalidHeader("If-Match")
	}
	return Expected{Set: true, Version: int(n), FromIfMatch: true}, nil
}

// Of is the version to check against, given the one just read.
func (e Expected) Of(current int) int {
	if e.Any {
		return current
	}
	return e.Version
}

// IfMatchConflict turns a conflict on an If-Match write into its 412.
func (e Expected) IfMatchConflict(err error) error {
	var conflict *ConflictError
	if e.FromIfMatch && errors.As(err, &conflict) {
		return &PreconditionFailedError{
			Message:        conflict.Message,
			CurrentVersion: conflict.CurrentVersion,
			Current:        conflict.Current,
		}
	}
	return err
}
