package store

import (
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/smithy-go"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/data/datatest"
)

func TestMapWriteError(t *testing.T) {
	claim := ClaimWrite{ClaimIndexes: []int{2}, ClaimMessage: "Slug taken", VersionIndex: 0}
	canceled := datatest.Canceled
	cases := []struct {
		name     string
		err      error
		claim    ClaimWrite
		wantCode api.ConflictCode // "" for not a conflict
		want503  bool
	}{
		{"claim failed", canceled("None", "None", "ConditionalCheckFailed"), claim, api.CodeSlugTaken, false},
		{"claim and version failed: version wins", canceled("ConditionalCheckFailed", "None", "ConditionalCheckFailed"), claim, api.CodeConflict, false},
		{"version failed", canceled("ConditionalCheckFailed", "None", "None"), claim, api.CodeConflict, false},
		{"claim lost to a transaction", canceled("None", "None", "TransactionConflict"), claim, api.CodeConflict, false},
		{"claim code from the write", canceled("None", "None", "ConditionalCheckFailed"), ClaimWrite{ClaimIndexes: []int{2}, ClaimCode: api.CodeDailyTaken, VersionIndex: -1}, api.CodeDailyTaken, false},
		{"single-item condition", &types.ConditionalCheckFailedException{}, claim, api.CodeConflict, false},
		{"throttled item", canceled("None", "ThrottlingError", "ConditionalCheckFailed"), claim, "", true},
		{"throttled request", &types.ProvisionedThroughputExceededException{}, claim, "", true},
	}
	for _, c := range cases {
		err := MapWriteError(c.err, "Update conflict", c.claim)
		var unavailable *api.ServiceUnavailableError
		if got := errors.As(err, &unavailable); got != c.want503 {
			t.Errorf("%s: err = %v, want 503 %v", c.name, err, c.want503)
			continue
		}
		if c.want503 {
			continue
		}
		var conflict *api.ConflictError
		if !errors.As(err, &conflict) || conflict.Code != c.wantCode {
			t.Errorf("%s: err = %v, want a %s conflict", c.name, err, c.wantCode)
		}
	}
	tooBig := &smithy.GenericAPIError{Code: "ValidationException", Message: "Item size has exceeded the maximum allowed size"}
	var tooLarge *api.PayloadTooLargeError
	if err := MapWriteError(tooBig, "x", claim); !errors.As(err, &tooLarge) {
		t.Errorf("item over the size limit: err = %v, want a 413", err)
	}
	if err := MapVersionedWriteError(tooBig, "x", claim, func() error { return errors.New("conflict") }); !errors.As(err, &tooLarge) {
		t.Errorf("versioned item over the size limit: err = %v, want a 413", err)
	}
	other := &types.ResourceNotFoundException{}
	if err := MapWriteError(other, "x", claim); !errors.Is(err, other) {
		t.Errorf("other: err = %v, want it unchanged", err)
	}
	if MapWriteError(nil, "x", claim) != nil {
		t.Error("nil must map to nil")
	}
}
