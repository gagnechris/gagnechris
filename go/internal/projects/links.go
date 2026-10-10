package projects

import (
	"regexp"
	"slices"
	"strings"
	"unicode/utf16"

	"github.com/gagnechris/gagnechris/go/internal/contract"
)

var (
	schemePattern = regexp.MustCompile(`(?i)^([a-z][a-z0-9+.-]*):`)
	authority     = regexp.MustCompile(`^//([^/?#]+)`)
	// JavaScript's \s with the C0 controls, DEL and backslash.
	unsafeChars = regexp.MustCompile(`[\x00-\x20\x7f\\\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]`)
)

// safeHref is isSafeLinkHref: a site path (never //host) or a URL with one
// of schemes, with a host and no userinfo for http(s).
func safeHref(schemes []string) func(string) bool {
	return func(value string) bool {
		if value == "" || len(utf16.Encode([]rune(value))) > contract.Data.Limits.LinkHrefMaxLength {
			return false
		}
		if unsafeChars.MatchString(value) {
			return false
		}
		if strings.HasPrefix(value, "/") {
			return !strings.HasPrefix(value, "//")
		}
		m := schemePattern.FindStringSubmatch(value)
		if m == nil {
			return false
		}
		scheme := strings.ToLower(m[1])
		if !slices.Contains(schemes, scheme) {
			return false
		}
		rest := value[len(m[0]):]
		if scheme == "http" || scheme == "https" {
			host := authority.FindStringSubmatch(rest)
			return host != nil && !strings.Contains(host[1], "@")
		}
		return rest != ""
	}
}
