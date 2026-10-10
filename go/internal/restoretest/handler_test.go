package restoretest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/aws/smithy-go"

	"github.com/gagnechris/gagnechris/go/internal/observability"
)

const (
	tableArnOfTest = "arn:aws:dynamodb:us-east-1:111111111111:table/awsbackup-restore-test-abc"
	planArn        = "arn:aws:backup:us-east-1:111111111111:restore-testing-plan:gagnechris_prod_app_table_weekly-1"
)

var (
	jobRestorePoint = time.Date(2026, 10, 3, 7, 0, 0, 0, time.UTC)
	dailyNow        = time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
)

func hoursAgo(h float64) time.Time {
	return dailyNow.Add(-time.Duration(h * float64(time.Hour)))
}

func healthyFreshness() FreshnessDeps {
	return FreshnessDeps{
		NewestRecoveryPoint:           func(context.Context, time.Time) (time.Time, error) { return hoursAgo(5), nil },
		NewestSuccessfulValidation:    func(context.Context, time.Time) (time.Time, error) { return hoursAgo(3 * 24), nil },
		RestoreTestingPlanCreatedAt:   func(context.Context) (time.Time, error) { return hoursAgo(30 * 24), nil },
		DynamoDBAdvancedBackupEnabled: func(context.Context) (bool, error) { return true, nil },
	}
}

type harness struct {
	deps    Deps
	puts    []PutValidationInput
	metrics bytes.Buffer
}

func newHarness() *harness {
	h := &harness{}
	h.deps = Deps{
		Scan:                  pagedScan(healthyItems(), 3).scan,
		Count:                 (&fakeCount{items: healthyItems()}).count,
		SourceTableName:       "gagnechris-prod",
		RestoreTestingPlanArn: planArn,
		DescribeRestoreJob: func(context.Context, string) (RestoreJobInfo, error) {
			return RestoreJobInfo{RestoreTestingPlanArn: planArn, RecoveryPointCreationDate: jobRestorePoint}, nil
		},
		PutValidation: func(_ context.Context, in PutValidationInput) error {
			h.puts = append(h.puts, in)
			return nil
		},
		Leftovers: LeftoverDeps{
			ListTables:       func(context.Context, string) (ListTablesPage, error) { return ListTablesPage{}, nil },
			DescribeCreation: func(context.Context, string) (time.Time, error) { return time.Time{}, nil },
		},
		Freshness: healthyFreshness(),
		Now:       func() time.Time { return time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC) },
	}
	return h
}

func (h *harness) run(t *testing.T, event string) (*Outcome, error) {
	t.Helper()
	handler, err := NewHandler(h.deps, observability.NewLogger(io.Discard, "test"),
		observability.NewMetrics(&h.metrics, "gagnechris", "test"))
	if err != nil {
		t.Fatal(err)
	}
	return handler.Handle(context.Background(), json.RawMessage(event))
}

// metric returns the value of the last EMF line that carries name.
func (h *harness) metric(t *testing.T, name string) (float64, bool) {
	t.Helper()
	var value float64
	found := false
	for line := range strings.SplitSeq(strings.TrimSpace(h.metrics.String()), "\n") {
		if line == "" {
			continue
		}
		var doc map[string]any
		if err := json.Unmarshal([]byte(line), &doc); err != nil {
			t.Fatal(err)
		}
		if v, ok := doc[name].(float64); ok {
			value, found = v, true
		}
	}
	return value, found
}

func completed(detail map[string]any) string {
	d := map[string]any{
		"restoreJobId":       "job-1",
		"status":             "COMPLETED",
		"resourceType":       "DynamoDB",
		"createdResourceArn": tableArnOfTest,
	}
	for k, v := range detail {
		if v == nil {
			delete(d, k)
		} else {
			d[k] = v
		}
	}
	b, _ := json.Marshal(map[string]any{
		"source":      "aws.backup",
		"detail-type": "Restore Job State Change",
		"detail":      d,
	})
	return string(b)
}

func (h *harness) onlyPut(t *testing.T) PutValidationInput {
	t.Helper()
	if len(h.puts) != 1 {
		t.Fatalf("PutRestoreValidationResult called %d times", len(h.puts))
	}
	return h.puts[0]
}

