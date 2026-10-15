package notebook

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

func TestBuildersRebuildContractSamples(t *testing.T) {
	samplerows.RoundTrip(t, "notebook", func(item data.Item) (data.Item, error) {
		et, _ := item["entityType"].(*types.AttributeValueMemberS)
		switch {
		case et != nil && et.Value == "task":
			task, err := ParseTask(item)
			return taskItem(task), err
		case et != nil && et.Value == "noteTemplate":
			t, err := parseNoteTemplate(item)
			return noteTemplateItem(t), err
		case et != nil && et.Value == "notebookAreas":
			a, err := parseAreas(item)
			return notebookAreasItem("user-sub-1", a), err
		}
		note, err := ParseNote(item)
		return noteItem(note), err
	})
}
