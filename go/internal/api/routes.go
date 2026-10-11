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
		{Method: http.MethodGet, Pattern: "/admin/me", Auth: SiteAdmin, Metric: "AdminMe", Handler: adminMe},
	}
}

type adminMeResponse struct {
	Sub      string `json:"sub"`
	Email    string `json:"email,omitempty"`
	Username string `json:"username,omitempty"`
}

func adminMe(_ context.Context, r *Request) (*Response, error) {
	username, ok := r.Claims["cognito:username"]
	if !ok {
		username = r.Claims["username"]
	}
	return JSON(http.StatusOK, adminMeResponse{Sub: r.UserID(), Email: r.Claims["email"], Username: username}), nil
}

func health(context.Context, *Request) (*Response, error) {
	return JSON(http.StatusOK, apitypes.HealthResponse{
		Status:  "ok",
		Service: apitypes.HealthResponseService(contract.Data.API.ServiceName),
	}), nil
}
