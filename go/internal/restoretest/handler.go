package restoretest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/aws/smithy-go"

	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/observability"
)

type RestoreJobInfo struct {
	RestoreTestingPlanArn     string
	RecoveryPointCreationDate time.Time
}

type PutValidationInput struct {
	RestoreJobID string
	Status       Status
	Message      string
}

type Deps struct {
	Scan                  ScanFunc
	Count                 CountFunc
	SourceTableName       string
	RestoreTestingPlanArn string
	DescribeRestoreJob    func(ctx context.Context, restoreJobID string) (RestoreJobInfo, error)
	PutValidation         func(ctx context.Context, in PutValidationInput) error
	Leftovers             LeftoverDeps
	Freshness             FreshnessDeps
	Now                   func() time.Time
	LeftoverMaxAge        time.Duration
}

// Event is either an AWS Backup "Restore Job State Change", the daily
// "Scheduled Event", or a manual {"action":"leftoverCheck"}.
type Event struct {
	DetailType string `json:"detail-type"`
	Action     string `json:"action"`
	Detail     struct {
		RestoreJobID       string `json:"restoreJobId"`
		Status             string `json:"status"`
		ResourceType       string `json:"resourceType"`
		CreatedResourceArn string `json:"createdResourceArn"`
	} `json:"detail"`
}

type Outcome struct {
	Kind         string          `json:"kind"`
	RestoreJobID string          `json:"restoreJobId,omitempty"`
	TableName    string          `json:"tableName,omitempty"`
	Result       *Result         `json:"result,omitempty"`
	Leftovers    []LeftoverTable `json:"leftovers,omitzero"`
	Freshness    *Freshness      `json:"freshness,omitempty"`
}

type Handler struct {
	deps      Deps
	validator *Validator
	log       *slog.Logger
	metrics   *observability.Metrics
}

func NewHandler(deps Deps, log *slog.Logger, metrics *observability.Metrics) (*Handler, error) {
	validator, err := NewValidator()
	if err != nil {
		return nil, err
	}
	if deps.LeftoverMaxAge == 0 {
		deps.LeftoverMaxAge = DefaultLeftoverMaxAge
	}
	return &Handler{deps: deps, validator: validator, log: log, metrics: metrics}, nil
}

var errUnsupported = errors.New("unsupported restore-test event")

// Handle returns nil for a restore job event it does not act on.
func (h *Handler) Handle(ctx context.Context, raw json.RawMessage) (*Outcome, error) {
	var event Event
	if err := json.Unmarshal(raw, &event); err != nil {
		return nil, fmt.Errorf("%w: %w", errUnsupported, err)
	}
	switch {
	case event.DetailType == "Restore Job State Change":
		return h.handleRestoreJob(ctx, event)
	case event.DetailType == "Scheduled Event" || event.Action == "leftoverCheck":
		return h.handleLeftoverCheck(ctx)
	default:
		return nil, errUnsupported
	}
}

var metricNames = contract.Data.RestoreTest.Metrics

func (h *Handler) handleRestoreJob(ctx context.Context, event Event) (*Outcome, error) {
	d := event.Detail
	if d.RestoreJobID == "" {
		return nil, errors.New("restore job state change event without restoreJobId")
	}
	if d.Status != "COMPLETED" {
		h.log.Info("Ignoring restore job event", "restoreJobId", d.RestoreJobID, "status", d.Status)
		return nil, nil
	}
	// The rule cannot filter on the plan (the event does not reliably carry its
	// ARN), so ownership is decided here. A validation result on a job outside
	// our plan, such as a manual restore, would be wrong and cannot be undone.
	job, err := h.deps.DescribeRestoreJob(ctx, d.RestoreJobID)
	if err != nil {
		return nil, err
	}
	if job.RestoreTestingPlanArn != h.deps.RestoreTestingPlanArn {
		h.log.Info("Ignoring restore job outside the restore testing plan", "restoreJobId", d.RestoreJobID)
		return &Outcome{Kind: "ignored", RestoreJobID: d.RestoreJobID}, nil
	}

	tableName := TableNameFromArn(d.CreatedResourceArn)
	var result Result
	if tableName == "" {
		result = Finalize(Result{Problems: []string{"event has no DynamoDB createdResourceArn"}})
	} else {
		result = h.validate(ctx, d.RestoreJobID, tableName, job.RecoveryPointCreationDate)
	}

	// Report first: the status can be set only once, and setting it lets AWS
	// Backup delete the scratch table now instead of at the window's end.
	if err := h.deps.PutValidation(ctx, PutValidationInput{
		RestoreJobID: d.RestoreJobID,
		Status:       result.Status,
		Message:      result.Message,
	}); err != nil {
		return nil, err
	}

	h.log.Info("Restore validation reported",
		"restoreJobId", d.RestoreJobID,
		"tableName", tableName,
		"status", result.Status,
		"itemCount", result.ItemCount,
		"schemaChecked", result.SchemaChecked,
		"problems", len(result.Problems),
		"floorChecked", result.FloorChecked,
	)
	name := metricNames.ValidationFailed
	if result.Status == Successful {
		name = metricNames.ValidationSucceeded
	}
	h.metrics.Add(name, observability.Count, 1)
	if err := h.metrics.Flush(); err != nil {
		return nil, err
	}
	return &Outcome{Kind: "validation", RestoreJobID: d.RestoreJobID, TableName: tableName, Result: &result}, nil
}

