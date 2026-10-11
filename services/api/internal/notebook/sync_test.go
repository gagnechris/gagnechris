package notebook

import (
	"slices"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

// A synced type without an adapter fails every page of the feed.
func TestSyncAdaptersCoverEveryChangeType(t *testing.T) {
	var got []string
	for changeType := range syncAdapters {
		got = append(got, changeType)
	}
	slices.Sort(got)
	want := slices.Sorted(slices.Values(contract.Data.Sync.ChangeTypes))
	if !slices.Equal(got, want) {
		t.Errorf("sync adapters %v, want %v", got, want)
	}
}