func TestReportsSuccessfulForAHealthyRestore(t *testing.T) {
	h := newHarness()
	out, err := h.run(t, completed(nil))
	if err != nil {
		t.Fatal(err)
	}
	if out.Kind != "validation" || out.TableName != "awsbackup-restore-test-abc" {
		t.Errorf("outcome = %+v", out)
	}
	put := h.onlyPut(t)
	if put.RestoreJobID != "job-1" || put.Status != Successful || !strings.Contains(put.Message, "counts at floor") {
		t.Errorf("put = %+v", put)
	}
	if v, ok := h.metric(t, "RestoreValidationSucceeded"); !ok || v != 1 {
		t.Errorf("RestoreValidationSucceeded = %v, %v", v, ok)
	}
}

func TestReportsFailedAndEmitsTheAlarmMetricOnBadContent(t *testing.T) {
	h := newHarness()
	h.deps.Scan = pagedScan(nil, 3).scan
	if _, err := h.run(t, completed(nil)); err != nil {
		t.Fatal(err)
	}
	if put := h.onlyPut(t); put.Status != Failed {
		t.Errorf("put = %+v", put)
	}
	if v, ok := h.metric(t, "RestoreValidationFailed"); !ok || v != 1 {
		t.Errorf("RestoreValidationFailed = %v, %v", v, ok)
	}
}

func TestReportsFailedBelowTheSourceFloor(t *testing.T) {
	h := newHarness()
	source := append(healthyItems(), notePagesAt("2026-10-02T00:00:00.000Z", 2)...)
	h.deps.Count = (&fakeCount{items: source}).count
	if _, err := h.run(t, completed(nil)); err != nil {
		t.Fatal(err)
	}
	if put := h.onlyPut(t); put.Status != Failed || !strings.Contains(put.Message, "note count 1 below floor 3") {
		t.Errorf("put = %+v", put)
	}
}

func TestReportsFailedWhenTheRestorePointDateIsUnknown(t *testing.T) {
	h := newHarness()
	h.deps.DescribeRestoreJob = func(context.Context, string) (RestoreJobInfo, error) {
		return RestoreJobInfo{RestoreTestingPlanArn: planArn}, nil
	}
	if _, err := h.run(t, completed(nil)); err != nil {
		t.Fatal(err)
	}
	if put := h.onlyPut(t); put.Status != Failed || !strings.Contains(put.Message, "count floor not checked") {
		t.Errorf("put = %+v", put)
	}
}

func TestReportsFailedWhenTheScanFailsInsteadOfRetrying(t *testing.T) {
	h := newHarness()
	h.deps.Scan = func(context.Context, ScanInput) (ScanPage, error) {
		return ScanPage{}, &smithy.GenericAPIError{Code: "AccessDeniedException", Message: "nope"}
	}
	if _, err := h.run(t, completed(nil)); err != nil {
		t.Fatal(err)
	}
	if put := h.onlyPut(t); put.Status != Failed || !strings.Contains(put.Message, "AccessDeniedException") {
		t.Errorf("put = %+v", put)
	}
}

func TestReportsFailedWhenTheEventNamesNoTable(t *testing.T) {
	h := newHarness()
	if _, err := h.run(t, completed(map[string]any{"createdResourceArn": nil})); err != nil {
		t.Fatal(err)
	}
	if put := h.onlyPut(t); put.Status != Failed {
		t.Errorf("put = %+v", put)
	}
}

func TestValidatesAJobOfOurPlanLookedUpByTheEventsJobID(t *testing.T) {
	h := newHarness()
	var described []string
	h.deps.DescribeRestoreJob = func(_ context.Context, id string) (RestoreJobInfo, error) {
		described = append(described, id)
		return RestoreJobInfo{RestoreTestingPlanArn: planArn, RecoveryPointCreationDate: jobRestorePoint}, nil
	}
	out, err := h.run(t, completed(map[string]any{"restoreJobId": "job-ours"}))
	if err != nil {
		t.Fatal(err)
	}
	if len(described) != 1 || described[0] != "job-ours" || out.RestoreJobID != "job-ours" {
		t.Errorf("described %v, outcome %+v", described, out)
	}
	if put := h.onlyPut(t); put.RestoreJobID != "job-ours" || put.Status != Successful {
		t.Errorf("put = %+v", put)
	}
}

