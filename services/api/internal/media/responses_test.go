package media

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	apitypestest.Conforms[apitypes.MediaUploadURLResponse](t, uploadURLResponse{
		UploadURL:  "https://bucket.s3.amazonaws.com/media/2026/10/abc.png?X-Amz-Signature=x",
		PublicPath: "/media/2026/10/abc.png",
		Headers:    map[string]string{"Content-Type": "image/png"},
		ExpiresAt:  "2026-10-01T12:15:00.000Z",
	})
}
