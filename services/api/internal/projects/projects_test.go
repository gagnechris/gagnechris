package projects

import (
	"slices"
	"strings"
	"testing"
)

// Expected values are what isSafeLinkHref in packages/shared returns.
func TestSafeHrefMatchesShared(t *testing.T) {
	post := safeHref(limits.PostLinkSchemes)
	https := safeHref(limits.ProjectHrefSchemes)
	atMax := "/" + strings.Repeat("a", limits.LinkHrefMaxLength-1)
	for href, want := range map[string][2]bool{
		"/x":                        {true, true},
		"//evil.example":            {false, false},
		"https://a.example/b?c#d":   {true, true},
		"HTTPS://A.example":         {true, true},
		"http://a.example":          {true, false},
		"https://a.example@evil.io": {false, false},
		"https://":                  {false, false},
		"mailto:a@b.c":              {true, false},
		"tel:":                      {false, false},
		"javascript:alert(1)":       {false, false},
		"https://a b.example":       {false, false},
		"/a b":                      {false, false},
		"/a\\b":                     {false, false},
		"":                          {false, false},
		atMax:                       {true, true},
		atMax + "a":                 {false, false},
	} {
		if got := [2]bool{post(href), https(href)}; got != want {
			t.Errorf("%q: %v, want %v", href, got, want)
		}
	}
}

func TestSortByOrderComparesNamesLikeLocaleCompare(t *testing.T) {
	ps := []Project{
		{ID: "2", Name: "Banana", Order: 1},
		{ID: "3", Name: "apple", Order: 1},
		{ID: "1", Name: "Zed", Order: 0},
		{ID: "5", Name: "apple", Order: 1},
		{ID: "4", Name: "Apple", Order: 1},
	}
	sortByOrder(ps)
	var ids []string
	for _, p := range ps {
		ids = append(ids, p.ID)
	}
	if want := []string{"1", "3", "5", "4", "2"}; !slices.Equal(ids, want) {
		t.Errorf("got %v, want %v", ids, want)
	}
}
