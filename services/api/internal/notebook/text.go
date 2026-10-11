// Package notebook reads Notebook notes and tasks, with the text helpers
// packages/shared gives every client: fenced code blocks, task embed lines,
// calendar days and markdown as plain text.
package notebook

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

var fence = regexp.MustCompile("^[ \t]{0,3}(`{3,}|~{3,})")

// FenceBlock is a fenced code block by zero-based line; Close is -1 when it
// runs to the end.
type FenceBlock struct{ Open, Close int }

// ScanFences: a closer uses the opener's character, at least as long.
func ScanFences(lines []string) []FenceBlock {
	var blocks []FenceBlock
	open, marker := -1, ""
	for i, line := range lines {
		m := fence.FindStringSubmatch(line)
		switch {
		case open >= 0:
			if m != nil && m[1][0] == marker[0] && len(m[1]) >= len(marker) {
				blocks = append(blocks, FenceBlock{Open: open, Close: i})
				open = -1
			}
		case m != nil:
			open, marker = i, m[1]
		}
	}
	if open >= 0 {
		blocks = append(blocks, FenceBlock{Open: open, Close: -1})
	}
	return blocks
}

// InFence is true for an opener, closer or code line.
func InFence(blocks []FenceBlock, line int) bool {
	lo, hi := 0, len(blocks)-1
	for lo <= hi {
		mid := (lo + hi) / 2
		b := blocks[mid]
		switch {
		case line < b.Open:
			hi = mid - 1
		case b.Close >= 0 && line > b.Close:
			lo = mid + 1
		default:
			return true
		}
	}
	return false
}

var embedLine = regexp.MustCompile(`(?i)^([ \t]*)\{\{task:([0-7][0-9A-HJKMNP-TV-Z]{25})\}\}[ \t]*$`)

// TaskEmbed is a line holding only {{task:<ULID>}}, optionally indented.
type TaskEmbed struct {
	ID     string
	Line   int
	Indent string
}

// FindTaskEmbeds skips lines inside fenced code blocks: those are text.
func FindTaskEmbeds(markdown string) []TaskEmbed {
	lines := strings.Split(markdown, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSuffix(line, "\r")
	}
	fences := ScanFences(lines)
	var embeds []TaskEmbed
	for i, line := range lines {
		if InFence(fences, i) {
			continue
		}
		if m := embedLine.FindStringSubmatch(line); m != nil {
			embeds = append(embeds, TaskEmbed{ID: strings.ToUpper(m[2]), Line: i, Indent: m[1]})
		}
	}
	return embeds
}

func ReplaceTaskEmbeds(markdown string, render func(TaskEmbed) string) string {
	embeds := FindTaskEmbeds(markdown)
	if len(embeds) == 0 {
		return markdown
	}
	lines := strings.Split(markdown, "\n")
	for _, e := range embeds {
		cr := ""
		if strings.HasSuffix(lines[e.Line], "\r") {
			cr = "\r"
		}
		lines[e.Line] = render(e) + cr
	}
	return strings.Join(lines, "\n")
}

// TaskEmbedFallbackLine is the plain checklist line for an embed rendered
// without live tasks; task is nil when it is gone.
func TaskEmbedFallbackLine(indent string, task *Task) string {
	switch {
	case task == nil:
		return indent + "- [ ] (deleted task)"
	case task.Status == "dropped":
		return indent + "- [ ] ~~" + task.Title + "~~ (dropped)"
	case task.Status == "done":
		return indent + "- [x] " + task.Title
	}
	return indent + "- [ ] " + task.Title
}

