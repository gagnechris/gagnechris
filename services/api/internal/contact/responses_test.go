package contact

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	apitypestest.Conforms[apitypes.ContactResponse](t, okBody)
	apitypestest.Conforms[apitypes.ResumeDownloadNotifyResponse](t, okBody)
}
