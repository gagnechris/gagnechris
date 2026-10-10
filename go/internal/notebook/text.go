// Package notebook reads Notebook notes and tasks, with the text helpers
// packages/shared gives every client: fenced code blocks, task embed lines
// and calendar days.
package notebook

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gagnechris/gagnechris/go/internal/api"
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
