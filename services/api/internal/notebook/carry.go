package notebook

import (
	"context"
	"slices"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

// carriedIn: t's line in daily note n came from an earlier day, not from
// its own note or a move to n's day.
func carriedIn(t Task, n Note) bool {
	return isOpen(t.Status) && !t.Someday &&
		(t.NoteID == nil || *t.NoteID != n.ID) &&
		(t.StartDate == nil || *t.StartDate < *n.Date)
}

// syncCarry stops carrying the tasks a save of daily note n took out after
// they were carried in, and carries again the stopped tasks it put back.
// The mark is not part of the task's version, so a client's pending edit
// to the task still applies.
func (r *tasksRepo) syncCarry(ctx context.Context, userID string, n Note) error {
	if !isDaily(n) || n.Deleted {
		return nil
	}
	var removed, added []string
	for _, id := range n.previousTaskIDs {
		if !slices.Contains(n.TaskIDs, id) {
			removed = append(removed, id)
		}
	}
	for _, id := range n.TaskIDs {
		if !slices.Contains(n.previousTaskIDs, id) {
			added = append(added, id)
		}
	}
	if len(removed)+len(added) == 0 {
		return nil
	}
	tasks, err := r.base.getMany(ctx, userID, append(removed, added...))
	if err != nil {
		return err
	}
	for _, t := range tasks {
		switch {
		case slices.Contains(removed, t.ID) && !t.CarryStopped && carriedIn(t, n):
			err = r.setCarryStopped(ctx, userID, t.ID, true)
		case slices.Contains(added, t.ID) && t.CarryStopped:
			err = r.setCarryStopped(ctx, userID, t.ID, false)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *tasksRepo) setCarryStopped(ctx context.Context, userID, id string, stopped bool) error {
	in := &dynamodb.UpdateItemInput{
		TableName:                 aws.String(r.table.Name),
		Key:                       taskKey(userID, id),
		UpdateExpression:          aws.String("REMOVE carryStopped"),
		ConditionExpression:       aws.String("attribute_exists(pk) AND deleted = :f"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":f": data.Bool(false)},
	}
	if stopped {
		in.UpdateExpression = aws.String("SET carryStopped = :t")
		in.ExpressionAttributeValues[":t"] = data.Bool(true)
	}
	_, err := r.table.DB.UpdateItem(ctx, in)
	if isConditionFailed(err) {
		return nil
	}
	return err
}
