package observability

import (
	"bytes"
	"encoding/json"
	"io/fs"
	"testing"
	"time"
)

func decode(t *testing.T, line []byte) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(line, &out); err != nil {
		t.Fatalf("not JSON: %q: %v", line, err)
	}
	return out
}

func TestLoggerWritesPowertoolsKeys(t *testing.T) {
	t.Setenv(traceEnv, "Root=1-abc-def;Parent=123;Sampled=1")
	var buf bytes.Buffer

	NewLogger(&buf, "gagnechris-test").Warn("Backup freshness", "staleRecoveryPoint", true)

	got := decode(t, buf.Bytes())
	want := map[string]any{
		"level":              "WARN",
		"message":            "Backup freshness",
		"service":            "gagnechris-test",
		"sampling_rate":      float64(0),
		"xray_trace_id":      "1-abc-def",
		"staleRecoveryPoint": true,
	}
	for key, value := range want {
		if got[key] != value {
			t.Errorf("%s = %#v, want %#v", key, got[key], value)
		}
	}
	ts, _ := got["timestamp"].(string)
	if _, err := time.Parse("2006-01-02T15:04:05.000Z", ts); err != nil {
		t.Errorf("timestamp %q is not ISO 8601 UTC with milliseconds", ts)
	}
	for _, slogKey := range []string{"msg", "time"} {
		if _, ok := got[slogKey]; ok {
			t.Errorf("unexpected slog key %q", slogKey)
		}
	}
}

func TestLoggerOmitsTraceOutsideAnInvocation(t *testing.T) {
	t.Setenv(traceEnv, "")
	var buf bytes.Buffer

	NewLogger(&buf, "svc").Info("hello")

	if _, ok := decode(t, buf.Bytes())["xray_trace_id"]; ok {
		t.Error("xray_trace_id set without a trace header")
	}
}

func TestLoggerWritesErrorsAsNameAndMessage(t *testing.T) {
	var buf bytes.Buffer

	NewLogger(&buf, "svc").Error("Restore validation threw", "error", &fs.PathError{Op: "open", Path: "x", Err: fs.ErrNotExist})

	got, _ := decode(t, buf.Bytes())["error"].(map[string]any)
	if got["name"] != "PathError" || got["message"] != "open x: file does not exist" {
		t.Errorf("error = %#v", got)
	}
	if level := decode(t, buf.Bytes())["level"]; level != "ERROR" {
		t.Errorf("level = %v", level)
	}
}

func TestMetricsFlushWritesOneEMFLine(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetrics(&buf, "gagnechris", "gagnechris-test")
	m.now = func() time.Time { return time.UnixMilli(1_700_000_000_000) }

	m.Add("LeftoverTables", Count, 2)
	m.Add("BackupCheckCompleted", Count, 1)
	m.Add("LeftoverTables", Count, 0)
	if err := m.Flush(); err != nil {
		t.Fatal(err)
	}

	var got struct {
		AWS struct {
			Timestamp         int64
			CloudWatchMetrics []struct {
				Namespace  string
				Dimensions [][]string
				Metrics    []struct{ Name, Unit string }
			}
		} `json:"_aws"`
		Service              string    `json:"service"`
		LeftoverTables       []float64 `json:"LeftoverTables"`
		BackupCheckCompleted float64   `json:"BackupCheckCompleted"`
	}
	if err := json.Unmarshal(buf.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.AWS.Timestamp != 1_700_000_000_000 {
		t.Errorf("Timestamp = %d", got.AWS.Timestamp)
	}
	cw := got.AWS.CloudWatchMetrics
	if len(cw) != 1 || cw[0].Namespace != "gagnechris" || len(cw[0].Dimensions) != 1 ||
		len(cw[0].Dimensions[0]) != 1 || cw[0].Dimensions[0][0] != "service" {
		t.Fatalf("CloudWatchMetrics = %+v", cw)
	}
	if len(cw[0].Metrics) != 2 || cw[0].Metrics[0].Name != "LeftoverTables" ||
		cw[0].Metrics[0].Unit != "Count" || cw[0].Metrics[1].Name != "BackupCheckCompleted" {
		t.Errorf("Metrics = %+v", cw[0].Metrics)
	}
	if got.Service != "gagnechris-test" {
		t.Errorf("service = %q", got.Service)
	}
	if len(got.LeftoverTables) != 2 || got.LeftoverTables[0] != 2 || got.LeftoverTables[1] != 0 {
		t.Errorf("LeftoverTables = %v", got.LeftoverTables)
	}
	if got.BackupCheckCompleted != 1 {
		t.Errorf("BackupCheckCompleted = %v", got.BackupCheckCompleted)
	}
}

func TestMetricsFlushClearsAndSkipsEmpty(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetrics(&buf, "ns", "svc")

	if err := m.Flush(); err != nil || buf.Len() != 0 {
		t.Fatalf("empty flush wrote %q, err %v", buf.String(), err)
	}
	m.Add("A", Count, 1)
	_ = m.Flush()
	buf.Reset()
	if err := m.Flush(); err != nil || buf.Len() != 0 {
		t.Fatalf("second flush wrote %q, err %v", buf.String(), err)
	}
}

func TestLoggerHonorsPowertoolsLogLevel(t *testing.T) {
	t.Setenv(levelEnv, "error")
	var buf bytes.Buffer
	log := NewLogger(&buf, "svc")

	log.Warn("dropped")
	log.Error("kept")

	if got := decode(t, buf.Bytes())["message"]; got != "kept" {
		t.Errorf("message = %v, want only the ERROR record", got)
	}
}
