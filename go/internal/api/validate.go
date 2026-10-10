package api

import (
	"bytes"
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Validator checks a JSON object body field by field and reports the first
// problem per field with the zod issue code the Node API sends in `fields`,
// so clients get the same 400 from either server.
type Validator struct {
	fields map[string]json.RawMessage
	codes  map[string]string
	// notObject stops field checks, as zod does once the root fails.
	notObject bool
}

// Issue codes zod reports, which clients map to messages.
const (
	CodeInvalidType   = "invalid_type"
	CodeTooSmall      = "too_small"
	CodeTooBig        = "too_big"
	CodeInvalidFormat = "invalid_format"
)

// NewValidator reads body as a JSON object; an empty body is {}. Anything
// but an object fails as a whole with `_root`.
func NewValidator(body []byte) (*Validator, error) {
	v := &Validator{codes: map[string]string{}}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		trimmed = []byte("{}")
	}
	if !json.Valid(trimmed) {
		return nil, ErrInvalidJSONBody
	}
	if trimmed[0] != '{' {
		v.fail("_root", CodeInvalidType)
		v.notObject = true
		return v, nil
	}
	if err := json.Unmarshal(trimmed, &v.fields); err != nil {
		return nil, ErrInvalidJSONBody
	}
	return v, nil
}

func (v *Validator) fail(key, code string) {
	if _, ok := v.codes[key]; !ok {
		v.codes[key] = code
	}
}

// Err is the 400 for every failed field, or nil.
func (v *Validator) Err() error {
	if len(v.codes) == 0 {
		return nil
	}
	return BadRequest("Invalid request body", v.codes)
}

func (v *Validator) raw(key string) (json.RawMessage, bool) {
	raw, ok := v.fields[key]
	return raw, ok
}

// StringRule returns the issue code for a value that fails it, or "".
type StringRule func(string) string

// MinLen and MaxLen count code points, as zod does.
func MinLen(n int) StringRule {
	return func(s string) string {
		if utf8.RuneCountInString(s) < n {
			return CodeTooSmall
		}
		return ""
	}
}

func MaxLen(n int) StringRule {
	return func(s string) string {
		if utf8.RuneCountInString(s) > n {
			return CodeTooBig
		}
		return ""
	}
}

// zod's email pattern.
var emailPattern = regexp.MustCompile(`^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$`)

func Email(s string) string {
	if !emailPattern.MatchString(s) {
		return CodeInvalidFormat
	}
	return ""
}

// String reads a string field. A missing field is an issue only when
// required; null is always one. trim applies JavaScript's String.trim
// before the rules.
func (v *Validator) String(key string, required, trim bool, rules ...StringRule) (string, bool) {
	raw, ok := v.raw(key)
	if v.notObject {
		return "", false
	}
	if !ok {
		if required {
			v.fail(key, CodeInvalidType)
		}
		return "", false
	}
	var s string
	if raw[0] != '"' || json.Unmarshal(raw, &s) != nil {
		v.fail(key, CodeInvalidType)
		return "", false
	}
	if trim {
		s = TrimJS(s)
	}
	for _, rule := range rules {
		if code := rule(s); code != "" {
			v.fail(key, code)
		}
	}
	return s, true
}

const maxSafeInteger = 1<<53 - 1

// OptionalNonNegativeInt reads z.number().int().nonnegative().optional().
func (v *Validator) OptionalNonNegativeInt(key string) (int64, bool) {
	raw, ok := v.raw(key)
	if !ok {
		return 0, false
	}
	var f float64
	if c := raw[0]; (c != '-' && (c < '0' || c > '9')) || json.Unmarshal(raw, &f) != nil {
		v.fail(key, CodeInvalidType)
		return 0, false
	}
	switch {
	case f != math.Trunc(f):
		v.fail(key, CodeInvalidType)
	case f > maxSafeInteger:
		v.fail(key, CodeTooBig)
	case f < 0:
		v.fail(key, CodeTooSmall)
	default:
		return int64(f), true
	}
	return 0, false
}

// jsWhitespace is what String.prototype.trim removes; unicode.IsSpace
// differs (it has U+0085 and lacks U+FEFF).
const jsWhitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

func TrimJS(s string) string { return strings.Trim(s, jsWhitespace) }
