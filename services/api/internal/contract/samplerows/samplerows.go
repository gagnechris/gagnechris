// Package samplerows checks the Go row builders against the contract's
// sample rows, which the @gagnechris/data builders produce.
package samplerows

import (
	"fmt"
	"reflect"
	"slices"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
)

// Builders names the package whose test rebuilds each sample with its Go
// builder.
var Builders = map[string]string{
	"home":                  "home",
	"resume":                "resume",
	"resumePublished":       "resume",
	"resumeLegacy":          "resume",
	"resumeLegacyPublished": "resume",
	"noteDaily":             "notebook",
	"notePage":              "notebook",
	"task":                  "notebook",
	"project":               "projects",
	"projectPublished":      "projects",
	"postTagged":            "posts",
}

// Skipped says why a sample has no Go round trip.
var Skipped = map[string]string{
	"postUntagged":   "a row from before projectIds; Go always writes projectIds",
	"dailyNoteClaim": "written inline by notesRepo.dailyClaim",
	"dailyTemplate":  "written inline by templatesRepo.write",
	"contact":        "written inline by the contact store",
	"removedUser":    "written inline by removedRepo.put",
}

// RoundTrip parses each sample built by pkg, rebuilds it with rebuild and
// requires the original row back.
func RoundTrip(t *testing.T, pkg string, rebuild func(data.Item) (data.Item, error)) {
	t.Helper()
	var names []string
	for name, owner := range Builders {
		if owner == pkg {
			names = append(names, name)
		}
	}
	if len(names) == 0 {
		t.Fatalf("no contract samples are built by %s", pkg)
	}
	slices.Sort(names)
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			want := contract.Sample(name)
			item := data.FromJSON(contract.Sample(name)).(*types.AttributeValueMemberM).Value
			built, err := rebuild(item)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			got := data.ToJSON(data.M(built)).(map[string]any)
			for _, d := range diff(want, got) {
				t.Error(d)
			}
		})
	}
}

// diff lists the attributes where got and want differ.
func diff(want, got map[string]any) []string {
	var attrs []string
	for k := range want {
		attrs = append(attrs, k)
	}
	for k := range got {
		if _, ok := want[k]; !ok {
			attrs = append(attrs, k)
		}
	}
	slices.Sort(attrs)
	var out []string
	for _, k := range attrs {
		w, inWant := want[k]
		g, inGot := got[k]
		switch {
		case !inGot:
			out = append(out, fmt.Sprintf("%s: missing, want %#v", k, w))
		case !inWant:
			out = append(out, fmt.Sprintf("%s: unexpected %#v", k, g))
		case !reflect.DeepEqual(w, g):
			out = append(out, fmt.Sprintf("%s: got %#v, want %#v", k, g, w))
		}
	}
	return out
}

// Published reports whether item is a PUBLISHED copy rather than META.
func Published(item data.Item) bool {
	sk, ok := item["sk"].(*types.AttributeValueMemberS)
	return ok && sk.Value == keys.SKPublished
}
