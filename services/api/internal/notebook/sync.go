package notebook

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/observability"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

const (
	gsi3 = "gsi3"
	// boundSince binds a cursor to the query's since lower bound; it is
	// stripped before the key goes to DynamoDB.
	boundSince = "boundSince"
	// maxSyncQueries stops a partition of skipped (corrupt) rows from running
	// the Lambda to its timeout.
	maxSyncQueries = 5
)

var (
	syncGSICursorKeys = []string{"pk", "sk", "syncPk", "syncSk"}
	syncCursorKeys    = append(append([]string{}, syncGSICursorKeys...), boundSince)
)

// Change is one SyncChange: the record rides along unless it is a
// tombstone.
type Change struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Version   int    `json:"version"`
	UpdatedAt string `json:"updatedAt"`
	Deleted   bool   `json:"deleted"`
	Entity    any    `json:"entity,omitempty"`
}

type changesPage struct {
	Changes    []Change `json:"changes"`
	NextCursor string   `json:"nextCursor,omitempty"`
	NextSince  string   `json:"nextSince"`
}

// syncAdapters decode a feed row per change type.
var syncAdapters = map[string]func(data.Item) (Change, error){
	noteChangeType: func(item data.Item) (Change, error) {
		n, err := ParseNote(item)
		if err == nil {
			err = checkNote(n)
		}
		return changeOf(noteChangeType, n.ID, n.Version, n.UpdatedAt, n.Deleted, n), err
	},
	taskChangeType: func(item data.Item) (Change, error) {
		t, err := ParseTask(item)
		if err == nil {
			err = checkTask(t)
		}
		return changeOf(taskChangeType, t.ID, t.Version, t.UpdatedAt, t.Deleted, t), err
	},
}

func changeOf(changeType, id string, version int, updatedAt string, deleted bool, entity any) Change {
	c := Change{Type: changeType, ID: id, Version: version, UpdatedAt: updatedAt, Deleted: deleted}
	if !deleted {
		c.Entity = entity
	}
	return c
}

func itemChangeType(item data.Item) string {
	for _, attr := range []string{"entityType", "changeType"} {
		if s := store.OptString(item, attr); s != nil && *s != "" {
			return *s
		}
	}
	return ""
}

type syncQuery struct {
	since, cursor string
	limit         int
}

// changesSince reads the feed from since, less an overlap window that
// absorbs clock skew; nextSince is the watermark the next poll passes back.
func changesSince(ctx context.Context, table *data.Table, now time.Time, userID string, q syncQuery, log func(*api.DataIntegrityError)) (changesPage, error) {
	now = now.Truncate(time.Millisecond)
	watermark := jstime.ISO(now)
	lowerBound := ""
	if q.since != "" {
		since, ok := api.ParseDatetime(q.since)
		if !ok {
			return changesPage{}, api.BadRequest("Invalid sync since timestamp: "+q.since, nil)
		}
		sc := contract.Data.Sync
		horizon := now.Add(-time.Duration(sc.TombstoneTTLDays) * 24 * time.Hour).
			Add(time.Duration(sc.ResyncMarginMs+sc.OverlapMs) * time.Millisecond)
		if since.Before(horizon) {
			return changesPage{}, &api.ResyncRequiredError{Message: "Sync watermark is older than the tombstone retention horizon; full resync required"}
		}
		lowerBound = jstime.ISO(since.Add(-time.Duration(sc.OverlapMs) * time.Millisecond))
	}
	pk := keys.SyncPk(userID)
	decoded, err := store.DecodeCursor(q.cursor, syncCursorKeys)
	if err != nil {
		return changesPage{}, err
	}
	var start data.Item
	if decoded != nil {
		if err := store.AssertCursorPartition(decoded, "syncPk", pk); err != nil {
			return changesPage{}, err
		}
		if b := store.OptString(decoded, boundSince); b == nil || *b != lowerBound {
			return changesPage{}, api.ErrInvalidCursor
		}
		if lowerBound != "" {
			if sk := store.OptString(decoded, "syncSk"); sk == nil || *sk < lowerBound {
				return changesPage{}, api.ErrInvalidCursor
			}
		}
		start = data.Item{}
		for k, v := range decoded {
			if k != boundSince {
				start[k] = v
			}
		}
	}

	limit := q.limit
	if limit == 0 {
		limit = contract.Data.Sync.DefaultPageLimit
	}
	changes := []Change{}
	bytes := 0
	var lastKey data.Item
rounds:
	for round := 1; ; round++ {
		in := &dynamodb.QueryInput{
			TableName:                 aws.String(table.Name),
			IndexName:                 aws.String(gsi3),
			KeyConditionExpression:    aws.String("syncPk = :pk"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":pk": data.S(pk)},
			ExclusiveStartKey:         start,
			Limit:                     aws.Int32(int32(limit - len(changes))),
		}
		if lowerBound != "" {
			// syncSk starts with the ISO timestamp, so any type and id suffix
			// sorts after the lower bound's instant.
			in.KeyConditionExpression = aws.String("syncPk = :pk AND syncSk >= :sinceSk")
			in.ExpressionAttributeValues[":sinceSk"] = data.S(lowerBound)
		}
		res, err := table.DB.Query(ctx, in)
		if err != nil {
			return changesPage{}, store.MapQueryError(err)
		}
		for i, item := range res.Items {
			changeType := itemChangeType(item)
			if changeType == "" {
				continue
			}
			adapter, ok := syncAdapters[changeType]
			// Fail the page instead of skipping: the client would advance past
			// nextSince and never see the row.
			if !ok {
				return changesPage{}, &api.SyncAdapterMissingError{ChangeType: changeType}
			}
			if et := store.OptString(item, "entityType"); et == nil || *et != changeType {
				continue
			}
			// One corrupt row is skipped, not failed, so it cannot stop the
			// user's sync for good; a repair that rewrites it with a newer
			// updatedAt puts it back in the feed.
			change, err := adapter(item)
			if err != nil {
				log(corruptSyncRow(changeType, item, err))
				continue
			}
			size := store.JSONByteLength(change)
			if len(changes) > 0 && bytes+size > store.PageByteBudget {
				if i > 0 {
					lastKey = store.KeyOf(res.Items[i-1], syncGSICursorKeys)
				} else {
					lastKey = start
				}
				break rounds
			}
			bytes += size
			changes = append(changes, change)
		}
		lastKey = res.LastEvaluatedKey
		if len(lastKey) == 0 || len(changes) >= limit || bytes >= store.PageByteBudget || round >= maxSyncQueries {
			break
		}
		start = lastKey
	}

	page := changesPage{Changes: changes, NextSince: watermark}
	if len(lastKey) > 0 {
		cursor := data.Item{boundSince: data.S(lowerBound)}
		for k, v := range lastKey {
			cursor[k] = v
		}
		page.NextCursor = store.EncodeCursor(cursor)
	}
	return page, nil
}

