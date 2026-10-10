package notebook

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const (
	noteChangeType = "note"
	pageSize       = 50
)

func noteKey(userID, id string) data.Item {
	return data.Key(keys.NotePk(userID, id), keys.NoteMetaSk())
}

func dailyClaimKey(userID, area, date string) data.Item {
	return data.Key(keys.DailyNoteClaimPk(userID, area, date), keys.DailyNoteClaimSk())
}

func noteCreateHash(n Note) string {
	date := ""
	if n.Date != nil {
		date = *n.Date
	}
	pinned := "0"
	if n.Pinned {
		pinned = "1"
	}
	return hashCreateFields(n.UserID, n.Area, n.Type, date, n.Title, n.BodyMarkdown, strings.Join(n.Tags, ","), pinned)
}

type notesRepo struct {
	table *data.Table
	base  *versioned[Note, *Note]
}

func newNotesRepo(table *data.Table, now func() time.Time) *notesRepo {
	r := &notesRepo{table: table}
	r.base = &versioned[Note, *Note]{
		table: table, now: now, label: "note", changeType: noteChangeType,
		key: noteKey, parse: ParseNote, item: noteItem, createHash: noteCreateHash,
	}
	r.base.claim = r.dailyClaim()
	return r
}

func isDaily(n Note) bool { return n.Type == "daily" && n.Date != nil && *n.Date != "" }

func isConditionFailed(err error) bool {
	return err != nil && data.ClassifyWriteError(err) == data.WriteConflict
}

// dailyHolder reads the day's claim and the note it names; meta is nil when
// that note's row is gone.
func (r *notesRepo) dailyHolder(ctx context.Context, n Note) (noteID string, meta data.Item, found bool, err error) {
	if !isDaily(n) {
		return "", nil, false, nil
	}
	res, err := r.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.table.Name), Key: dailyClaimKey(n.UserID, n.Area, *n.Date), ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return "", nil, false, err
	}
	held := store.OptString(res.Item, "noteId")
	if held == nil || *held == "" {
		return "", nil, false, nil
	}
	meta, err = r.base.getRaw(ctx, n.UserID, *held, true)
	return *held, meta, true, err
}

func (r *notesRepo) deleteClaimIf(ctx context.Context, n Note, noteID string) error {
	_, err := r.table.DB.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName:                 aws.String(r.table.Name),
		Key:                       dailyClaimKey(n.UserID, n.Area, *n.Date),
		ConditionExpression:       aws.String("noteId = :id"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":id": data.S(noteID)},
	})
	// Someone else already freed or re-took it; the retry sorts it out.
	if isConditionFailed(err) {
		return nil
	}
	return err
}

func (r *notesRepo) dailyClaim() *uniqueClaim[Note] {
	return &uniqueClaim[Note]{
		code:    api.CodeDailyTaken,
		message: "Daily note already exists for this area and date",
		puts: func(n Note) []data.Item {
			if !isDaily(n) {
				return nil
			}
			item := dailyClaimKey(n.UserID, n.Area, *n.Date)
			item["entityType"] = data.S("dailyNoteClaim")
			item["userId"] = data.S(n.UserID)
			item["area"] = data.S(n.Area)
			item["date"] = data.S(*n.Date)
			item["noteId"] = data.S(n.ID)
			return []data.Item{item}
		},
		holder: func(ctx context.Context, n Note) (*Note, error) {
			_, meta, _, err := r.dailyHolder(ctx, n)
			if err != nil || meta == nil {
				return nil, err
			}
			holder, err := r.base.mapItem(meta)
			if err != nil {
				return nil, err
			}
			return &holder, nil
		},
		release: func(n Note) []types.TransactWriteItem {
			if !isDaily(n) {
				return nil
			}
			return []types.TransactWriteItem{{Delete: &types.Delete{
				TableName: aws.String(r.table.Name),
				Key:       dailyClaimKey(n.UserID, n.Area, *n.Date),
				// Only free the claim if it is still this note's.
				ConditionExpression:       aws.String("attribute_not_exists(pk) OR noteId = :id"),
				ExpressionAttributeValues: map[string]types.AttributeValue{":id": data.S(n.ID)},
			}}}
		},
		releaseStale: func(ctx context.Context, holder Note) error {
			if !isDaily(holder) {
				return nil
			}
			return r.deleteClaimIf(ctx, holder, holder.ID)
		},
		// A claim outlives its note when a delete never released it and the
		// tombstone was purged, or after a partial restore.
		releaseOrphan: func(ctx context.Context, n Note) error {
			noteID, meta, found, err := r.dailyHolder(ctx, n)
			if err != nil || !found || meta != nil {
				return err
			}
			return r.deleteClaimIf(ctx, n, noteID)
		},
	}
}

