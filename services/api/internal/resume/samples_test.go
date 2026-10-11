package resume

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

func TestBuildersRebuildContractSamples(t *testing.T) {
	samplerows.RoundTrip(t, "resume", func(item data.Item) (data.Item, error) {
		v, err := parse(item)
		if samplerows.Published(item) {
			return publishedItem(v), err
		}
		return metaItem(v), err
	})
}
