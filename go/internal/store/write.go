package store

import (
	"errors"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

// VersionMatchCondition requires the row to exist so a hard-deleted row is
// never recreated; a row without `version` counts as version 0.
const VersionMatchCondition = "attribute_exists(pk) AND (version = :v OR (attribute_not_exists(version) AND :v = :zero))"

func VersionMatchValues(expected int) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{":v": data.N(int64(expected)), ":zero": data.N(0)}
}

// ClaimWrite names the unique-claim items of a transaction so their
// failure becomes the claim's conflict code instead of a plain conflict.
type ClaimWrite struct {
	ClaimIndexes []int
	ClaimCode    api.ConflictCode
	ClaimMessage string
	// VersionIndex is the versioned item; when it failed too, the version
	// conflict wins so the client gets `current`. -1 when there is none.
	VersionIndex int
}

// MapWriteError maps a failed write to the errors clients see.
func MapWriteError(err error, conflictMessage string, claim ClaimWrite) error {
	if err == nil {
		return nil
	}
	switch data.ClassifyWriteError(err) {
	case data.WriteConflict:
		claimFailed := data.FailedCondition(err, claim.ClaimIndexes...)
		versionFailed := claim.VersionIndex >= 0 && data.FailedCondition(err, claim.VersionIndex)
		if claimFailed && !versionFailed {
			code := claim.ClaimCode
			if code == "" {
				code = api.CodeSlugTaken
			}
			msg := claim.ClaimMessage
			if msg == "" {
				msg = conflictMessage
			}
			return &api.ConflictError{Message: msg, Code: code}
		}
		return &api.ConflictError{Message: conflictMessage, Code: api.CodeConflict, Cause: err}
	case data.WriteThrottled:
		return &api.ServiceUnavailableError{Message: "DynamoDB is throttling; please retry shortly"}
	}
	return err
}

// MapVersionedWriteError is MapWriteError where any conflict but a unique
// claim's is a version conflict, reported by onConflict.
func MapVersionedWriteError(err error, conflictMessage string, claim ClaimWrite, onConflict func() error) error {
	err = MapWriteError(err, conflictMessage, claim)
	var conflict *api.ConflictError
	if errors.As(err, &conflict) {
		if conflict.Code == api.CodeSlugTaken || conflict.Code == api.CodeDailyTaken {
			return err
		}
		return onConflict()
	}
	return err
}

// VersionConflict is the 409 for a write that lost to another version;
// current is nil when the row is gone.
func VersionConflict(expected int, currentVersion *int, current any) error {
	cur := "unknown"
	if currentVersion != nil {
		cur = strconv.Itoa(*currentVersion)
	}
	return &api.ConflictError{
		Message:        "Version conflict: expected " + strconv.Itoa(expected) + ", current " + cur,
		Code:           api.CodeVersionConflict,
		CurrentVersion: currentVersion,
		Current:        current,
	}
}
