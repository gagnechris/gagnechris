// Package datatest fakes data.Client for tests that need DynamoDB's
// failure modes: cancellation reasons, throttles and UnprocessedKeys.
package datatest

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

// Fake answers each operation with its func; an operation without one
// fails, so a test notices a call it didn't expect.
type Fake struct {
	mu              sync.Mutex
	GetItemFn       func(*dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error)
	PutItemFn       func(*dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error)
	UpdateItemFn    func(*dynamodb.UpdateItemInput) (*dynamodb.UpdateItemOutput, error)
	DeleteItemFn    func(*dynamodb.DeleteItemInput) (*dynamodb.DeleteItemOutput, error)
	QueryFn         func(*dynamodb.QueryInput) (*dynamodb.QueryOutput, error)
	BatchGetItemFn  func(*dynamodb.BatchGetItemInput) (*dynamodb.BatchGetItemOutput, error)
	TransactWriteFn func(*dynamodb.TransactWriteItemsInput) (*dynamodb.TransactWriteItemsOutput, error)
	Calls           []string
}

var _ data.Client = (*Fake)(nil)

func call[I, O any](f *Fake, op string, fn func(I) (O, error), in I) (O, error) {
	f.mu.Lock()
	f.Calls = append(f.Calls, op)
	f.mu.Unlock()
	if fn == nil {
		var zero O
		return zero, fmt.Errorf("datatest: unexpected %s", op)
	}
	return fn(in)
}

func (f *Fake) GetItem(_ context.Context, in *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	return call(f, "GetItem", f.GetItemFn, in)
}

func (f *Fake) PutItem(_ context.Context, in *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	return call(f, "PutItem", f.PutItemFn, in)
}

func (f *Fake) UpdateItem(_ context.Context, in *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	return call(f, "UpdateItem", f.UpdateItemFn, in)
}

func (f *Fake) DeleteItem(_ context.Context, in *dynamodb.DeleteItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	return call(f, "DeleteItem", f.DeleteItemFn, in)
}

func (f *Fake) Query(_ context.Context, in *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	return call(f, "Query", f.QueryFn, in)
}

func (f *Fake) BatchGetItem(_ context.Context, in *dynamodb.BatchGetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
	return call(f, "BatchGetItem", f.BatchGetItemFn, in)
}

func (f *Fake) TransactWriteItems(_ context.Context, in *dynamodb.TransactWriteItemsInput, _ ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	return call(f, "TransactWriteItems", f.TransactWriteFn, in)
}

// Count is how many times op was called.
func (f *Fake) Count(op string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.Calls {
		if c == op {
			n++
		}
	}
	return n
}

// Canceled is a TransactionCanceledException with one reason per item;
// "" is an item with no code.
func Canceled(codes ...string) error {
	reasons := make([]types.CancellationReason, len(codes))
	for i, c := range codes {
		if c != "" {
			reasons[i].Code = aws.String(c)
		}
	}
	return &types.TransactionCanceledException{Message: aws.String("Transaction cancelled"), CancellationReasons: reasons}
}

// NoSleep replaces data.Sleep for the test and returns the waits it was asked
// for.
func NoSleep(t *testing.T) *[]time.Duration {
	t.Helper()
	var mu sync.Mutex
	waits := &[]time.Duration{}
	prev := data.Sleep
	data.Sleep = func(ctx context.Context, d time.Duration) error {
		mu.Lock()
		*waits = append(*waits, d)
		mu.Unlock()
		return ctx.Err()
	}
	t.Cleanup(func() { data.Sleep = prev })
	return waits
}
