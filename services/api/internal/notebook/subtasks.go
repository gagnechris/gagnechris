package notebook

import (
	"context"
	"errors"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
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
// task in the same area that is not a subtask itself, or none. A parent
// whose home is note gets no parent from it, so its stored one is stale.
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
		if p, ok := parents[nesting[t.ID]]; ok && p.Area == t.Area && (p.ParentID == nil || sameParent(p.NoteID, &note.ID)) {
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
// note embeds its parent, so only those notes' tasks are read.
func (h handlers) clearSubtasks(ctx context.Context, userID string, parent Task, onCorrupt func(*api.DataIntegrityError)) error {
	notes, err := CollectPages(maxSubtaskScan, func(cursor string) (store.Page[Note], error) {
		return h.notes.list(ctx, userID, listNotesQuery{area: parent.Area, taskID: parent.ID, cursor: cursor, limit: 100}, onCorrupt)
	}, keepAll[Note])
	if err != nil {
		return err
	}
	for _, n := range notes {
		tasks, err := CollectPages(maxSubtaskScan, func(cursor string) (store.Page[Task], error) {
			return h.tasks.listByNote(ctx, userID, listTasksQuery{noteID: n.ID, cursor: cursor, limit: 100}, onCorrupt)
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
