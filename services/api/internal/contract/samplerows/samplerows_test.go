package samplerows

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

func TestEverySampleHasABuilderOrASkipReason(t *testing.T) {
	for name := range contract.Data.Samples {
		_, built := Builders[name]
		_, skipped := Skipped[name]
		if built == skipped {
			t.Errorf("sample %s: list it in exactly one of Builders and Skipped", name)
		}
	}
	for _, listed := range []map[string]string{Builders, Skipped} {
		for name := range listed {
			if _, ok := contract.Data.Samples[name]; !ok {
				t.Errorf("%s is not a contract sample", name)
			}
		}
	}
}
