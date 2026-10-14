package revocation

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
)

func TestRevokeRefusesEarlierTokensAndCachesReads(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 10, 1, 12, 0, 0, 500_000_000, time.UTC)
	var row data.Item
	fake := &datatest.Fake{
		GetItemFn: func(*dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: row}, nil
		},
		PutItemFn: func(in *dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error) {
			row = in.Item
			return &dynamodb.PutItemOutput{}, nil
		},
	}
	table := &data.Table{DB: fake, Name: "t"}
	clock := func() time.Time { return now }
	s := New(table, clock)

	if revoked, err := s.Revoked(ctx, "u1", 0); err != nil || revoked {
		t.Fatalf("no row: %v %v", revoked, err)
	}
	if revoked, _ := s.Revoked(ctx, "u1", 0); revoked || fake.Count("GetItem") != 1 {
		t.Fatalf("second read within the cache: %d reads", fake.Count("GetItem"))
	}

	if err := s.Revoke(ctx, "u1"); err != nil {
		t.Fatal(err)
	}
	cut := now.Unix()
	for issued, want := range map[int64]bool{cut - 3600: true, cut - 1: true, cut: false, cut + 1: false, 0: true} {
		if got, err := s.Revoked(ctx, "u1", issued); err != nil || got != want {
			t.Errorf("issued %d: %v %v, want %v", issued, got, err, want)
		}
	}
	if fake.Count("GetItem") != 1 {
		t.Errorf("Revoke should update this instance's cache, read %d times", fake.Count("GetItem"))
	}

	other := New(table, clock)
	if got, _ := other.Revoked(ctx, "u1", cut-1); !got {
		t.Error("another instance does not see the stored revocation")
	}
	now = now.Add(CacheFor)
	if _, err := s.Revoked(ctx, "u1", cut); err != nil || fake.Count("GetItem") != 3 {
		t.Errorf("an expired cache entry should be read again: %d reads", fake.Count("GetItem"))
	}
}

func TestRevokeWritesTheContractRow(t *testing.T) {
	var row data.Item
	fake := &datatest.Fake{PutItemFn: func(in *dynamodb.PutItemInput) (*dynamodb.PutItemOutput, error) {
		row = in.Item
		return &dynamodb.PutItemOutput{}, nil
	}}
	at := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	if err := New(&data.Table{DB: fake, Name: "t"}, func() time.Time { return at }).Revoke(context.Background(), "user-sub-2"); err != nil {
		t.Fatal(err)
	}
	want := data.ToJSON(data.M(samplerows.Item("userRevocation")))
	got := data.ToJSON(data.M(row))
	if !reflect.DeepEqual(got, want) {
		t.Errorf("row %v, want the contract sample %v", got, want)
	}
}

func TestReadFailureIsAnError(t *testing.T) {
	fake := &datatest.Fake{GetItemFn: func(*dynamodb.GetItemInput) (*dynamodb.GetItemOutput, error) {
		return nil, errors.New("throttled")
	}}
	if _, err := New(&data.Table{DB: fake, Name: "t"}, nil).Revoked(context.Background(), "u1", 0); err == nil {
		t.Error("a failed read passed")
	}
}
