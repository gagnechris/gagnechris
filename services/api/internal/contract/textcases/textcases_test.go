package textcases

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

func TestEveryTextHelperHasAnOwner(t *testing.T) {
	for name := range contract.Data.TextCases {
		if _, ok := Owners[name]; !ok {
			t.Errorf("text helper %s: give it an owner in Owners", name)
		}
	}
	for name := range Owners {
		if _, ok := contract.Data.TextCases[name]; !ok {
			t.Errorf("%s is not a contract text helper", name)
		}
	}
}
