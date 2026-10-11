package store

import (
	"strconv"
	"testing"
)

// A filter that matches nothing must not walk every stored row in one request.
func TestWalkPartitionsCapsFetchesAndResumes(t *testing.T) {
	const rows = 3 * maxWalkFetches
	fetches := 0
	fetch := func(p int, cursor string, _, _ int) (Page[string], error) {
		fetches++
		at := 0
		if cursor != "" {
			at, _ = strconv.Atoi(cursor)
		}
		page := Page[string]{}
		if p == 1 && at == rows-1 {
			page.Items = []string{"match"}
		}
		if at+1 < rows {
			page.NextCursor = strconv.Itoa(at + 1)
		}
		return page, nil
	}

	page, err := WalkPartitions([]int{0, 1}, "", 1, fetch)
	if err != nil {
		t.Fatal(err)
	}
	if fetches != maxWalkFetches || len(page.Items) != 0 || page.NextCursor == "" {
		t.Fatalf("fetches = %d, items = %v, cursor = %q; want %d fetches, no items and a cursor", fetches, page.Items, page.NextCursor, maxWalkFetches)
	}

	var found []string
	for requests := 1; page.NextCursor != ""; requests++ {
		if requests > 2*rows/maxWalkFetches {
			t.Fatal("cursor never reached the match")
		}
		page, err = WalkPartitions([]int{0, 1}, page.NextCursor, 1, fetch)
		if err != nil {
			t.Fatal(err)
		}
		found = append(found, page.Items...)
		if len(found) > 0 {
			break
		}
	}
	if len(found) != 1 || found[0] != "match" {
		t.Fatalf("found = %v, want the match in the last partition", found)
	}
}
