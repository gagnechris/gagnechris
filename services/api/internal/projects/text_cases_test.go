package projects

import (
	"encoding/json"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/contract/textcases"
)

func TestTextHelpersMatchTypeScript(t *testing.T) {
	post := safeHref(limits.PostLinkSchemes)
	project := safeHref(limits.ProjectHrefSchemes)
	textcases.Replay(t, "projects", map[string]func(json.RawMessage) any{
		"isSafeLinkHrefPost":    func(in json.RawMessage) any { return post(textcases.Decode[string](t, in)) },
		"isSafeLinkHrefProject": func(in json.RawMessage) any { return project(textcases.Decode[string](t, in)) },
	})
}
