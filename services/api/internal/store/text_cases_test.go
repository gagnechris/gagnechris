package store

import (
	"encoding/json"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/textcases"
)

func TestTextHelpersMatchTypeScript(t *testing.T) {
	textcases.Replay(t, "store", map[string]func(json.RawMessage) any{
		"slugify": func(in json.RawMessage) any { return Slugify(textcases.Decode[string](t, in)) },
	})
}
