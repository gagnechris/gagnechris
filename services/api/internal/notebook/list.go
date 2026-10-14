package notebook

import (
	"context"
	"slices"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

type Reader struct {
	Table     *data.Table
	OnCorrupt func(*api.DataIntegrityError)
}

func queryPartition[T any](ctx context.Context, rd Reader, pk string, forward bool, cursor string, remaining, remainingBytes int, parse func(data.Item) (T, error), deleted func(T) bool) (store.Page[T], error) {
	return store.QueryPage(ctx, rd.Table, store.PageQuery{
		Input: dynamodb.QueryInput{
			IndexName:                 aws.String(keys.GSI1),
			KeyConditionExpression:    aws.String("gsi1pk = :pk"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
			ScanIndexForward:          aws.Bool(forward),
		},
		Cursor:         cursor,
		Limit:          remaining,
		CursorKeys:     store.GSI1CursorKeys,
		PartitionAttr:  "gsi1pk",
		PartitionValue: pk,
		ByteBudget:     remainingBytes,
	}, func(item data.Item) (T, bool, error) {
		row, err := parse(item)
		return row, err == nil && deleted(row), err
	}, rd.OnCorrupt)
}

// AreaNotesNewestFirst is a page of one area's notes: pages by last update,
// then daily notes by date, newest first.
func (rd Reader) AreaNotesNewestFirst(ctx context.Context, userID, area, cursor string, limit, limitBytes int) (store.Page[Note], error) {
	return queryPartition(ctx, rd, keys.NotebookAreaGSI1Pk(userID, area), false, cursor, limit, limitBytes, ParseNote, func(n Note) bool { return n.Deleted })
}

// AreaStatusTasks is a page of one area's tasks in one status.
func (rd Reader) AreaStatusTasks(ctx context.Context, userID, area, status, cursor string, limit, limitBytes int) (store.Page[Task], error) {
	return queryPartition(ctx, rd, keys.TaskAreaStatusGSI1Pk(userID, area, status), true, cursor, limit, limitBytes, ParseTask, func(t Task) bool { return t.Deleted })
}

// CollectPages reads pages until they run out or limit rows pass keep,
// and returns at most limit.
func CollectPages[T any](limit int, fetch func(cursor string) (store.Page[T], error), keep func(T) bool) ([]T, error) {
	var out []T
	cursor := ""
	for {
		page, err := fetch(cursor)
		if err != nil {
			return nil, err
		}
		for _, row := range page.Items {
			if keep(row) {
				out = append(out, row)
			}
		}
		cursor = page.NextCursor
		if cursor == "" || len(out) >= limit {
			break
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func isOpen(status string) bool { return status == "todo" || status == "in_progress" }

var priorityRank = map[string]int{"high": 0, "med": 1, "low": 2}

// SortTasksForList: carried over (open, started before today), then by
// start date, undated, someday, priority, id.
func SortTasksForList(tasks []Task, today string) {
	carried := func(t Task) int {
		if isOpen(t.Status) && t.StartDate != nil && *t.StartDate < today {
			return 0
		}
		return 1
	}
	slices.SortStableFunc(tasks, func(a, b Task) int {
		if c := carried(a) - carried(b); c != 0 {
			return c
		}
		if a.Someday != b.Someday {
			if a.Someday {
				return 1
			}
			return -1
		}
		switch {
		case a.StartDate == nil && b.StartDate != nil:
			return 1
		case a.StartDate != nil && b.StartDate == nil:
			return -1
		case a.StartDate != nil && *a.StartDate != *b.StartDate:
			return strings.Compare(*a.StartDate, *b.StartDate)
		}
		if p := priorityRank[a.Priority] - priorityRank[b.Priority]; p != 0 {
			return p
		}
		return strings.Compare(a.ID, b.ID)
	})
}
