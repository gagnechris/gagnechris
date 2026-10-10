package api

import (
	"context"
	"net/http"

	"github.com/gagnechris/gagnechris/go/internal/apitypes"
	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

// Routes are the routes the Go API serves.
func Routes(_ *data.Table) []Route {
	return []Route{
		{Method: http.MethodGet, Pattern: "/health", Auth: Public, Metric: "HealthCheck", Handler: health},
	}
}

func health(context.Context, *Request) (*Response, error) {
	return JSON(http.StatusOK, apitypes.HealthResponse{
		Status:  "ok",
		Service: apitypes.HealthResponseService(contract.Data.API.ServiceName),
	}), nil
}
