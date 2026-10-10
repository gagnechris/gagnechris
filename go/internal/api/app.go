// Package api is the HTTP API: routing, auth, errors and responses shaped
// like the Node API's, so the two can serve the same contract.
package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gagnechris/gagnechris/go/internal/observability"
)

// App serves one request at a time the way the Node Lambda handler does:
// one "request" log, routing, gzip, and a single metrics flush.
type App struct {
	router  *Router
	log     *slog.Logger
	metrics *observability.Metrics
	// bundleReadyMs is process start to App ready, logged on the first
	// request; Lambda's Init Duration minus it is runtime bootstrap.
	bundleReadyMs int64
	served        atomic.Bool
}

func NewApp(router *Router, log *slog.Logger, metrics *observability.Metrics, processStart time.Time) *App {
	return &App{
		router:        router,
		log:           log,
		metrics:       metrics,
		bundleReadyMs: time.Since(processStart).Milliseconds(),
	}
}

func (a *App) Router() *Router { return a.router }

// Serve fills req.Log and req.Metrics and never returns nil.
func (a *App) Serve(ctx context.Context, req *Request, rawPath string, log *slog.Logger) (res *Response) {
	if log == nil {
		log = a.log
	}
	req.Method = strings.ToUpper(req.Method)
	path := normalizePath(rawPath)
	log = log.With("route", req.Method+" "+path, "requestId", req.RequestID)
	req.Log, req.Metrics = log, a.metrics
	defer func() {
		if err := a.metrics.Flush(); err != nil {
			log.Warn("metrics flush failed", "errMessage", err.Error())
		}
	}()
	defer func() {
		if p := recover(); p != nil {
			res = a.internalError(log, fmt.Errorf("panic: %v", p), string(debug.Stack()))
		}
	}()

	if a.served.CompareAndSwap(false, true) {
		log.Info("request", "path", path, "bundleReadyMs", a.bundleReadyMs)
	} else {
		log.Info("request", "path", path)
	}

	res, err := a.router.dispatch(ctx, req, rawPath)
	if err != nil {
		return a.internalError(log, err, "")
	}
	return gzipJSON(req.Headers["accept-encoding"], res)
}

func (a *App) internalError(log *slog.Logger, err error, stack string) *Response {
	attrs := []any{"errMessage", err.Error()}
	if stack != "" {
		attrs = append(attrs, "stack", stack)
	}
	log.Error("handler error", attrs...)
	a.metrics.Add("HandlerError", observability.Count, 1)
	return withAPIHeaders(JSON(http.StatusInternalServerError, map[string]any{"error": "internal_error"}), true)
}
