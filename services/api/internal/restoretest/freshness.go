package restoretest

import (
	"context"
	"time"
)

// AWS Backup emits no event when nothing happens: no backup job, no eligible
// recovery point for the restore test, or a validate rule that never matches.
// So the daily check asks AWS Backup what last succeeded.

const (
	RecoveryPointMaxAge     = 26 * time.Hour
	RestoreValidationMaxAge = 8 * 24 * time.Hour
)

// FreshnessDeps return the zero time when there is nothing to report.
type FreshnessDeps struct {
	NewestRecoveryPoint        func(ctx context.Context, createdAfter time.Time) (time.Time, error)
	NewestSuccessfulValidation func(ctx context.Context, createdAfter time.Time) (time.Time, error)
	// Zero when the plan does not exist.
	RestoreTestingPlanCreatedAt   func(ctx context.Context) (time.Time, error)
	DynamoDBAdvancedBackupEnabled func(ctx context.Context) (bool, error)
}

type Freshness struct {
	RecoveryPointAgeHours  *int `json:"recoveryPointAgeHours,omitempty"`
	StaleRecoveryPoint     bool `json:"staleRecoveryPoint"`
	ValidationAgeDays      *int `json:"validationAgeDays,omitempty"`
	ValidationMissing      bool `json:"validationMissing"`
	AdvancedBackupDisabled bool `json:"advancedBackupDisabled"`
}

func ageIn(now, then time.Time, unit time.Duration) *int {
	age := int(now.Sub(then) / unit)
	return &age
}

func CheckBackupFreshness(ctx context.Context, d FreshnessDeps, now time.Time) (Freshness, error) {
	var f Freshness

	newestPoint, err := d.NewestRecoveryPoint(ctx, now.Add(-2*RecoveryPointMaxAge))
	if err != nil {
		return f, err
	}
	f.StaleRecoveryPoint = newestPoint.IsZero() || now.Sub(newestPoint) >= RecoveryPointMaxAge
	if !newestPoint.IsZero() {
		f.RecoveryPointAgeHours = ageIn(now, newestPoint, time.Hour)
	}

	lastSuccess, err := d.NewestSuccessfulValidation(ctx, now.Add(-2*RestoreValidationMaxAge))
	if err != nil {
		return f, err
	}
	planCreatedAt, err := d.RestoreTestingPlanCreatedAt(ctx)
	if err != nil {
		return f, err
	}
	recentSuccess := !lastSuccess.IsZero() && now.Sub(lastSuccess) <= RestoreValidationMaxAge
	// A new plan has not had its first run yet; a deleted plan never will.
	planIsNew := !planCreatedAt.IsZero() && now.Sub(planCreatedAt) <= RestoreValidationMaxAge
	f.ValidationMissing = !recentSuccess && !planIsNew
	if !lastSuccess.IsZero() {
		f.ValidationAgeDays = ageIn(now, lastSuccess, 24*time.Hour)
	}

	enabled, err := d.DynamoDBAdvancedBackupEnabled(ctx)
	if err != nil {
		return f, err
	}
	f.AdvancedBackupDisabled = !enabled
	return f, nil
}
