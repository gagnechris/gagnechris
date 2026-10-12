// Package apitypestest holds hand-written response bodies to the types
// generated from the OpenAPI file.
package apitypestest

import (
	"bytes"
	"encoding/json"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// Conforms fails t unless v, encoded, decodes into a T with no field T lacks
// and carries every field T requires, at every depth. Names must match
// exactly, though encoding/json would match them ignoring case.
func Conforms[T any](t testing.TB, v any) {
	t.Helper()
	body, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("encode %T: %v", v, err)
	}
	var typed T
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&typed); err != nil {
		t.Errorf("%T does not decode as %T: %v\n%s", v, typed, err, body)
		return
	}
	var generic any
	if err := json.Unmarshal(body, &generic); err != nil {
		t.Fatal(err)
	}
	for _, problem := range Problems(reflect.TypeFor[T](), generic, "") {
		t.Errorf("%T as %T: %s\n%s", v, typed, problem, body)
	}
}

var unmarshaler = reflect.TypeFor[json.Unmarshaler]()

const nullablePkg = "github.com/oapi-codegen/nullable"

// Problems lists the required fields of rt absent from v, decoded JSON, and
// the fields of v that rt has under no exactly matching name. Types that
// decode themselves (oneOf unions) are not looked into; nullable values are,
// when not null.
func Problems(rt reflect.Type, v any, path string) []string {
	for rt.Kind() == reflect.Pointer {
		rt = rt.Elem()
	}
	if v == nil {
		return nil
	}
	if rt.PkgPath() == nullablePkg {
		return Problems(rt.Elem(), v, path)
	}
	if reflect.PointerTo(rt).Implements(unmarshaler) {
		return nil
	}
	var out []string
	switch rt.Kind() {
	case reflect.Struct:
		obj, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		known := map[string]bool{}
		for _, f := range reflect.VisibleFields(rt) {
			if !f.IsExported() || (f.Anonymous && f.Tag.Get("json") == "") {
				continue
			}
			name, opts, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name == "-" {
				continue
			}
			if name == "" {
				name = f.Name
			}
			known[name] = true
			value, present := obj[name]
			if !present {
				if !slices.Contains(strings.Split(opts, ","), "omitempty") {
					out = append(out, "missing "+path+"."+name)
				}
				continue
			}
			out = append(out, Problems(f.Type, value, path+"."+name)...)
		}
		for name := range obj {
			if !known[name] {
				out = append(out, "unexpected "+path+"."+name)
			}
		}
	case reflect.Slice, reflect.Array:
		arr, _ := v.([]any)
		for i, e := range arr {
			out = append(out, Problems(rt.Elem(), e, path+"["+strconv.Itoa(i)+"]")...)
		}
	case reflect.Map:
		obj, _ := v.(map[string]any)
		for k, e := range obj {
			out = append(out, Problems(rt.Elem(), e, path+"."+k)...)
		}
	}
	return out
}