var dayShape = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})$`)

// ParseCalendarDay is UTC midnight of a real yyyy-mm-dd day.
func ParseCalendarDay(day string) (time.Time, bool) {
	m := dayShape.FindStringSubmatch(day)
	if m == nil {
		return time.Time{}, false
	}
	y, _ := strconv.Atoi(m[1])
	mo, _ := strconv.Atoi(m[2])
	d, _ := strconv.Atoi(m[3])
	t := time.Date(y, time.Month(mo), d, 0, 0, 0, 0, time.UTC)
	if int(t.Month()) != mo || t.Day() != d {
		return time.Time{}, false
	}
	return t, true
}

// LongDay is formatCalendarDay(day, { weekday: 'long' }): "Tuesday, Oct 6".
func LongDay(day string) string {
	t, ok := ParseCalendarDay(day)
	if !ok {
		return day
	}
	return t.Weekday().String() + ", " + t.Month().String()[:3] + " " + strconv.Itoa(t.Day())
}

// NoteDisplayTitle is what lists and search call a note: a daily note by
// its day.
func NoteDisplayTitle(n Note) string {
	if n.Type == "daily" && n.Date != nil {
		if _, ok := ParseCalendarDay(*n.Date); ok {
			return LongDay(*n.Date)
		}
	}
	if title := api.TrimJS(n.Title); title != "" {
		return title
	}
	return "Untitled"
}

// TaskEmbedIDs are the embedded task ids, unique, in first-seen order.
func TaskEmbedIDs(markdown string) []string {
	ids := []string{}
	seen := map[string]bool{}
	for _, e := range FindTaskEmbeds(markdown) {
		if !seen[e.ID] {
			seen[e.ID] = true
			ids = append(ids, e.ID)
		}
	}
	return ids
}

const carriedInHeading = "## Carried in"

// CarriedInMarkdown is the block a new daily note opens with: open tasks
// from earlier days.
func CarriedInMarkdown(taskIDs []string) string {
	tokens := make([]string, len(taskIDs))
	for i, id := range taskIDs {
		tokens[i] = "{{task:" + strings.ToUpper(id) + "}}"
	}
	return carriedInHeading + "\n\n" + strings.Join(tokens, "\n") + "\n\n"
}

var jsSpaces = regexp.MustCompile(`[\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+`)

// NormalizeTags trims, lowercases and hyphenates each tag, dropping empty
// and repeated ones.
func NormalizeTags(tags []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, raw := range tags {
		t := jsSpaces.ReplaceAllString(store.JSLower(api.TrimJS(raw)), "-")
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

var areaLabels = map[string]string{"work": "Work", "personal": "Personal"}

var templateToken = regexp.MustCompile(`\{\{(weekday|date|area)\}\}`)

// FillDailyTemplate fills {{weekday}}, {{date}} and {{area}} for the note's
// own day; other {{…}} stay.
func FillDailyTemplate(markdown, area, date string) string {
	values := map[string]string{
		"weekday": date,
		"date":    date,
		"area":    areaLabels[area],
	}
	if t, ok := ParseCalendarDay(date); ok {
		values["weekday"] = t.Weekday().String()
		values["date"] = t.Weekday().String() + ", " + t.Month().String() + " " + strconv.Itoa(t.Day())
	}
	return templateToken.ReplaceAllStringFunc(markdown, func(token string) string {
		return values[token[2:len(token)-2]]
	})
}

var templateTaskLine = regexp.MustCompile(`^[ \t]*\[ \][ \t]+\S`)

// DailyTemplateHasTasks: task lines and embeds would create or repeat a
// task in every new note.
func DailyTemplateHasTasks(markdown string) bool {
	if len(FindTaskEmbeds(markdown)) > 0 {
		return true
	}
	lines := strings.Split(markdown, "\n")
	fences := ScanFences(lines)
	for i, line := range lines {
		if !InFence(fences, i) && templateTaskLine.MatchString(line) {
			return true
		}
	}
	return false
}

var (
	plainRule         = regexp.MustCompile(`^[ \t]*(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$`)
	plainTableDivider = regexp.MustCompile(`^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$`)
	plainTableRow     = regexp.MustCompile(`^[ \t]*\|`)
	plainLineMarkers  = regexp.MustCompile(`^[ \t]*(?:>[ \t]*)*(?:#{1,6}(?:[ \t]+|$)|(?:[-*+]|\d+[.)])(?:[ \t]+|$)(?:\[[ xX]\](?:[ \t]+|$))?|\[[ xX]\](?:[ \t]+|$))?`)
	plainImageOrLink  = regexp.MustCompile(`!?\[([^\]\n]*)\]\([^)\n]*\)`)
	plainWikiLink     = regexp.MustCompile(`\[\[([^\]\n]*)\]\]`)
	plainEmphasis     = regexp.MustCompile("\\*\\*|__|~~|[*`]")
)

// MarkdownPlainText is markdown read as prose, line for line: block markers,
// emphasis and link syntax go; fenced code stays verbatim without its fences.
func MarkdownPlainText(markdown string) string {
	lines := strings.Split(markdown, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSuffix(line, "\r")
	}
	fences := ScanFences(lines)
	for i, line := range lines {
		if InFence(fences, i) {
			if isFenceLine(fences, i) {
				lines[i] = ""
			}
			continue
		}
		if plainRule.MatchString(line) || plainTableDivider.MatchString(line) {
			lines[i] = ""
			continue
		}
		text := plainLineMarkers.ReplaceAllString(line, "")
		if plainTableRow.MatchString(text) {
			text = strings.ReplaceAll(text, "|", " ")
		}
		text = plainWikiLink.ReplaceAllString(text, "$1")
		text = plainImageOrLink.ReplaceAllString(text, "$1")
		lines[i] = plainEmphasis.ReplaceAllString(text, "")
	}
	return strings.Join(lines, "\n")
}

func isFenceLine(blocks []FenceBlock, line int) bool {
	for _, b := range blocks {
		if b.Open == line || b.Close == line {
			return true
		}
	}
	return false
}
