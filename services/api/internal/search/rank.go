// Package search serves Notebook search. Offsets are UTF-16 code units and
// matching follows JavaScript's toLowerCase, so hits match what the clients
// highlight.
package search

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

type units []uint16

func encode(s string) units { return utf16.Encode([]rune(s)) }

// lower is toLowerCase on UTF-16 text that may hold lone surrogates, which
// it keeps.
func lower(u units) units {
	out := make(units, 0, len(u))
	start := 0
	flush := func(end int) {
		if end > start {
			out = append(out, encode(store.JSLower(string(utf16.Decode(u[start:end]))))...)
		}
	}
	for i := 0; i < len(u); i++ {
		c := u[i]
		switch {
		case utf16.IsSurrogate(rune(c)) && c < 0xdc00 && i+1 < len(u) && u[i+1] >= 0xdc00 && u[i+1] < 0xe000:
			i++
		case utf16.IsSurrogate(rune(c)):
			flush(i)
			out = append(out, c)
			start = i + 1
		}
	}
	flush(len(u))
	return out
}

func indexOf(hay, needle units) int {
	for i := 0; i+len(needle) <= len(hay); i++ {
		if hasPrefix(hay[i:], needle) {
			return i
		}
	}
	return -1
}

func hasPrefix(hay, prefix units) bool {
	if len(prefix) > len(hay) {
		return false
	}
	for i, c := range prefix {
		if hay[i] != c {
			return false
		}
	}
	return true
}

// isSpace is JavaScript's \s, all in the BMP.
func isSpace(c uint16) bool {
	switch c {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return c >= 0x2000 && c <= 0x200a
}

// collapseTrim is .replace(/\s+/g, ' ').trim().
func collapseTrim(u units) units {
	out := make(units, 0, len(u))
	for i := 0; i < len(u); i++ {
		if !isSpace(u[i]) {
			out = append(out, u[i])
			continue
		}
		for i+1 < len(u) && isSpace(u[i+1]) {
			i++
		}
		out = append(out, ' ')
	}
	for len(out) > 0 && out[0] == ' ' {
		out = out[1:]
	}
	for len(out) > 0 && out[len(out)-1] == ' ' {
		out = out[:len(out)-1]
	}
	return out
}

// Text is a JSON string from UTF-16 code units, escaping a lone surrogate
// as JSON.stringify does.
type Text units

func (t Text) MarshalJSON() ([]byte, error) {
	var b strings.Builder
	b.WriteByte('"')
	u := units(t)
	for i := 0; i < len(u); i++ {
		c := u[i]
		if utf16.IsSurrogate(rune(c)) {
			if c < 0xdc00 && i+1 < len(u) && u[i+1] >= 0xdc00 && u[i+1] < 0xe000 {
				r := utf16.DecodeRune(rune(c), rune(u[i+1]))
				b.WriteRune(r)
				i++
				continue
			}
			b.WriteString(`\u` + strconv.FormatUint(uint64(c), 16))
			continue
		}
		switch {
		case c == '"' || c == '\\':
			b.WriteByte('\\')
			b.WriteByte(byte(c))
		case c < 0x20:
			b.WriteString(controlEscape(c))
		default:
			b.WriteRune(rune(c))
		}
	}
	b.WriteByte('"')
	return []byte(b.String()), nil
}

func controlEscape(c uint16) string {
	switch c {
	case '\b':
		return `\b`
	case '\f':
		return `\f`
	case '\n':
		return `\n`
	case '\r':
		return `\r`
	case '\t':
		return `\t`
	}
	return fmt.Sprintf(`\u%04x`, c)
}

type Range struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

const snippetRadius = 60

// snippetAround is the text around the first match of q, with the match's
// range in the snippet.
func snippetAround(text units, q string) (units, []Range, bool) {
	needle := encode(q)
	if len(needle) == 0 {
		return nil, nil, false
	}
	lowNeedle := lower(needle)
	idx := indexOf(lower(text), lowNeedle)
	if idx < 0 {
		return nil, nil, false
	}
	start := max(0, idx-snippetRadius)
	end := min(len(text), idx+len(needle)+snippetRadius)
	snippet := units{}
	if start > 0 {
		snippet = append(snippet, '…')
	}
	snippet = append(snippet, collapseTrim(text[start:end])...)
	if end < len(text) {
		snippet = append(snippet, '…')
	}
	matchStart := indexOf(lower(snippet), lowNeedle)
	if matchStart < 0 {
		return snippet, []Range{}, true
	}
	return snippet, []Range{{Start: matchStart, End: matchStart + len(needle)}}, true
}

// leadingSnippet is the start of text, for a hit whose match is elsewhere.
func leadingSnippet(text units) units {
	flat := collapseTrim(text)
	if len(flat) <= 2*snippetRadius {
		return flat
	}
	return append(collapseTrim(flat[:2*snippetRadius:2*snippetRadius]), '…')
}

func isWord(c uint16) bool {
	return c == '_' || c >= '0' && c <= '9' || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z'
}

// canonicalize is a non-unicode /i regex's case folding of one code unit.
func canonicalize(c uint16) uint16 {
	if utf16.IsSurrogate(rune(c)) {
		return c
	}
	u := unicode.ToUpper(rune(c))
	if u > 0xffff || c >= 128 && u < 128 {
		return c
	}
	return uint16(u)
}

// startsWord is new RegExp(`\b${escaped needle}`, 'i').test(text).
func startsWord(text, needle units) bool {
	for p := 0; p+len(needle) <= len(text); p++ {
		before := p > 0 && isWord(text[p-1])
		after := p < len(text) && isWord(text[p])
		if before == after {
			continue
		}
		matched := true
		for i, c := range needle {
			if canonicalize(text[p+i]) != canonicalize(c) {
				matched = false
				break
			}
		}
		if matched {
			return true
		}
	}
	return false
}

type ranked struct {
	score   int
	title   string
	snippet units
	matches []Range
}

// rankFields scores the best of title (×3), tags (×2) and body (×1). A title
// hit's snippet comes from the body, since clients already show the title.
func rankFields(q, title, body string, tags []string) (ranked, bool) {
	needle := lower(encode(q))
	if len(needle) == 0 {
		return ranked{}, false
	}
	var best ranked
	found, titleBest := false, false
	for i, f := range []struct {
		text   string
		weight int
	}{{title, 3}, {strings.Join(tags, " "), 2}, {body, 1}} {
		text := encode(f.text)
		low := lower(text)
		if indexOf(low, needle) < 0 {
			continue
		}
		snippet, matches, ok := snippetAround(text, q)
		if !ok {
			continue
		}
		score := f.weight * 10
		if hasPrefix(low, needle) {
			score += 5
		}
		if startsWord(text, needle) {
			score += 2
		}
		if !found || score > best.score {
			best = ranked{score: score, snippet: snippet, matches: matches}
			found, titleBest = true, i == 0
		}
	}
	if !found {
		return ranked{}, false
	}
	if titleBest {
		text := encode(body)
		if snippet, matches, ok := snippetAround(text, q); ok {
			best.snippet, best.matches = snippet, matches
		} else {
			best.snippet, best.matches = leadingSnippet(text), []Range{}
		}
	}
	if t := api.TrimJS(title); t != "" {
		best.title = t
	} else {
		best.title = "Untitled"
	}
	return best, true
}
