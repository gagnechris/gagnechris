package data

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func TestClassifyWriteError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want WriteErrorKind
	}{
		{"condition failed", &types.ConditionalCheckFailedException{}, WriteConflict},
		{"item held by a transaction", &types.TransactionConflictException{}, WriteConflict},
		{"throttled", &types.ProvisionedThroughputExceededException{}, WriteThrottled},
		{"canceled on a condition", &types.TransactionCanceledException{
			CancellationReasons: []types.CancellationReason{{Code: aws.String("None")}, {Code: aws.String("ConditionalCheckFailed")}},
		}, WriteConflict},
		{"other", &types.ResourceNotFoundException{}, WriteOther},
	}
	for _, c := range cases {
		if got := ClassifyWriteError(c.err); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
