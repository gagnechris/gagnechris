// Package observability writes logs and metrics in the shapes the TypeScript
// Lambdas produce with Powertools, so Logs Insights queries and CloudWatch
// alarms work the same whichever language a function is written in.
package observability

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
)

const (
	serviceEnv   = "POWERTOOLS_SERVICE_NAME"
	namespaceEnv = "POWERTOOLS_METRICS_NAMESPACE"
	traceEnv     = "_X_AMZN_TRACE_ID"
	levelEnv     = "POWERTOOLS_LOG_LEVEL"
)

// NewLogger returns a JSON logger whose records carry Powertools' keys:
// level, message, timestamp, service, sampling_rate and xray_trace_id, at
// the level POWERTOOLS_LOG_LEVEL names (INFO by default).
func NewLogger(w io.Writer, service string) *slog.Logger {
	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{
		Level:       levelFromEnv(),
		ReplaceAttr: powertoolsKeys,
	})
	return slog.New(&traceHandler{Handler: handler}).With(
		slog.String("service", service),
		slog.Int("sampling_rate", 0),
	)
}

// LoggerFromEnv is NewLogger on stdout for the service the function's
// environment names.
func LoggerFromEnv() *slog.Logger {
	return NewLogger(os.Stdout, os.Getenv(serviceEnv))
}

func powertoolsKeys(groups []string, a slog.Attr) slog.Attr {
	if len(groups) > 0 {
		return a
	}
	switch a.Key {
	case slog.MessageKey:
		a.Key = "message"
	case slog.TimeKey:
		a.Key = "timestamp"
		a.Value = slog.StringValue(a.Value.Time().UTC().Format("2006-01-02T15:04:05.000Z"))
	case slog.LevelKey:
		a.Value = slog.StringValue(levelName(a.Value.Any().(slog.Level)))
	}
	if err, ok := a.Value.Any().(error); ok {
		a.Value = slog.GroupValue(
			slog.String("name", errorName(err)),
			slog.String("message", err.Error()),
		)
	}
	return a
}

func levelFromEnv() slog.Level {
	switch strings.ToUpper(strings.TrimSpace(os.Getenv(levelEnv))) {
	case "DEBUG", "TRACE":
		return slog.LevelDebug
	case "WARN":
		return slog.LevelWarn
	case "ERROR", "CRITICAL", "SILENT":
		return slog.LevelError
	}
	return slog.LevelInfo
}

func levelName(l slog.Level) string {
	if l >= slog.LevelError {
		return "ERROR"
	}
	if l >= slog.LevelWarn {
		return "WARN"
	}
	if l >= slog.LevelInfo {
		return "INFO"
	}
	return "DEBUG"
}

func errorName(err error) string {
	name := strings.TrimPrefix(fmt.Sprintf("%T", err), "*")
	if i := strings.LastIndex(name, "."); i >= 0 {
		name = name[i+1:]
	}
	return name
}

// traceHandler adds the invocation's X-Ray trace id, which the Lambda Go
// runtime sets in the environment per invocation rather than once at start.
type traceHandler struct {
	slog.Handler
}

func (h *traceHandler) Handle(ctx context.Context, r slog.Record) error {
	if trace := os.Getenv(traceEnv); trace != "" {
		r.AddAttrs(slog.String("xray_trace_id", traceRoot(trace)))
	}
	return h.Handler.Handle(ctx, r)
}

func (h *traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &traceHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h *traceHandler) WithGroup(name string) slog.Handler {
	return &traceHandler{Handler: h.Handler.WithGroup(name)}
}

// traceRoot extracts "1-abc-def" from "Root=1-abc-def;Parent=...;Sampled=1".
func traceRoot(header string) string {
	for part := range strings.SplitSeq(header, ";") {
		if root, ok := strings.CutPrefix(part, "Root="); ok {
			return root
		}
	}
	return header
}
