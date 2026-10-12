package home

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	h, err := parse(samplerows.Item("home"))
	if err != nil {
		t.Fatal(err)
	}
	apitypestest.Conforms[apitypes.Home](t, h)
}