func TestIgnoresJobsOutsideOurRestoreTestingPlan(t *testing.T) {
	for _, otherPlan := range []string{planArn + "-other", ""} {
		h := newHarness()
		scanned := false
		h.deps.Scan = func(context.Context, ScanInput) (ScanPage, error) {
			scanned = true
			return ScanPage{}, nil
		}
		h.deps.DescribeRestoreJob = func(context.Context, string) (RestoreJobInfo, error) {
			return RestoreJobInfo{RestoreTestingPlanArn: otherPlan, RecoveryPointCreationDate: jobRestorePoint}, nil
		}
		out, err := h.run(t, completed(map[string]any{"restoreJobId": "job-other"}))
		if err != nil {
			t.Fatal(err)
		}
		if out.Kind != "ignored" || out.RestoreJobID != "job-other" {
			t.Errorf("plan %q: outcome = %+v", otherPlan, out)
		}
		if len(h.puts) != 0 || scanned || h.metrics.Len() != 0 {
			t.Errorf("plan %q: puts %d, scanned %v, metrics %q", otherPlan, len(h.puts), scanned, h.metrics.String())
		}
	}
}

func TestDescribeRestoreJobFailureSurfacesWithoutReporting(t *testing.T) {
	h := newHarness()
	h.deps.DescribeRestoreJob = func(context.Context, string) (RestoreJobInfo, error) {
		return RestoreJobInfo{}, errors.New("throttled")
	}
	if _, err := h.run(t, completed(nil)); err == nil || err.Error() != "throttled" {
		t.Errorf("err = %v", err)
	}
	if len(h.puts) != 0 {
		t.Error("reported a validation")
	}
}

func TestIgnoresNonCompletedRestoreEvents(t *testing.T) {
	h := newHarness()
	out, err := h.run(t, completed(map[string]any{"status": "RUNNING"}))
	if err != nil || out != nil || len(h.puts) != 0 {
		t.Errorf("out %+v, err %v, puts %d", out, err, len(h.puts))
	}
}

func TestPutRestoreValidationResultFailureSurfaces(t *testing.T) {
	h := newHarness()
	h.deps.PutValidation = func(context.Context, PutValidationInput) error { return errors.New("throttled") }
	if _, err := h.run(t, completed(nil)); err == nil || err.Error() != "throttled" {
		t.Errorf("err = %v", err)
	}
}

func TestCountsLeftoverTablesOnTheDailySchedule(t *testing.T) {
	h := newHarness()
	h.deps.Leftovers = LeftoverDeps{
		ListTables: func(context.Context, string) (ListTablesPage, error) {
			return ListTablesPage{TableNames: []string{"gagnechris-prod", "gagnechris-prod-restore-x"}}, nil
		},
		DescribeCreation: func(context.Context, string) (time.Time, error) {
			return time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), nil
		},
	}
	out, err := h.run(t, `{"detail-type":"Scheduled Event"}`)
	if err != nil {
		t.Fatal(err)
	}
	if out.Kind != "leftoverCheck" || len(out.Leftovers) != 1 ||
		out.Leftovers[0] != (LeftoverTable{TableName: "gagnechris-prod-restore-x", AgeHours: 60}) {
		t.Errorf("outcome = %+v", out)
	}
	if v, ok := h.metric(t, "LeftoverRestoreTables"); !ok || v != 1 {
		t.Errorf("LeftoverRestoreTables = %v, %v", v, ok)
	}
}

func runDaily(t *testing.T, change func(*FreshnessDeps)) (*harness, *Outcome) {
	t.Helper()
	h := newHarness()
	h.deps.Now = func() time.Time { return dailyNow }
	change(&h.deps.Freshness)
	out, err := h.run(t, `{"action":"leftoverCheck"}`)
	if err != nil {
		t.Fatal(err)
	}
	return h, out
}

func fixedTime(at time.Time) func(context.Context, time.Time) (time.Time, error) {
	return func(context.Context, time.Time) (time.Time, error) { return at, nil }
}

