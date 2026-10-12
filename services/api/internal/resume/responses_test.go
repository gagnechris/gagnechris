package resume

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	for _, name := range []string{"resume", "resumeLegacy"} {
		r, err := parse(samplerows.Item(name))
		if err != nil {
			t.Fatal(err)
		}
		apitypestest.Conforms[apitypes.Resume](t, r)
	}
}