type noteFields struct {
	title, bodyMarkdown *string
	tags                []string
	hasTags             bool
	pinned              *bool
	area                *string
}

func applyNoteUpdate(existing Note, f noteFields, now string) (Note, error) {
	// The (area, date) claim is what makes a daily note unique; moving it
	// to another area would leave two dailies for one day.
	if existing.Type == "daily" && f.area != nil && *f.area != existing.Area {
		return existing, api.BadRequest("A daily note's area cannot change", map[string]string{"area": "immutable"})
	}
	n := existing
	if f.title != nil {
		n.Title = *f.title
	}
	if f.bodyMarkdown != nil {
		n.BodyMarkdown = *f.bodyMarkdown
	}
	n.TaskIDs = TaskEmbedIDs(n.BodyMarkdown)
	if f.hasTags {
		n.Tags = NormalizeTags(f.tags)
	}
	if f.pinned != nil {
		n.Pinned = *f.pinned
	}
	if f.area != nil {
		n.Area = *f.area
	}
	n.UpdatedAt = now
	return n, nil
}

type createNoteInput struct {
	id, area, noteType string
	date               *string
	title, body        string
	tags               []string
	pinned             bool
}

func (r *notesRepo) create(ctx context.Context, userID string, in createNoteInput) (Note, error) {
	now := r.base.nowISO()
	n := Note{
		ID: in.id, UserID: userID, Area: in.area, Type: in.noteType,
		Title: in.title, BodyMarkdown: in.body, Tags: NormalizeTags(in.tags), Pinned: in.pinned,
		TaskIDs: TaskEmbedIDs(in.body), Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	if in.noteType == "daily" {
		n.Date = in.date
	}
	return r.base.createIdempotent(ctx, n)
}

func (r *notesRepo) update(ctx context.Context, userID, id string, expected api.Expected, f noteFields) (Note, error) {
	return r.base.mutate(ctx, userID, id, expected, func(existing Note, now string) (Note, error) {
		return applyNoteUpdate(existing, f, now)
	})
}

func (r *notesRepo) delete(ctx context.Context, userID, id string, expected api.Expected) (Note, error) {
	return r.base.softDelete(ctx, userID, id, expected, func(n Note, now string) Note {
		n.UpdatedAt = now
		n.Deleted = true
		return n
	})
}

// listNotesQuery is ListNotesQuerySchema.
type listNotesQuery struct {
	area, from, to, noteType, cursor string
	limit                            int
}

type skRange struct{ from, to string }

func noteRange(q listNotesQuery) *skRange {
	switch {
	case q.from != "" || q.to != "":
		from, to := q.from, q.to
		if from == "" {
			from = "0000-01-01"
		}
		if to == "" {
			to = "9999-12-31"
		}
		// `#NOTE~` sorts after every `DATE#<day>#NOTE#<id>` for that day.
		return &skRange{"DATE#" + from, "DATE#" + to + "#NOTE~"}
	case q.noteType == "daily":
		return prefixRange("DATE#")
	case q.noteType == "page":
		return prefixRange("PAGE#")
	}
	return nil
}

func prefixRange(prefix string) *skRange { return &skRange{prefix, prefix + "\uffff"} }

// gsi1Page reads a GSI1 partition, optionally a sort-key range of it.
func gsi1Page[T any](ctx context.Context, table *data.Table, pk string, rng *skRange, cursor string, limit, byteBudget int,
	parse func(data.Item) (T, error), deleted func(T) bool, keep func(T) bool, onCorrupt func(*api.DataIntegrityError)) (store.Page[T], error) {
	in := dynamodb.QueryInput{
		IndexName:                 aws.String(gsi1),
		KeyConditionExpression:    aws.String("gsi1pk = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
		ScanIndexForward:          aws.Bool(true),
	}
	q := store.PageQuery{
		Cursor: cursor, Limit: limit, CursorKeys: store.GSI1CursorKeys,
		PartitionAttr: "gsi1pk", PartitionValue: pk, ByteBudget: byteBudget,
	}
	if rng != nil {
		in.KeyConditionExpression = aws.String("gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to")
		in.ExpressionAttributeValues[":from"] = data.S(rng.from)
		in.ExpressionAttributeValues[":to"] = data.S(rng.to)
		q.SortAttr, q.SortLowerBound = "gsi1sk", rng.from
	}
	q.Input = in
	page, err := store.QueryPage(ctx, table, q, func(item data.Item) (T, bool, error) {
		row, err := parse(item)
		return row, err == nil && deleted(row), err
	}, onCorrupt)
	if err != nil || keep == nil {
		return page, err
	}
	page.Items = slices.DeleteFunc(page.Items, func(row T) bool { return !keep(row) })
	return page, nil
}

func (r *notesRepo) list(ctx context.Context, userID string, q listNotesQuery, onCorrupt func(*api.DataIntegrityError)) (store.Page[Note], error) {
	fetch := func(area, cursor string, limit, budget int) (store.Page[Note], error) {
		return gsi1Page(ctx, r.table, keys.NotebookAreaGSI1Pk(userID, area), noteRange(q), cursor, limit, budget,
			r.base.parse, func(n Note) bool { return n.Deleted }, nil, onCorrupt)
	}
	if q.area != "" {
		return fetch(q.area, q.cursor, q.limit, store.PageByteBudget)
	}
	return store.WalkPartitions(Areas, q.cursor, q.limit, fetch)
}

// emptyDaily is the day before its note exists.
type emptyDaily struct {
	Exists           bool     `json:"exists"`
	UserID           string   `json:"userId"`
	Area             string   `json:"area"`
	Type             string   `json:"type"`
	Date             string   `json:"date"`
	Title            string   `json:"title"`
	BodyMarkdown     string   `json:"bodyMarkdown"`
	Tags             []string `json:"tags"`
	Pinned           bool     `json:"pinned"`
	Version          int      `json:"version"`
	TemplateMarkdown string   `json:"templateMarkdown"`
}

// getDaily is the day's live note, or nil.
func (r *notesRepo) getDaily(ctx context.Context, userID, area, date string) (*Note, error) {
	res, err := r.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(r.table.Name), Key: dailyClaimKey(userID, area, date), ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return nil, err
	}
	held := store.OptString(res.Item, "noteId")
	if held == nil || *held == "" {
		return nil, nil
	}
	n, err := r.base.getIncludingDeleted(ctx, userID, *held, true)
	if err != nil || n == nil || n.Deleted {
		return nil, err
	}
	return n, nil
}

type dailyFields struct {
	id string
	noteFields
}

func (r *notesRepo) createDaily(ctx context.Context, userID, area, date string, f dailyFields) (Note, error) {
	in := createNoteInput{id: f.id, area: area, noteType: "daily", date: &date, tags: []string{}}
	if f.title != nil {
		in.title = *f.title
	}
	if f.bodyMarkdown != nil {
		in.body = *f.bodyMarkdown
	}
	if f.hasTags {
		in.tags = f.tags
	}
	if f.pinned != nil {
		in.pinned = *f.pinned
	}
	return r.create(ctx, userID, in)
}

var errNotThisDay = errors.New("not this day's note")

// updateDaily reads the note body.id names first; only when that is not
// the day's note does the claim decide which note to update, or whether to
// create one.
func (r *notesRepo) updateDaily(ctx context.Context, userID, area, date string, f dailyFields, expected api.Expected) (Note, error) {
	fields := f.noteFields
	fields.area = nil
	n, err := r.base.mutate(ctx, userID, f.id, expected, func(existing Note, now string) (Note, error) {
		if existing.Type != "daily" || existing.Area != area || existing.Date == nil || *existing.Date != date {
			return existing, errNotThisDay
		}
		return applyNoteUpdate(existing, fields, now)
	})
	var notFound *api.NotFoundError
	if err == nil || !errors.As(err, &notFound) && !errors.Is(err, errNotThisDay) {
		return n, err
	}
	current, err := r.getDaily(ctx, userID, area, date)
	if err != nil {
		return Note{}, err
	}
	if current == nil {
		return r.createDaily(ctx, userID, area, date, f)
	}
	return r.update(ctx, userID, current.ID, expected, fields)
}

func changedSinceCreate(current Note) error {
	v := current.Version
	return &api.ConflictError{Message: "Daily note changed since it was created", Code: api.CodeVersionConflict, CurrentVersion: &v, Current: current}
}

// createDailyOrReplay: a write with no version can only create the day's
// note. A retry of the same create is a no-op; anything else is 409 with
// the current note, so a writer still holding the empty placeholder merges
// instead of overwriting.
func (r *notesRepo) createDailyOrReplay(ctx context.Context, userID, area, date string, f dailyFields) (Note, error) {
	n, err := r.createDaily(ctx, userID, area, date, f)
	if err != nil {
		var conflict *api.ConflictError
		if errors.As(err, &conflict) && conflict.Code == api.CodePayloadMismatch {
			if current, ok := conflict.Current.(Note); ok {
				return n, changedSinceCreate(current)
			}
		}
		return n, err
	}
	if !matchesDailyCreate(n, f) {
		return n, changedSinceCreate(n)
	}
	return n, nil
}

func matchesDailyCreate(n Note, f dailyFields) bool {
	str := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	tags := []string{}
	if f.hasTags {
		tags = f.tags
	}
	return n.ID == f.id && n.Version == 1 &&
		str(f.title) == n.Title && str(f.bodyMarkdown) == n.BodyMarkdown &&
		(f.pinned != nil && *f.pinned) == n.Pinned &&
		slices.Equal(NormalizeTags(tags), n.Tags)
}
