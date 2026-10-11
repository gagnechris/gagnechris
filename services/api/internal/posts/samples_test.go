package posts

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

func TestBuildersRebuildContractSamples(t *testing.T) {
	samplerows.RoundTrip(t, "posts", func(item data.Item) (data.Item, error) {
		p, err := parseMeta(item)
		if samplerows.Published(item) {
			return publishedItem(p), err
		}
		return metaItem(p), err
	})
}
