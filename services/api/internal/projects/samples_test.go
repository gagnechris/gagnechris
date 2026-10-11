package projects

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

func TestBuildersRebuildContractSamples(t *testing.T) {
	samplerows.RoundTrip(t, "projects", func(item data.Item) (data.Item, error) {
		r, err := parse(item)
		p := r.Project
		if r.storedFlag != nil {
			p.HasUnpublishedChanges = *r.storedFlag
		}
		if samplerows.Published(item) {
			return publishedItem(p), err
		}
		return metaItem(p), err
	})
}
