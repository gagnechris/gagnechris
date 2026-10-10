package data

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"
)

// Item is a DynamoDB row as the SDK sends it.
type Item = map[string]types.AttributeValue

func S(s string) types.AttributeValue { return &types.AttributeValueMemberS{Value: s} }

func N(n int64) types.AttributeValue {
	return &types.AttributeValueMemberN{Value: strconv.FormatInt(n, 10)}
}

func Bool(b bool) types.AttributeValue { return &types.AttributeValueMemberBOOL{Value: b} }

var Null types.AttributeValue = &types.AttributeValueMemberNULL{Value: true}

// OptS is null for nil, as the DocumentClient stores a JavaScript null.
func OptS(s *string) types.AttributeValue {
	if s == nil {
		return Null
	}
	return S(*s)
}

// StrList is a list, never a string set, as the DocumentClient writes an
// array.
func StrList(ss []string) types.AttributeValue {
	l := make([]types.AttributeValue, len(ss))
	for i, s := range ss {
		l[i] = S(s)
	}
	return &types.AttributeValueMemberL{Value: l}
}

func M(item Item) types.AttributeValue { return &types.AttributeValueMemberM{Value: item} }

func StrSet(ss ...string) types.AttributeValue { return &types.AttributeValueMemberSS{Value: ss} }

func Key(pk, sk string) Item { return Item{"pk": S(pk), "sk": S(sk)} }

// WriteErrorKind classifies a failed write as classifyDynamoWriteError does.
type WriteErrorKind int

const (
	WriteOther WriteErrorKind = iota
	WriteConflict
	WriteThrottled
)

// CancellationCodes are a canceled transaction's per-item codes, in
// TransactItems order; "" where an item has none.
func CancellationCodes(err error) []string {
	var canceled *types.TransactionCanceledException
	if !errors.As(err, &canceled) {
		return nil
	}
	codes := make([]string, len(canceled.CancellationReasons))
	for i, r := range canceled.CancellationReasons {
		codes[i] = aws.ToString(r.Code)
	}
	return codes
}

func ClassifyWriteError(err error) WriteErrorKind {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		return WriteOther
	}
	switch apiErr.ErrorCode() {
	case "ThrottlingException", "ThrottlingError", "ProvisionedThroughputExceededException", "RequestLimitExceeded":
		return WriteThrottled
	case "ConditionalCheckFailedException":
		return WriteConflict
	case "TransactionCanceledException":
		codes := CancellationCodes(err)
		known := 0
		conflict := false
		for _, c := range codes {
			switch c {
			case "":
				continue
			case "ThrottlingError", "ProvisionedThroughputExceeded", "RequestLimitExceeded":
				return WriteThrottled
			case "ConditionalCheckFailed", "TransactionConflict":
				conflict = true
			}
			known++
		}
		// A canceled transaction with no reasons and no throttle signal is a conflict.
		if conflict || known == 0 {
			return WriteConflict
		}
	}
	return WriteOther
}

func hasCode(codes []string, code string) bool {
	for _, c := range codes {
		if c == code {
			return true
		}
	}
	return false
}

// FailedCondition reports whether any item at indexes failed its condition.
func FailedCondition(err error, indexes ...int) bool {
	codes := CancellationCodes(err)
	for _, i := range indexes {
		if i >= 0 && i < len(codes) && codes[i] == "ConditionalCheckFailed" {
			return true
		}
	}
	return false
}

// IsTransactionConflict is a loss to a concurrent transaction on one of the
// items, not a failed condition.
func IsTransactionConflict(err error) bool {
	return hasCode(CancellationCodes(err), "TransactionConflict")
}

const transactionConflictRetries = 4

// Backoff is full jitter on 20, 40, 80, 160 ms so racing writers spread out.
func Backoff(ctx context.Context, attempt int) error {
	d := time.Duration(rand.Float64() * float64(20*time.Millisecond) * float64(int(1)<<attempt))
	select {
	case <-time.After(d):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// RetryTransactionConflicts resends a transaction that lost only to a
// concurrent one: a canceled transaction applied nothing.
func RetryTransactionConflicts(ctx context.Context, write func() error) error {
	for attempt := 0; ; attempt++ {
		err := write()
		if err == nil {
			return nil
		}
		codes := CancellationCodes(err)
		if attempt >= transactionConflictRetries || !hasCode(codes, "TransactionConflict") || hasCode(codes, "ConditionalCheckFailed") {
			return err
		}
		if err := Backoff(ctx, attempt); err != nil {
			return err
		}
	}
}

const batchGetMaxKeys = 100
const batchGetMaxAttempts = 5

// BatchGet reads every key, retrying unprocessed ones; an unprocessed key is
// never reported as missing.
func (t *Table) BatchGet(ctx context.Context, keys []Item, consistent bool) ([]Item, error) {
	var out []Item
	for start := 0; start < len(keys); start += batchGetMaxKeys {
		pending := map[string]types.KeysAndAttributes{t.Name: {
			Keys:           keys[start:min(start+batchGetMaxKeys, len(keys))],
			ConsistentRead: aws.Bool(consistent),
		}}
		for attempt := 1; ; attempt++ {
			res, err := t.DB.BatchGetItem(ctx, &dynamodb.BatchGetItemInput{RequestItems: pending})
			if err != nil {
				return nil, err
			}
			out = append(out, res.Responses[t.Name]...)
			pending = res.UnprocessedKeys
			if len(pending[t.Name].Keys) == 0 {
				break
			}
			if attempt == batchGetMaxAttempts {
				return nil, fmt.Errorf("DynamoDB BatchGet still has UnprocessedKeys after %d attempts", batchGetMaxAttempts)
			}
			select {
			case <-time.After(25 * time.Millisecond << (attempt - 1)):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
	}
	return out, nil
}
