package data_test

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
)

func TestClassifyWriteError(t *testing.T) {
	canceled := datatest.Canceled
	cases := []struct {
		name string
		err  error
		want data.WriteErrorKind
	}{
		{"condition failed", &types.ConditionalCheckFailedException{}, data.WriteConflict},
		{"item held by a transaction", &types.TransactionConflictException{}, data.WriteConflict},
		{"throughput exceeded", &types.ProvisionedThroughputExceededException{}, data.WriteThrottled},
		{"request limit", &types.RequestLimitExceeded{}, data.WriteThrottled},
		{"throttling exception", &smithy.GenericAPIError{Code: "ThrottlingException"}, data.WriteThrottled},
		{"wrapped throttle", fmt.Errorf("put: %w", &types.ProvisionedThroughputExceededException{}), data.WriteThrottled},
		{"canceled on a condition", canceled("None", "ConditionalCheckFailed"), data.WriteConflict},
		{"canceled by another transaction", canceled("TransactionConflict", "None"), data.WriteConflict},
		{"canceled with no reasons", canceled(), data.WriteConflict},
		{"canceled with empty codes", canceled("", ""), data.WriteConflict},
		{"canceled on a throttled item", canceled("None", "ThrottlingError"), data.WriteThrottled},
		{"canceled on throughput", canceled("ProvisionedThroughputExceeded"), data.WriteThrottled},
		{"canceled on request limit", canceled("RequestLimitExceeded"), data.WriteThrottled},
		{"throttle outranks a conflict", canceled("ConditionalCheckFailed", "ThrottlingError"), data.WriteThrottled},
		{"canceled on validation", canceled("None", "ValidationError"), data.WriteOther},
		{"other API error", &types.ResourceNotFoundException{}, data.WriteOther},
		{"not an API error", errors.New("dial tcp: timeout"), data.WriteOther},
	}
	for _, c := range cases {
		if got := data.ClassifyWriteError(c.err); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestFailedCondition(t *testing.T) {
	err := datatest.Canceled("None", "ConditionalCheckFailed", "TransactionConflict")
	cases := []struct {
		name    string
		err     error
		indexes []int
		want    bool
	}{
		{"failed index", err, []int{1}, true},
		{"any of several", err, []int{0, 1}, true},
		{"passed index", err, []int{0}, false},
		{"lost to a transaction, not a condition", err, []int{2}, false},
		{"out of range", err, []int{3, -1}, false},
		{"no indexes", err, nil, false},
		{"not canceled", &types.ConditionalCheckFailedException{}, []int{0}, false},
		{"wrapped", fmt.Errorf("write: %w", err), []int{1}, true},
	}
	for _, c := range cases {
		if got := data.FailedCondition(c.err, c.indexes...); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
	if !data.IsTransactionConflict(err) || data.IsTransactionConflict(datatest.Canceled("ConditionalCheckFailed")) {
		t.Error("IsTransactionConflict must report a TransactionConflict reason only")
	}
}

func TestRetryTransactionConflicts(t *testing.T) {
	conflict := datatest.Canceled("None", "TransactionConflict")
	cases := []struct {
		name      string
		errs      []error // per attempt; the last repeats
		wantCalls int
	}{
		{"succeeds first time", []error{nil}, 1},
		{"retries a conflict", []error{conflict, conflict, nil}, 3},
		{"gives up after four retries", []error{conflict}, 5},
		{"never retries a failed condition", []error{datatest.Canceled("ConditionalCheckFailed", "TransactionConflict")}, 1},
		{"never retries a throttle", []error{datatest.Canceled("ThrottlingError")}, 1},
		{"never retries other errors", []error{&types.TransactionConflictException{}}, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			waits := datatest.NoSleep(t)
			calls := 0
			err := data.RetryTransactionConflicts(context.Background(), func() error {
				calls++
				return c.errs[min(calls, len(c.errs))-1]
			})
			if calls != c.wantCalls {
				t.Fatalf("calls = %d, want %d", calls, c.wantCalls)
			}
			if last := c.errs[min(calls, len(c.errs))-1]; !errors.Is(err, last) {
				t.Fatalf("err = %v, want the last attempt's %v", err, last)
			}
			if len(*waits) != calls-1 {
				t.Fatalf("waits = %v, want one per retry", *waits)
			}
			for i, d := range *waits {
				if d < 0 || d >= 20*time.Millisecond<<i {
					t.Errorf("wait %d = %v, want full jitter under %v", i, d, 20*time.Millisecond<<i)
				}
			}
		})
	}
}

func TestRetryTransactionConflictsStopsWhenTheContextEnds(t *testing.T) {
	datatest.NoSleep(t)
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	err := data.RetryTransactionConflicts(ctx, func() error {
		calls++
		cancel()
		return datatest.Canceled("TransactionConflict")
	})
	if !errors.Is(err, context.Canceled) || calls != 1 {
		t.Fatalf("err = %v after %d calls, want context.Canceled after 1", err, calls)
	}
}

func keysOf(n int) []data.Item {
	out := make([]data.Item, n)
	for i := range out {
		out[i] = data.Key("K#"+strconv.Itoa(i), "META")
	}
	return out
}

func pkOf(item data.Item) string { return item["pk"].(*types.AttributeValueMemberS).Value }

// batchFake answers BatchGetItem with its keys, holding back up to
// `withhold` of them as UnprocessedKeys while throttled(call).
func batchFake(withhold int, throttled func(call int) bool) (*datatest.Fake, *[][]string) {
	var requests [][]string
	f := &datatest.Fake{}
	f.BatchGetItemFn = func(in *dynamodb.BatchGetItemInput) (*dynamodb.BatchGetItemOutput, error) {
		ka := in.RequestItems["test"]
		var pks []string
		for _, k := range ka.Keys {
			pks = append(pks, pkOf(k))
		}
		requests = append(requests, pks)
		keys := ka.Keys
		var unprocessed []data.Item
		if throttled(len(requests)) {
			cut := max(len(keys)-withhold, 0)
			keys, unprocessed = keys[:cut], keys[cut:]
		}
		out := &dynamodb.BatchGetItemOutput{Responses: map[string][]data.Item{"test": {}}}
		for _, k := range keys {
			out.Responses["test"] = append(out.Responses["test"], data.Item{"pk": k["pk"], "sk": k["sk"], "v": data.S("row")})
		}
		if len(unprocessed) > 0 {
			out.UnprocessedKeys = map[string]types.KeysAndAttributes{"test": {Keys: unprocessed, ConsistentRead: ka.ConsistentRead}}
		}
		return out, nil
	}
	return f, &requests
}

func TestBatchGetRetriesUnprocessedKeys(t *testing.T) {
	waits := datatest.NoSleep(t)
	f, requests := batchFake(2, func(call int) bool { return call <= 2 })
	table := &data.Table{DB: f, Name: "test"}

	items, err := table.BatchGet(context.Background(), keysOf(5), true)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, item := range items {
		got[pkOf(item)] = true
	}
	if len(items) != 5 || len(got) != 5 {
		t.Fatalf("items = %v, want each of the 5 keys once", items)
	}
	want := [][]string{{"K#0", "K#1", "K#2", "K#3", "K#4"}, {"K#3", "K#4"}, {"K#3", "K#4"}}
	if fmt.Sprint(*requests) != fmt.Sprint(want) {
		t.Fatalf("requests = %v, want %v: only the unprocessed keys go again", *requests, want)
	}
	if fmt.Sprint(*waits) != fmt.Sprint([]time.Duration{25 * time.Millisecond, 50 * time.Millisecond}) {
		t.Fatalf("waits = %v, want 25ms then 50ms", *waits)
	}
}

func TestBatchGetGivesUpOnPersistentUnprocessedKeys(t *testing.T) {
	waits := datatest.NoSleep(t)
	f, requests := batchFake(1, func(int) bool { return true })
	table := &data.Table{DB: f, Name: "test"}

	items, err := table.BatchGet(context.Background(), keysOf(3), false)
	if err == nil || !strings.Contains(err.Error(), "UnprocessedKeys after 5 attempts") {
		t.Fatalf("err = %v, want the give-up error", err)
	}
	if items != nil {
		t.Fatalf("items = %v, want none: a partial read would report keys as missing", items)
	}
	if len(*requests) != 5 || len(*waits) != 4 {
		t.Fatalf("%d requests and %d waits, want 5 and 4", len(*requests), len(*waits))
	}
}

func TestBatchGetChunksAndPassesThroughErrors(t *testing.T) {
	datatest.NoSleep(t)
	f, requests := batchFake(0, func(int) bool { return false })
	table := &data.Table{DB: f, Name: "test"}
	items, err := table.BatchGet(context.Background(), keysOf(150), false)
	if err != nil || len(items) != 150 {
		t.Fatalf("got %d items, err %v; want 150", len(items), err)
	}
	if len(*requests) != 2 || len((*requests)[0]) != 100 || len((*requests)[1]) != 50 {
		t.Fatalf("%d requests, want 100 keys then 50", len(*requests))
	}

	boom := &types.ProvisionedThroughputExceededException{Message: aws.String("slow down")}
	f.BatchGetItemFn = func(*dynamodb.BatchGetItemInput) (*dynamodb.BatchGetItemOutput, error) { return nil, boom }
	if _, err := table.BatchGet(context.Background(), keysOf(1), false); !errors.Is(err, boom) {
		t.Fatalf("err = %v, want the SDK error", err)
	}
}

func TestBatchGetStopsWhenTheContextEnds(t *testing.T) {
	datatest.NoSleep(t)
	ctx, cancel := context.WithCancel(context.Background())
	f, _ := batchFake(1, func(int) bool { cancel(); return true })
	_, err := (&data.Table{DB: f, Name: "test"}).BatchGet(ctx, keysOf(2), false)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}
