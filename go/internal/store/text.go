package store

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/contract"
)

var MaxSlugLength = contract.Data.Limits.MaxSlugLength

var (
	nonSlugRun     = regexp.MustCompile(`[^a-z0-9]+`)
	edgeHyphens    = regexp.MustCompile(`^-+|-+$`)
	trailingHyphen = regexp.MustCompile(`-+$`)
)

// Slugify is packages/data's slugify, falling back to "untitled".
func Slugify(input string) string {
	decomposed := strings.Map(func(r rune) rune {
		if r >= 0x300 && r <= 0x36f {
			return -1
		}
		return r
	}, norm.NFKD.String(input))
	slug := edgeHyphens.ReplaceAllString(nonSlugRun.ReplaceAllString(api.TrimJS(JSLower(decomposed)), "-"), "")
	if len(slug) > MaxSlugLength {
		slug = slug[:MaxSlugLength]
	}
	if slug = trailingHyphen.ReplaceAllString(slug, ""); slug == "" {
		return "untitled"
	}
	return slug
}

// JSLower is String.toLowerCase, which unlike strings.ToLower applies the
// unconditional and final-sigma special casings.
func JSLower(s string) string {
	if !strings.ContainsAny(s, "\u0130\u03a3") {
		return strings.ToLower(s)
	}
	var b strings.Builder
	for i, r := range s {
		switch r {
		case '\u0130':
			b.WriteString("i\u0307")
		case '\u03a3':
			if finalSigma(s, i) {
				b.WriteRune('\u03c2')
			} else {
				b.WriteRune('\u03c3')
			}
		default:
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

// finalSigma is Unicode's Final_Sigma condition, with letters standing in
// for cased characters.
func finalSigma(s string, i int) bool {
	before, after := s[:i], s[i+len("\u03a3"):]
	prev, _ := utf8.DecodeLastRuneInString(before)
	next, _ := utf8.DecodeRuneInString(after)
	return before != "" && unicode.IsLetter(prev) && (after == "" || !unicode.IsLetter(next))
}
