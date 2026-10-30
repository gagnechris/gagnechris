package claude

import (
	"encoding/json"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/v2"
)

func message(t *testing.T, raw string) *anthropic.BetaMessage {
	t.Helper()
	var m anthropic.BetaMessage
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatal(err)
	}
	return &m
}

func TestTextJoinsTextBlocks(t *testing.T) {
	m := message(t, `{"stop_reason":"end_turn","content":[{"type":"thinking","thinking":"","signature":"s"},{"type":"text","text":"## The week\n"},{"type":"text","text":"Calm."}]}`)
	got, err := Text(m)
	if err != nil || got != "## The week\nCalm." {
		t.Errorf("Text = %q, %v", got, err)
	}
}

func TestTextRejectsAnUnfinishedReply(t *testing.T) {
	for _, raw := range []string{
		`{"stop_reason":"refusal","content":[]}`,
		`{"stop_reason":"max_tokens","content":[{"type":"text","text":"## The we"}]}`,
		`{"stop_reason":"end_turn","content":[{"type":"text","text":"  "}]}`,
	} {
		if _, err := Text(message(t, raw)); err == nil {
			t.Errorf("Text(%s) has no error", raw)
		}
	}
}
