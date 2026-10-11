package notebook

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

func TestBuildersRebuildContractSamples(t *testing.T) {
	samplerows.RoundTrip(t, "notebook", func(item data.Item) (data.Item, error) {
		if et, _ := item["entityType"].(*types.AttributeValueMemberS); et != nil && et.Value == "task" {
			task, err := ParseTask(item)
			return taskItem(task), err
		}
		note, err := ParseNote(item)
		return noteItem(note), err
	})
}
