package noteimages

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	apitypestest.Conforms[apitypes.NotebookImageUploadURLResponse](t, uploadURLResponse{
		UploadURL: "https://bucket.s3.amazonaws.com/images/u1/0123456789abcdef.png?X-Amz-Signature=x",
		Src:       "notebook-image:0123456789abcdef.png",
		Headers:   map[string]string{"Content-Type": "image/png"},
		ExpiresAt: "2026-10-01T12:15:00.000Z",
	})
	apitypestest.Conforms[apitypes.NotebookImageURLResponse](t, imageURLResponse{
		URL:       "https://bucket.s3.amazonaws.com/images/u1/0123456789abcdef.png?X-Amz-Signature=x",
		ExpiresAt: "2026-10-01T13:00:00.000Z",
	})
}

func TestNewNameMatchesThePattern(t *testing.T) {
	for contentType, ext := range extByType {
		name := newName(contentType)
		if m := namePattern.FindStringSubmatch(name); m == nil || m[1] != ext {
			t.Errorf("%s: %q", contentType, name)
		}
	}
}
