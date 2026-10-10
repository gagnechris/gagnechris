package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gagnechris/gagnechris/go/internal/observability"
)

// Errors a handler returns; Dispatch turns each into the status and JSON
// body the Node API sends for it.

type BadRequestError struct {
	Message string
	Fields  map[string]string
}

func (e *BadRequestError) Error() string { return e.Message }

// BadRequest is a 400 with optional per-field codes.
func BadRequest(message string, fields map[string]string) error {
	return &BadRequestError{Message: message, Fields: fields}
}

var (
	ErrInvalidJSONBody = BadRequest("Invalid JSON body", nil)
	ErrInvalidCursor   = BadRequest("Invalid pagination cursor", nil)
)

func InvalidHeader(header string) error {
	return BadRequest("Invalid "+header+" header", nil)
}

type NotFoundError struct{ Message string }

func (e *NotFoundError) Error() string { return e.Message }

func NotFound(message string) error { return &NotFoundError{Message: message} }

// ConflictCode distinguishes unique-claim collisions from stale versions.
type ConflictCode string

const (
	CodeConflict        ConflictCode = "conflict"
	CodeVersionConflict ConflictCode = "version_conflict"
	CodeDeleted         ConflictCode = "deleted"
	CodePayloadMismatch ConflictCode = "payload_mismatch"
	CodeSlugTaken       ConflictCode = "slug_taken"
	CodeDailyTaken      ConflictCode = "daily_taken"
)

type ConflictError struct {
	Message        string
	Code           ConflictCode
	CurrentVersion *int
	Current        any
	Cause          error
}

func (e *ConflictError) Error() string { return e.Message }
func (e *ConflictError) Unwrap() error { return e.Cause }

type PreconditionFailedError struct {
	Message        string
	CurrentVersion *int
	Current        any
}

func (e *PreconditionFailedError) Error() string { return e.Message }

// ResyncRequiredError means the client's sync watermark is older than the
// tombstone retention horizon.
type ResyncRequiredError struct{ Message string }

func (e *ResyncRequiredError) Error() string { return e.Message }

type UpgradeRequiredError struct {
	Message          string
	MinClientVersion string
}

func (e *UpgradeRequiredError) Error() string { return e.Message }

type ServiceUnavailableError struct{ Message string }

func (e *ServiceUnavailableError) Error() string { return e.Message }

type RateLimitedError struct{ Message string }

func (e *RateLimitedError) Error() string { return e.Message }

// DataIntegrityError is a stored row that fails validation: a 500, never a
// client error.
type DataIntegrityError struct {
	Message string
	PK, SK  string
	Cause   error
}

func (e *DataIntegrityError) Error() string { return e.Message }
func (e *DataIntegrityError) Unwrap() error { return e.Cause }

// SyncAdapterMissingError is a 500, not a skip: advancing nextSince past the
// row would make clients miss it permanently.
type SyncAdapterMissingError struct{ ChangeType string }

func (e *SyncAdapterMissingError) Error() string {
	return "No sync adapter registered for change type " + e.ChangeType
}

func withCurrent(body map[string]any, version *int, current any) map[string]any {
	if version != nil {
		body["currentVersion"] = *version
	}
	if current != nil {
		body["current"] = current
	}
	return body
}

// mapError returns nil for errors with no client meaning; those are 500s.
func mapError(err error, log *slog.Logger, m *observability.Metrics) *Response {
	var (
		badRequest   *BadRequestError
		notFound     *NotFoundError
		resync       *ResyncRequiredError
		upgrade      *UpgradeRequiredError
		precondition *PreconditionFailedError
		conflict     *ConflictError
		integrity    *DataIntegrityError
		noAdapter    *SyncAdapterMissingError
		unavailable  *ServiceUnavailableError
		rateLimited  *RateLimitedError
	)
	switch {
	case errors.As(err, &badRequest):
		body := map[string]any{"error": "bad_request", "message": badRequest.Message}
		if badRequest.Fields != nil {
			body["fields"] = badRequest.Fields
		}
		return JSON(http.StatusBadRequest, body)
	case errors.As(err, &notFound):
		return errorJSON(http.StatusNotFound, "not_found", notFound.Message)
	case errors.As(err, &resync):
		return errorJSON(http.StatusGone, "resync_required", resync.Message)
	case errors.As(err, &upgrade):
		return JSON(http.StatusUpgradeRequired, map[string]any{
			"error":            "upgrade_required",
			"message":          upgrade.Message,
			"minClientVersion": upgrade.MinClientVersion,
		})
	case errors.As(err, &precondition):
		m.Add("WriteConflict", observability.Count, 1)
		return JSON(http.StatusPreconditionFailed, withCurrent(map[string]any{
			"error":   "precondition_failed",
			"message": precondition.Message,
		}, precondition.CurrentVersion, precondition.Current))
	case errors.As(err, &conflict):
		m.Add("WriteConflict", observability.Count, 1)
		code := conflict.Code
		if code == "" {
			code = CodeConflict
		}
		return JSON(http.StatusConflict, withCurrent(map[string]any{
			"error":   string(code),
			"message": conflict.Message,
		}, conflict.CurrentVersion, conflict.Current))
	case errors.As(err, &integrity):
		attrs := []any{"pk", integrity.PK, "sk", integrity.SK, "errMessage", integrity.Message}
		if integrity.Cause != nil {
			attrs = append(attrs, "causeMessage", integrity.Cause.Error())
		}
		log.Error("Data integrity error", attrs...)
		m.Add("DataIntegrityError", observability.Count, 1)
		return errorJSON(http.StatusInternalServerError, "data_integrity", "Stored data failed validation")
	case errors.As(err, &noAdapter):
		log.Error("Sync row has no registered adapter", "changeType", noAdapter.ChangeType)
		m.Add("SyncAdapterMissing", observability.Count, 1)
		return errorJSON(http.StatusInternalServerError, "sync_adapter_missing", "Sync feed cannot decode a stored change")
	case errors.As(err, &unavailable):
		return errorJSON(http.StatusServiceUnavailable, "service_unavailable", unavailable.Message)
	case errors.As(err, &rateLimited):
		return errorJSON(http.StatusTooManyRequests, "rate_limited", rateLimited.Message)
	}
	return nil
}

func errorJSON(status int, code, message string) *Response {
	return JSON(status, map[string]any{"error": code, "message": message})
}
