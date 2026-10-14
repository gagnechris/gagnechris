package store

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

// TryIncrement adds one to a rate-limit counter row unless it is already at
// maxCount; false means the limit is reached.
func TryIncrement(ctx context.Context, table *data.Table, pk, sk string, maxCount int, ttl int64) (bool, error) {
	_, err := table.DB.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(table.Name),
		Key:                      data.Key(pk, sk),
		UpdateExpression:         aws.String("ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl), entityType = if_not_exists(entityType, :etype)"),
		ConditionExpression:      aws.String("attribute_not_exists(#count) OR #count < :max"),
		ExpressionAttributeNames: map[string]string{"#count": "count", "#ttl": "ttl"},
		ExpressionAttributeValues: data.Item{
			":one":   data.N(1),
			":max":   data.N(int64(maxCount)),
			":ttl":   data.N(ttl),
			":etype": data.S("rateLimit"),
		},
	})
	if err != nil && data.ClassifyWriteError(err) == data.WriteConflict {
		return false, nil
	}
	return err == nil, err
}