func (h *Handler) validate(ctx context.Context, restoreJobID, tableName string, restorePoint time.Time) Result {
	opts := Options{}
	if !restorePoint.IsZero() {
		opts.Floor = &CountFloor{Count: h.deps.Count, SourceTable: h.deps.SourceTableName, RestorePoint: restorePoint}
	}
	result, err := h.validator.ValidateTable(ctx, h.deps.Scan, tableName, opts)
	if err != nil {
		// A validator that cannot read the table is a failed test, not a retry.
		h.log.Error("Restore validation threw", "restoreJobId", restoreJobID, "error", err)
		return Finalize(Result{Problems: []string{
			fmt.Sprintf("validator error reading %s: %s", tableName, awsErrorName(err)),
		}})
	}
	if restorePoint.IsZero() {
		result.Problems = append(result.Problems, "restore job has no recovery point date; count floor not checked")
		result = Finalize(result)
	}
	return result
}

// awsErrorName is the AWS error code, such as AccessDeniedException.
func awsErrorName(err error) string {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode()
	}
	return "Error"
}

func flag(on bool) float64 {
	if on {
		return 1
	}
	return 0
}

func (h *Handler) handleLeftoverCheck(ctx context.Context) (*Outcome, error) {
	maxAge := h.deps.LeftoverMaxAge
	maxAgeHours := maxAge.Hours()
	leftovers, err := FindLeftoverRestoreTables(ctx, h.deps.Leftovers, h.deps.Now(), maxAge)
	if err != nil {
		return nil, err
	}
	if len(leftovers) > 0 {
		h.log.Warn("Leftover restore scratch tables", "leftovers", leftovers, "maxAgeHours", maxAgeHours)
	} else {
		h.log.Info("No leftover restore scratch tables", "maxAgeHours", maxAgeHours)
	}
	h.metrics.Add(metricNames.LeftoverTables, observability.Count, float64(len(leftovers)))
	if err := h.metrics.Flush(); err != nil {
		return nil, err
	}

	freshness, err := CheckBackupFreshness(ctx, h.deps.Freshness, h.deps.Now())
	if err != nil {
		return nil, err
	}
	level := slog.LevelInfo
	if freshness.StaleRecoveryPoint || freshness.ValidationMissing || freshness.AdvancedBackupDisabled {
		level = slog.LevelWarn
	}
	h.log.Log(ctx, level, "Backup freshness",
		"recoveryPointAgeHours", freshness.RecoveryPointAgeHours,
		"staleRecoveryPoint", freshness.StaleRecoveryPoint,
		"validationAgeDays", freshness.ValidationAgeDays,
		"validationMissing", freshness.ValidationMissing,
		"advancedBackupDisabled", freshness.AdvancedBackupDisabled,
	)
	h.metrics.Add(metricNames.StaleRecoveryPoint, observability.Count, flag(freshness.StaleRecoveryPoint))
	h.metrics.Add(metricNames.ValidationMissing, observability.Count, flag(freshness.ValidationMissing))
	h.metrics.Add(metricNames.AdvancedBackupDisabled, observability.Count, flag(freshness.AdvancedBackupDisabled))
	h.metrics.Add(metricNames.BackupCheckCompleted, observability.Count, 1)
	if err := h.metrics.Flush(); err != nil {
		return nil, err
	}
	return &Outcome{Kind: "leftoverCheck", Leftovers: leftovers, Freshness: &freshness}, nil
}
