package notebook

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

var errParentUnchanged = errors.New("parent unchanged")

func sameParent(a, b *string) bool {
	return (a == nil) == (b == nil) && (a == nil || *a == *b)
}

// setParent writes parentID unless the task already has it.
func (r *tasksRepo) setParent(ctx context.Context, userID, id string, parentID *string) (Task, error) {
	t, err := r.base.mutate(ctx, userID, id, api.Expected{Set: true, Any: true}, func(t Task, now string) (Task, error) {
		if sameParent(t.ParentID, parentID) {
			return t, errParentUnchanged
		}
		t.ParentID = parentID
		t.UpdatedAt = now
		return t, nil
	})
	if errors.Is(err, errParentUnchanged) {
		return t, nil
	}
	return t, err
}

// parentsIn is the parent each task gets from note's indentation: a live
// task in the same area, or none.
func (r *tasksRepo) parentsIn(ctx context.Context, userID string, note Note, tasks []Task) (map[string]*string, error) {
	nesting := map[string]string{}
	var parentIDs []string
	for _, s := range TaskEmbedParents(note.BodyMarkdown) {
		nesting[s.ID] = s.ParentID
		parentIDs = append(parentIDs, s.ParentID)
	}
	parents := map[string]Task{}
	if len(parentIDs) > 0 {
		live, err := r.base.getMany(ctx, userID, parentIDs)
		if err != nil {
			return nil, err
		}
		for _, p := range live {
			parents[p.ID] = p
		}
	}
	out := map[string]*string{}
	for _, t := range tasks {
		var want *string
		if p, ok := parents[nesting[t.ID]]; ok && p.Area == t.Area {
			want = &p.ID
		}
		out[t.ID] = want
	}
	return out, nil
}

// syncParents sets the parent of every task whose home is note from the
// note's indentation. Only the home note nests a task.
func (r *tasksRepo) syncParents(ctx context.Context, userID string, note Note, onCorrupt func(*api.DataIntegrityError)) error {
	home, err := CollectPages(maxSubtaskScan, func(cursor string) (store.Page[Task], error) {
		return r.listByNote(ctx, userID, listTasksQuery{noteID: note.ID, cursor: cursor, limit: 100}, onCorrupt)
	}, keepAll[Task])
	if err != nil || len(home) == 0 {
		return err
	}
	want, err := r.parentsIn(ctx, userID, note, home)
	if err != nil {
		return err
	}
	for _, t := range home {
		if sameParent(t.ParentID, want[t.ID]) {
			continue
		}
		if _, err := r.setParent(ctx, userID, t.ID, want[t.ID]); err != nil && !isGoneOrConflict(err) {
			return err
		}
	}
	return nil
}

// renest gives t the parent its home note sets, after its home or area
// changed.
func (h handlers) renest(ctx context.Context, userID string, t Task) (Task, error) {
	var want *string
	if t.NoteID != nil {
		n, err := h.notes.base.getLive(ctx, userID, *t.NoteID, false)
		if err != nil {
			return t, err
		}
		if n != nil {
			parents, err := h.tasks.parentsIn(ctx, userID, *n, []Task{t})
			if err != nil {
				return t, err
			}
			want = parents[t.ID]
		}
	}
	if sameParent(t.ParentID, want) {
		return t, nil
	}
	return h.tasks.setParent(ctx, userID, t.ID, want)
}

// clearSubtasks takes deleted parent off its subtasks. A subtask's home
// note embeds its parent and nested it on a save after the parent existed,
// so only the parent's home note, daily notes from the day before it was
// created and pages saved since then are read. A subtask homed in an older
// note keeps the dead parent until that note's next save drops it.
func (h handlers) clearSubtasks(ctx context.Context, userID string, parent Task, onCorrupt func(*api.DataIntegrityError)) error {
	homes, err := h.notes.embeddingSince(ctx, userID, parent, onCorrupt)
	if err != nil {
		return err
	}
	if parent.NoteID != nil && !slices.Contains(homes, *parent.NoteID) {
		homes = append(homes, *parent.NoteID)
	}
	for _, noteID := range homes {
		tasks, err := CollectPages(maxSubtaskScan, func(cursor string) (store.Page[Task], error) {
			return h.tasks.listByNote(ctx, userID, listTasksQuery{noteID: noteID, cursor: cursor, limit: 100}, onCorrupt)
		}, keepAll[Task])
		if err != nil {
			return err
		}
		for _, t := range tasks {
			if t.ParentID == nil || *t.ParentID != parent.ID {
				continue
			}
			if _, err := h.tasks.setParent(ctx, userID, t.ID, nil); err != nil && !isGoneOrConflict(err) {
				return err
			}
		}
	}
	return nil
}

// embeddingSince is the ids of notes in task's area that embed it and were
// dated or saved no earlier than the day before it was created. The day
// covers daily dates in the user's time zone and clock skew.
func (r *notesRepo) embeddingSince(ctx context.Context, userID string, task Task, onCorrupt func(*api.DataIntegrityError)) ([]string, error) {
	created, err := time.Parse(time.RFC3339Nano, task.CreatedAt)
	if err != nil {
		return nil, err
	}
	since := created.Add(-24 * time.Hour)
	ranges := []*skRange{
		{"DATE#" + since.Format("2006-01-02"), "DATE#\uffff"},
		{"PAGE#" + jstime.ISO(since), "PAGE#\uffff"},
	}
	embeds := listNotesQuery{taskID: task.ID}.keep()
	var ids []string
	for _, rng := range ranges {
		notes, err := CollectPages(maxSubtaskScan, func(cursor string) (store.Page[Note], error) {
			return gsi1Page(ctx, r.table, keys.NotebookAreaGSI1Pk(userID, task.Area), rng, cursor, 100, store.PageByteBudget,
				r.base.parse, func(n Note) bool { return n.Deleted }, embeds, onCorrupt)
		}, keepAll[Note])
		if err != nil {
			return nil, err
		}
		for _, n := range notes {
			ids = append(ids, n.ID)
		}
	}
	return ids, nil
}

func keepAll[T any](T) bool { return true }

// maxSubtaskScan bounds the rows one nesting pass reads.
const maxSubtaskScan = 1000

// isGoneOrConflict: a task deleted or rewritten meanwhile is left to its
// next note save.
func isGoneOrConflict(err error) bool {
	var conflict *api.ConflictError
	var notFound *api.NotFoundError
	return errors.As(err, &conflict) || errors.As(err, &notFound)
}
