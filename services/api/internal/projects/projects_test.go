package projects

import (
	"slices"
	"testing"
)

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
