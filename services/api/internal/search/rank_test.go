package search

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestRankFields(t *testing.T) {
	for _, tc := range []struct {
		q, title, body string
		tags           []string
		score          int
		snippet        string
		matches        []Range
	}{
		{"ship", "Ship plan", "", nil, 37, "Ship plan", []Range{{0, 4}}},
		{"ship", "Reship", "", nil, 30, "Reship", []Range{{2, 6}}},
		{"ship", "  ", "a ship", nil, 12, "a ship", []Range{{2, 6}}},
		{"ship", "x", "", []string{"shipping", "y"}, 27, "shipping y", []Range{{0, 4}}},
		{"LAUNCH", "\U0001F680 Launch", "", nil, 32, "\U0001F680 Launch", []Range{{3, 9}}},
		{"_id", "my_id", "", nil, 30, "my_id", []Range{{2, 5}}},
	} {
		got, ok := rankFields(tc.q, tc.title, tc.body, tc.tags)
		if !ok {
			t.Errorf("%q in %q: no hit", tc.q, tc.title)
			continue
		}
		if got.score != tc.score || string(mustJSON(t, Text(got.snippet))) != string(mustJSON(t, tc.snippet)) || len(got.matches) != 1 || got.matches[0] != tc.matches[0] {
			t.Errorf("%q in %q: %+v", tc.q, tc.title, got)
		}
	}
	if _, ok := rankFields("zz", "a", "b", []string{"c"}); ok {
		t.Error("hit without a match")
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		t.Fatal(err)
	}
	return bytes.TrimSuffix(buf.Bytes(), []byte("\n"))
}

func TestSnippetCutsInUTF16(t *testing.T) {
	text := "rocket!"
	for range 40 {
		text += "\U0001F600"
	}
	snippet, _, _ := snippetAround(encode(text), "rocket")
	got := string(mustJSON(t, Text(snippet)))
	want := `"rocket!` + repeat("\U0001F600", 29) + `\ud83d…"`
	if got != want {
		t.Errorf("got %s\nwant %s", got, want)
	}
	if got := string(mustJSON(t, Text(encode("a\"b\\c\n\x01<&>")))); got != `"a\"b\\c\n\u0001<&>"` {
		t.Errorf("escaped %s", got)
	}
}

func repeat(s string, n int) string {
	out := ""
	for range n {
		out += s
	}
	return out
}

func TestCollapseTrim(t *testing.T) {
	if got := string(rune16(collapseTrim(encode("\u00a0 a \t\n b\u3000")))); got != "a b" {
		t.Errorf("got %q", got)
	}
}

func rune16(u units) []rune {
	out := make([]rune, len(u))
	for i, c := range u {
		out[i] = rune(c)
	}
	return out
}
