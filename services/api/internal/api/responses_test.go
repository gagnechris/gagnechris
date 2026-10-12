package api

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	apitypestest.Conforms[apitypes.AdminMeResponse](t, adminMeResponse{Sub: "user-sub-1", Email: "a@example.com", Username: "ada"})
	apitypestest.Conforms[apitypes.AdminMeResponse](t, adminMeResponse{Sub: "user-sub-1"})
}
