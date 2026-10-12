package apitypestest

import (
	"encoding/json"
	"reflect"
	"slices"
	"testing"

	"github.com/oapi-codegen/nullable"
)

type inner struct {
	Need string  `json:"need"`
	Opt  *string `json:"opt,omitempty"`
}

type outer struct {
	ID    string                   `json:"id"`
	Items []inner                  `json:"items"`
	Maybe nullable.Nullable[inner] `json:"maybe"`
	Extra map[string]inner         `json:"extra,omitempty"`
}

func TestProblemsAtEveryDepth(t *testing.T) {
	var body any
	if err := json.Unmarshal([]byte(`{"items":[{"need":"x"},{"Need":"y"}],"maybe":{"opt":"y"},"extra":{"k":{}}}`), &body); err != nil {
		t.Fatal(err)
	}
	got := Problems(reflect.TypeFor[outer](), body, "")
	slices.Sort(got)
	want := []string{"missing .extra.k.need", "missing .id", "missing .items[1].need", "missing .maybe.need", "unexpected .items[1].Need"}
	if !slices.Equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if err := json.Unmarshal([]byte(`{"id":"1","items":[],"maybe":null}`), &body); err != nil {
		t.Fatal(err)
	}
	if got := Problems(reflect.TypeFor[outer](), body, ""); len(got) != 0 {
		t.Errorf("complete body reported %v", got)
	}
}
