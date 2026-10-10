package store

import (
	"errors"
	"log/slog"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/observability"
)

// ItemReader checks a stored row field by field, as the zod item schemas in
// packages/data do, collecting every problem.
type ItemReader struct {
	item     data.Item
	prefix   string
	problems *[]string
}

func ReadItem(item data.Item) *ItemReader {
	return &ItemReader{item: item, problems: new([]string)}
}

func (r *ItemReader) bad(key, why string) {
	*r.problems = append(*r.problems, r.prefix+key+": "+why)
}

func isNullAttr(v types.AttributeValue) bool {
	n, ok := v.(*types.AttributeValueMemberNULL)
	return ok && n.Value
}

func (r *ItemReader) str(key string, required bool, minLen int) (string, bool) {
	v, ok := r.item[key]
	if !ok {
		if required {
			r.bad(key, "missing")
		}
		return "", false
	}
	s, isS := v.(*types.AttributeValueMemberS)
	if !isS {
		r.bad(key, "not a string")
		return "", false
	}
	if len([]rune(s.Value)) < minLen {
		r.bad(key, "too short")
	}
	return s.Value, true
}

// Str is a required string of at least minLen code points.
func (r *ItemReader) Str(key string, minLen int) string {
	s, _ := r.str(key, true, minLen)
	return s
}

// OptStr is nil when the attribute is missing or null.
func (r *ItemReader) OptStr(key string, minLen int) *string {
	if v, ok := r.item[key]; !ok || isNullAttr(v) {
		return nil
	}
	s, ok := r.str(key, true, minLen)
	if !ok {
		return nil
	}
	return &s
}

func (r *ItemReader) Literal(key, want string) {
	if s, ok := r.str(key, true, 0); ok && s != want {
		r.bad(key, "is not "+want)
	}
}

func (r *ItemReader) Enum(key string, values ...string) string {
	s, ok := r.str(key, true, 0)
	if ok && !slices.Contains(values, s) {
		r.bad(key, "unknown value")
	}
	return s
}

func (r *ItemReader) strList(key string, required bool) ([]string, bool) {
	v, ok := r.item[key]
	if !ok {
		if required {
			r.bad(key, "missing")
		}
		return nil, false
	}
	l, isL := v.(*types.AttributeValueMemberL)
	if !isL {
		r.bad(key, "not a list")
		return nil, false
	}
	out := make([]string, 0, len(l.Value))
	for i, e := range l.Value {
		s, isS := e.(*types.AttributeValueMemberS)
		if !isS {
			r.bad(key+"."+strconv.Itoa(i), "not a string")
			continue
		}
		out = append(out, s.Value)
	}
	return out, true
}

func (r *ItemReader) StrList(key string) []string {
	l, _ := r.strList(key, true)
	return l
}

// OptStrList is empty, never nil, when the attribute is missing.
func (r *ItemReader) OptStrList(key string) []string {
	if l, ok := r.strList(key, false); ok {
		return l
	}
	return []string{}
}

// NonNegativeInt is a required z.number().int().nonnegative().
func (r *ItemReader) NonNegativeInt(key string) int {
	v, ok := r.item[key]
	if !ok {
		r.bad(key, "missing")
		return 0
	}
	n, isN := v.(*types.AttributeValueMemberN)
	if !isN {
		r.bad(key, "not a number")
		return 0
	}
	f, err := strconv.ParseFloat(n.Value, 64)
	if err != nil || f != math.Trunc(f) || f < 0 || f > maxSafeInteger {
		r.bad(key, "not a non-negative integer")
		return 0
	}
	return int(f)
}

const maxSafeInteger = 1<<53 - 1

// OptBool is nil when the attribute is missing.
func (r *ItemReader) OptBool(key string) *bool {
	v, ok := r.item[key]
	if !ok {
		return nil
	}
	b, isB := v.(*types.AttributeValueMemberBOOL)
	if !isB {
		r.bad(key, "not a boolean")
		return nil
	}
	return &b.Value
}

// OptMap reads a nullable, optional map; nil when missing, null or wrong.
func (r *ItemReader) OptMap(key string) *ItemReader {
	v, ok := r.item[key]
	if !ok || isNullAttr(v) {
		return nil
	}
	m, isM := v.(*types.AttributeValueMemberM)
	if !isM {
		r.bad(key, "not a map")
		return nil
	}
	return &ItemReader{item: m.Value, prefix: r.prefix + key + ".", problems: r.problems}
}

// Err is a DataIntegrityError naming the row, or nil.
func (r *ItemReader) Err(label string) error {
	if len(*r.problems) == 0 {
		return nil
	}
	return Corrupt(label, r.item, errors.New(strings.Join(*r.problems, "; ")))
}

// Corrupt is the 500 for a stored row that fails its schema.
func Corrupt(label string, item data.Item, cause error) error {
	pk, _ := item["pk"].(*types.AttributeValueMemberS)
	sk, _ := item["sk"].(*types.AttributeValueMemberS)
	msg := "Corrupt stored " + label
	e := &api.DataIntegrityError{Message: msg, Cause: cause}
	if pk != nil {
		e.PK = pk.Value
		skv := "?"
		if sk != nil {
			skv = sk.Value
			e.SK = sk.Value
		}
		e.Message += " (" + pk.Value + "/" + skv + ")"
	}
	return e
}

// LogCorrupt logs and counts a corrupt row a read skips.
func LogCorrupt(log *slog.Logger, metrics *observability.Metrics) func(*api.DataIntegrityError) {
	return func(e *api.DataIntegrityError) {
		attrs := []any{"pk", e.PK, "sk", e.SK, "errMessage", e.Message}
		if e.Cause != nil {
			attrs = append(attrs, "causeMessage", e.Cause.Error())
		}
		log.Warn("Skipping corrupt stored item", attrs...)
		metrics.Add("DataIntegrityError", observability.Count, 1)
	}
}