func corruptSyncRow(changeType string, item data.Item, err error) *api.DataIntegrityError {
	var integrity *api.DataIntegrityError
	if errors.As(err, &integrity) {
		err = integrity.Cause
	}
	e := &api.DataIntegrityError{Message: "Corrupt sync row (" + changeType + ")", Cause: err}
	if pk := store.OptString(item, "pk"); pk != nil {
		e.PK = *pk
	}
	if sk := store.OptString(item, "sk"); sk != nil {
		e.SK = *sk
	}
	return e
}

// logSyncCorrupt logs a skipped feed row and counts SyncCorruptRow, which
// is alarmed.
func logSyncCorrupt(r *api.Request) func(*api.DataIntegrityError) {
	return func(e *api.DataIntegrityError) {
		attrs := []any{"pk", e.PK, "sk", e.SK, "errMessage", e.Message}
		if e.Cause != nil {
			attrs = append(attrs, "causeMessage", e.Cause.Error())
		}
		r.Log.Warn("Skipping corrupt stored item", attrs...)
		r.Metrics.Add("SyncCorruptRow", observability.Count, 1)
	}
}

var clientVersion = regexp.MustCompile(`^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$`)

func parseClientVersion(raw string) ([3]int, bool) {
	m := clientVersion.FindStringSubmatch(api.TrimJS(raw))
	if m == nil {
		return [3]int{}, false
	}
	var v [3]int
	for i := range v {
		v[i], _ = strconv.Atoi(m[i+1])
	}
	return v, true
}

// assertClientVersion allows an absent header so web clients without it
// keep working.
func assertClientVersion(r *api.Request, minimum string) error {
	header := contract.Data.Sync.ClientVersionHeader
	raw := r.Headers[header]
	if raw == "" {
		return nil
	}
	version, ok := parseClientVersion(raw)
	if !ok {
		return api.InvalidHeader(header)
	}
	floor, ok := parseClientVersion(minimum)
	if !ok {
		return fmt.Errorf("invalid minimum client version %s", minimum)
	}
	for i := range version {
		if version[i] != floor[i] {
			if version[i] > floor[i] {
				return nil
			}
			return &api.UpgradeRequiredError{
				Message:          "Client version " + api.TrimJS(raw) + " is older than the minimum " + minimum + "; upgrade required",
				MinClientVersion: minimum,
			}
		}
	}
	return nil
}
