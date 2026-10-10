package api

import (
	"bytes"
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Validator checks a JSON object body field by field and reports the first
// problem per field with the zod issue code the Node API sends in `fields`,
// so clients get the same 400 from either server. Nested fields are keyed by
// their dotted path, as zod's issue paths are.
type Validator struct {
	fields map[string]json.RawMessage
	codes  map[string]string
	prefix string
	// notObject stops field checks, as zod does once the root fails.
	notObject bool
}

// Issue codes zod reports, which clients map to messages.
const (
	CodeInvalidType   = "invalid_type"
	CodeInvalidValue  = "invalid_value"
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

// NewQueryValidator checks query parameters, which are always strings.
func NewQueryValidator(query map[string]string) *Validator {
	v := &Validator{codes: map[string]string{}, fields: map[string]json.RawMessage{}}
	for k, s := range query {
		v.fields[k], _ = json.Marshal(s)
	}
	return v
}

func (v *Validator) fail(key, code string) {
	if _, ok := v.codes[v.prefix+key]; !ok {
		v.codes[v.prefix+key] = code
	}
}

// Err is the 400 for every failed field, or nil.
func (v *Validator) Err() error {
	return v.ErrWith("Invalid request body")
}

func (v *Validator) ErrWith(message string) error {
	if len(v.codes) == 0 {
		return nil
	}
	return BadRequest(message, v.codes)
}

// raw is a field's JSON; JSON null counts as present.
func (v *Validator) raw(key string) (json.RawMessage, bool) {
	if v.notObject {
		return nil, false
	}
	raw, ok := v.fields[key]
	return raw, ok
}

func isNull(raw json.RawMessage) bool { return string(raw) == "null" }

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

func (v *Validator) checkString(key string, raw json.RawMessage, trim bool, rules []StringRule) (string, bool) {
	var s string
	if len(raw) == 0 || raw[0] != '"' || json.Unmarshal(raw, &s) != nil {
		v.fail(key, CodeInvalidType)
		return "", false
	}
	if trim {
		s = TrimJS(s)
	}
	ok := true
	for _, rule := range rules {
		if code := rule(s); code != "" {
			v.fail(key, code)
			ok = false
		}
	}
	return s, ok
}

// String reads a string field. A missing field is an issue only when
// required; null is always one. trim applies JavaScript's String.trim
// before the rules.
func (v *Validator) String(key string, required, trim bool, rules ...StringRule) (string, bool) {
	raw, ok := v.raw(key)
	if !ok {
		if required && !v.notObject {
			v.fail(key, CodeInvalidType)
		}
		return "", false
	}
	return v.checkString(key, raw, trim, rules)
}

// NullableString reads z.string().nullable().optional(): present is false
// only when the field is missing, and the value is nil for null.
func (v *Validator) NullableString(key string, rules ...StringRule) (value *string, present bool) {
	raw, ok := v.raw(key)
	if !ok {
		return nil, false
	}
	if isNull(raw) {
		return nil, true
	}
	s, valid := v.checkString(key, raw, false, rules)
	if !valid {
		return nil, true
	}
	return &s, true
}

// Enum reads a string that must be one of values; zod reports a missing,
// mistyped or unknown value alike.
func (v *Validator) Enum(key string, required bool, values ...string) (string, bool) {
	raw, ok := v.raw(key)
	if !ok {
		if required && !v.notObject {
			v.fail(key, CodeInvalidValue)
		}
		return "", false
	}
	var s string
	if json.Unmarshal(raw, &s) != nil || !slices.Contains(values, s) {
		v.fail(key, CodeInvalidValue)
		return "", false
	}
	return s, true
}

// StringArray reads an array of strings; maxItems < 0 means no limit.
// Element issues are keyed `key.i`.
func (v *Validator) StringArray(key string, required bool, maxItems int, rules ...StringRule) ([]string, bool) {
	raw, ok := v.raw(key)
	if !ok {
		if required && !v.notObject {
			v.fail(key, CodeInvalidType)
		}
		return nil, false
	}
	var elems []json.RawMessage
	if raw[0] != '[' || json.Unmarshal(raw, &elems) != nil {
		v.fail(key, CodeInvalidType)
		return nil, false
	}
	out := make([]string, 0, len(elems))
	valid := true
	for i, elem := range elems {
		s, ok := v.checkString(key+"."+strconv.Itoa(i), elem, false, rules)
		valid = valid && ok
		out = append(out, s)
	}
	if maxItems >= 0 && len(elems) > maxItems {
		v.fail(key, CodeTooBig)
		valid = false
	}
	return out, valid
}

// Object reads a nested object for nullable().optional() fields; its
// checks go through the returned validator, nil unless the field holds an
// object.
func (v *Validator) Object(key string, nullable bool) (sub *Validator, present bool) {
	raw, ok := v.raw(key)
	if !ok {
		return nil, false
	}
	if nullable && isNull(raw) {
		return nil, true
	}
	var fields map[string]json.RawMessage
	if raw[0] != '{' || json.Unmarshal(raw, &fields) != nil {
		v.fail(key, CodeInvalidType)
		return nil, true
	}
	return &Validator{fields: fields, codes: v.codes, prefix: v.prefix + key + "."}, true
}

// IntRule returns the issue code for a value that fails it, or "".
type IntRule func(int64) string

func Positive(n int64) string {
	if n <= 0 {
		return CodeTooSmall
	}
	return ""
}

func NonNegative(n int64) string {
	if n < 0 {
		return CodeTooSmall
	}
	return ""
}

func MaxInt(limit int64) IntRule {
	return func(n int64) string {
		if n > limit {
			return CodeTooBig
		}
		return ""
	}
}

const maxSafeInteger = 1<<53 - 1

func (v *Validator) checkInt(key string, f float64, rules []IntRule) (int64, bool) {
	switch {
	case math.IsInf(f, 0) || math.IsNaN(f) || f != math.Trunc(f):
		v.fail(key, CodeInvalidType)
		return 0, false
	case f > maxSafeInteger:
		v.fail(key, CodeTooBig)
		return 0, false
	case f < -maxSafeInteger:
		v.fail(key, CodeTooSmall)
		return 0, false
	}
	n := int64(f)
	for _, rule := range rules {
		if code := rule(n); code != "" {
			v.fail(key, code)
			return 0, false
		}
	}
	return n, true
}

// Int reads z.number().int() with rules.
func (v *Validator) Int(key string, required bool, rules ...IntRule) (int64, bool) {
	raw, ok := v.raw(key)
	if !ok {
		if required && !v.notObject {
			v.fail(key, CodeInvalidType)
		}
		return 0, false
	}
	var f float64
	if c := raw[0]; (c != '-' && (c < '0' || c > '9')) || json.Unmarshal(raw, &f) != nil {
		v.fail(key, CodeInvalidType)
		return 0, false
	}
	return v.checkInt(key, f, rules)
}

// CoercedInt reads z.coerce.number().int() from a string, converting it as
// JavaScript's Number() does.
func (v *Validator) CoercedInt(key string, rules ...IntRule) (int64, bool) {
	raw, ok := v.raw(key)
	if !ok {
		return 0, false
	}
	var s string
	if json.Unmarshal(raw, &s) != nil {
		v.fail(key, CodeInvalidType)
		return 0, false
	}
	return v.checkInt(key, jsNumber(s), rules)
}

var (
	jsDecimal = regexp.MustCompile(`^[+-]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$`)
	jsRadix   = regexp.MustCompile(`^0([xXoObB])([0-9a-fA-F]+)$`)
)

// jsNumber is Number(s) for a string: NaN when it isn't a numeric literal.
func jsNumber(s string) float64 {
	s = strings.Trim(s, jsWhitespace)
	if s == "" {
		return 0
	}
	if m := jsRadix.FindStringSubmatch(s); m != nil {
		base := map[byte]int{'x': 16, 'o': 8, 'b': 2}[strings.ToLower(m[1])[0]]
		f := 0.0
		for _, c := range strings.ToLower(m[2]) {
			d := strings.IndexRune("0123456789abcdef", c)
			if d >= base {
				return math.NaN()
			}
			f = f*float64(base) + float64(d)
		}
		return f
	}
	if !jsDecimal.MatchString(s) {
		return math.NaN()
	}
	if strings.HasSuffix(s, "Infinity") {
		if s[0] == '-' {
			return math.Inf(-1)
		}
		return math.Inf(1)
	}
	// Out of range, ParseFloat still returns ±Inf or 0, as Number() does.
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// jsWhitespace is what String.prototype.trim removes; unicode.IsSpace
// differs (it has U+0085 and lacks U+FEFF).
const jsWhitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

func TrimJS(s string) string { return strings.Trim(s, jsWhitespace) }