func TestDailyEmitsAllClearFlagsAndTheHeartbeat(t *testing.T) {
	h, out := runDaily(t, func(*FreshnessDeps) {})
	f := out.Freshness
	if *f.RecoveryPointAgeHours != 5 || f.StaleRecoveryPoint || *f.ValidationAgeDays != 3 ||
		f.ValidationMissing || f.AdvancedBackupDisabled {
		t.Errorf("freshness = %+v", f)
	}
	for name, want := range map[string]float64{
		"StaleRecoveryPoint":             0,
		"RestoreValidationMissing":       0,
		"AdvancedDynamoDbBackupDisabled": 0,
		"BackupCheckCompleted":           1,
	} {
		if v, ok := h.metric(t, name); !ok || v != want {
			t.Errorf("%s = %v (%v), want %v", name, v, ok, want)
		}
	}
}

func TestDailyFlagsARecoveryPoint26HoursOldOrMissing(t *testing.T) {
	for _, c := range []struct {
		newest time.Time
		want   float64
	}{
		{hoursAgo(26), 1},
		{time.Time{}, 1},
		{hoursAgo(25), 0},
	} {
		h, _ := runDaily(t, func(f *FreshnessDeps) { f.NewestRecoveryPoint = fixedTime(c.newest) })
		if v, _ := h.metric(t, "StaleRecoveryPoint"); v != c.want {
			t.Errorf("newest %v: StaleRecoveryPoint = %v", c.newest, v)
		}
	}
}

func TestDailyFlagsNoSuccessfulValidationIn8Days(t *testing.T) {
	h, _ := runDaily(t, func(f *FreshnessDeps) { f.NewestSuccessfulValidation = fixedTime(hoursAgo(8*24 + 1)) })
	if v, _ := h.metric(t, "RestoreValidationMissing"); v != 1 {
		t.Errorf("RestoreValidationMissing = %v", v)
	}
}

func TestDailyFlagsADeletedRestoreTestingPlan(t *testing.T) {
	h, _ := runDaily(t, func(f *FreshnessDeps) {
		f.NewestSuccessfulValidation = fixedTime(time.Time{})
		f.RestoreTestingPlanCreatedAt = func(context.Context) (time.Time, error) { return time.Time{}, nil }
	})
	if v, _ := h.metric(t, "RestoreValidationMissing"); v != 1 {
		t.Errorf("RestoreValidationMissing = %v", v)
	}
}

func TestDailyGivesANewPlan8DaysForItsFirstValidation(t *testing.T) {
	h, _ := runDaily(t, func(f *FreshnessDeps) {
		f.NewestSuccessfulValidation = fixedTime(time.Time{})
		f.RestoreTestingPlanCreatedAt = func(context.Context) (time.Time, error) { return hoursAgo(2 * 24), nil }
	})
	if v, _ := h.metric(t, "RestoreValidationMissing"); v != 0 {
		t.Errorf("RestoreValidationMissing = %v", v)
	}
}

func TestDailyFlagsAdvancedBackupTurnedOff(t *testing.T) {
	h, _ := runDaily(t, func(f *FreshnessDeps) {
		f.DynamoDBAdvancedBackupEnabled = func(context.Context) (bool, error) { return false, nil }
	})
	if v, _ := h.metric(t, "AdvancedDynamoDbBackupDisabled"); v != 1 {
		t.Errorf("AdvancedDynamoDbBackupDisabled = %v", v)
	}
}

func TestDailySkipsTheHeartbeatWhenABackupCallFails(t *testing.T) {
	h := newHarness()
	h.deps.Freshness.NewestRecoveryPoint = func(context.Context, time.Time) (time.Time, error) {
		return time.Time{}, errors.New("AccessDenied")
	}
	if _, err := h.run(t, `{"action":"leftoverCheck"}`); err == nil || err.Error() != "AccessDenied" {
		t.Errorf("err = %v", err)
	}
	if v, ok := h.metric(t, "LeftoverRestoreTables"); !ok || v != 0 {
		t.Errorf("LeftoverRestoreTables = %v, %v", v, ok)
	}
	if _, ok := h.metric(t, "BackupCheckCompleted"); ok {
		t.Error("heartbeat emitted after a failed check")
	}
}

func TestRejectsUnknownEvents(t *testing.T) {
	if _, err := newHarness().run(t, `{"action":"nope"}`); !errors.Is(err, errUnsupported) {
		t.Errorf("err = %v", err)
	}
}
