package notebook

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

const createRetries = 4

var (
	tombstoneTTLDays   = contract.Data.Sync.TombstoneTTLDays
	createClaimTTLDays = contract.Data.Sync.CreateClaimTTLDays
)

// entity is a synced, owner-scoped Notebook record.
type entity[T any] interface {
	*T
	ident() (userID, id string)
	ver() int
	setVersion(int)
	updated() string
	isDeleted() bool
}

func (n *Note) ident() (string, string) { return n.UserID, n.ID }
func (n *Note) ver() int                { return n.Version }
func (n *Note) setVersion(v int)        { n.Version = v }
func (n *Note) updated() string         { return n.UpdatedAt }
func (n *Note) isDeleted() bool         { return n.Deleted }
func (t *Task) ident() (string, string) { return t.UserID, t.ID }
func (t *Task) ver() int                { return t.Version }
func (t *Task) setVersion(v int)        { t.Version = v }
func (t *Task) updated() string         { return t.UpdatedAt }
func (t *Task) isDeleted() bool         { return t.Deleted }

// uniqueClaim is a row a create must also take, as the daily note's day.
type uniqueClaim[T any] struct {
	code    api.ConflictCode
	message string
	puts    func(T) []data.Item
	// holder is the record holding e's claim, nil when the claim is free or
	// its holder row is gone.
	holder func(ctx context.Context, e T) (*T, error)
	// release deletes the claim on soft delete if it is still e's.
	release func(e T) []types.TransactWriteItem
	// releaseStale frees a claim a tombstone still holds.
	releaseStale func(ctx context.Context, holder T) error
	// releaseOrphan frees a claim whose holder row is gone.
	releaseOrphan func(ctx context.Context, e T) error
}

// versioned is the optimistic-concurrency store for owner-scoped records,
// with the sync feed attributes, create claims and tombstones.
type versioned[T any, P entity[T]] struct {
	table      *data.Table
	now        func() time.Time
	label      string
	changeType string
	key        func(userID, id string) data.Item
	parse      func(data.Item) (T, error)
	item       func(T) data.Item
	// createHash fingerprints create-time content so a replayed create can
	// be told from a different one with the same id.
	createHash func(T) string
	claim      *uniqueClaim[T]
}

func (s *versioned[T, P]) nowISO() string { return store.ISOTime(s.now()) }

func (s *versioned[T, P]) notFound(id string) error {
	return api.NotFound(s.label + " " + id + " not found")
}

func hashCreateFields(fields ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(fields, "\x00")))
	return createHashPrefix + hex.EncodeToString(sum[:])
}

const createHashPrefix = "sha256:"

// createHashMatches also accepts a stored plaintext join, hashing it first.
func createHashMatches(stored *string, requestHash string) bool {
	if stored == nil {
		return false
	}
	if strings.HasPrefix(*stored, createHashPrefix) {
		return *stored == requestHash
	}
	sum := sha256.Sum256([]byte(*stored))
	return createHashPrefix+hex.EncodeToString(sum[:]) == requestHash
}

// SyncSk sorts the feed by time; updatedAt is already normalized ISO-8601.
func SyncSk(updatedAt, changeType, id string) string {
	return updatedAt + "#" + strings.ToUpper(changeType) + "#" + id
}

func ttlDaysFrom(days int, at time.Time) int64 {
	return at.Unix() + int64(days)*86_400
}

func (s *versioned[T, P]) storedItem(e T, ttl *int64, createHash *string) data.Item {
	item := s.item(e)
	userID, id := P(&e).ident()
	item["entityType"] = data.S(s.changeType)
	item["syncPk"] = data.S(keys.SyncPk(userID))
	item["syncSk"] = data.S(SyncSk(P(&e).updated(), s.changeType, id))
	if ttl != nil {
		item["ttl"] = data.N(*ttl)
	}
	if createHash != nil {
		item["createHash"] = data.S(*createHash)
	}
	return item
}

func (s *versioned[T, P]) createClaimItem(userID, id, createdAt string, ttl int64) data.Item {
	item := data.Key(keys.OwnerSyncCreateClaimPk(userID, s.changeType, id), keys.SyncCreateClaimSk())
	item["userId"] = data.S(userID)
	item["entityType"] = data.S("syncCreateClaim")
	item["changeType"] = data.S(s.changeType)
	item["entityId"] = data.S(id)
	item["createdAt"] = data.S(createdAt)
	item["ttl"] = data.N(ttl)
	return item
}

func (s *versioned[T, P]) mapItem(item data.Item) (T, error) {
	e, err := s.parse(item)
	var integrity *api.DataIntegrityError
	if err != nil && !errors.As(err, &integrity) {
		err = store.Corrupt(s.label, item, err)
	}
	return e, err
}

func (s *versioned[T, P]) getRaw(ctx context.Context, userID, id string, consistent bool) (data.Item, error) {
	res, err := s.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table.Name), Key: s.key(userID, id), ConsistentRead: aws.Bool(consistent),
	})
	if err != nil {
		return nil, err
	}
	return res.Item, nil
}

// getIncludingDeleted reads another owner's row as missing.
func (s *versioned[T, P]) getIncludingDeleted(ctx context.Context, userID, id string, consistent bool) (*T, error) {
	raw, err := s.getRaw(ctx, userID, id, consistent)
	if err != nil || raw == nil {
		return nil, err
	}
	e, err := s.mapItem(raw)
	if err != nil {
		return nil, err
	}
	if owner, _ := P(&e).ident(); owner != userID {
		return nil, nil
	}
	return &e, nil
}

func (s *versioned[T, P]) get(ctx context.Context, userID, id string) (*T, error) {
	e, err := s.getIncludingDeleted(ctx, userID, id, false)
	if err != nil || e == nil || P(e).isDeleted() {
		return nil, err
	}
	return e, nil
}

func (s *versioned[T, P]) getOrThrow(ctx context.Context, userID, id string) (T, error) {
	e, err := s.get(ctx, userID, id)
	if err != nil {
		var zero T
		return zero, err
	}
	if e == nil {
		var zero T
		return zero, s.notFound(id)
	}
	return *e, nil
}

// getMany is the caller's live records among ids, in their order, from one
// BatchGetItem; another user's row or a tombstone is left out.
func (s *versioned[T, P]) getMany(ctx context.Context, userID string, ids []string) ([]T, error) {
	var unique []string
	seen := map[string]bool{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	out := []T{}
	if len(unique) == 0 {
		return out, nil
	}
	keyList := make([]data.Item, len(unique))
	for i, id := range unique {
		keyList[i] = s.key(userID, id)
	}
	items, err := s.table.BatchGet(ctx, keyList, false)
	if err != nil {
		return nil, err
	}
	byID := map[string]T{}
	for _, item := range items {
		e, err := s.mapItem(item)
		if err != nil {
			return nil, err
		}
		owner, id := P(&e).ident()
		if owner == userID && !P(&e).isDeleted() {
			byID[id] = e
		}
	}
	for _, id := range unique {
		if e, ok := byID[id]; ok {
			out = append(out, e)
		}
	}
	return out, nil
}

func (s *versioned[T, P]) put(item data.Item, condition string, values map[string]types.AttributeValue) types.TransactWriteItem {
	p := &types.Put{TableName: aws.String(s.table.Name), Item: item}
	if condition != "" {
		p.ConditionExpression = aws.String(condition)
		p.ExpressionAttributeValues = values
	}
	return types.TransactWriteItem{Put: p}
}

// create writes the record with its create claim, and any unique claim, in
// one transaction.
func (s *versioned[T, P]) create(ctx context.Context, e T) error {
	userID, id := P(&e).ident()
	hash := s.createHash(e)
	items := []types.TransactWriteItem{
		s.put(s.storedItem(e, nil, &hash), "attribute_not_exists(pk)", nil),
		s.put(s.createClaimItem(userID, id, P(&e).updated(), ttlDaysFrom(createClaimTTLDays, s.now())), "attribute_not_exists(pk)", nil),
	}
	claim := store.ClaimWrite{VersionIndex: -1}
	if s.claim != nil {
		for _, put := range s.claim.puts(e) {
			claim.ClaimIndexes = append(claim.ClaimIndexes, len(items))
			items = append(items, s.put(put, "attribute_not_exists(pk)", nil))
		}
		claim.ClaimCode, claim.ClaimMessage = s.claim.code, s.claim.message
	}
	_, err := s.table.DB.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: items})
	return store.MapWriteError(err, "Create conflict ("+s.label+")", claim)
}

func (s *versioned[T, P]) claimConflict(holder T) error {
	v := P(&holder).ver()
	return &api.ConflictError{Message: s.claim.message, Code: s.claim.code, CurrentVersion: &v, Current: holder}
}

// createIdempotent creates a client-ULID record. A retry with the same id
// and content returns the stored record; the create claim keeps a deleted
// id from being reused after the tombstone's TTL purge.
func (s *versioned[T, P]) createIdempotent(ctx context.Context, e T) (T, error) {
	return s.createAttempt(ctx, e, false, 0)
}

func (s *versioned[T, P]) createAttempt(ctx context.Context, e T, retried bool, txConflicts int) (T, error) {
	userID, id := P(&e).ident()
	err := s.create(ctx, e)
	if err == nil {
		return e, nil
	}
	var conflict *api.ConflictError
	if !errors.As(err, &conflict) {
		return e, err
	}
	claim := s.claim
	// Concurrent creates of one claim cancel each other with
	// TransactionConflict on real DynamoDB (never on DynamoDB Local). Once
	// the winner commits the loser can name it; until then, back off.
	if conflict.Code == api.CodeConflict && data.IsTransactionConflict(conflict.Cause) {
		if claim != nil {
			holder, herr := claim.holder(ctx, e)
			if herr != nil {
				return e, herr
			}
			if holder != nil {
				if _, hid := P(holder).ident(); hid != id && !P(holder).isDeleted() {
					return e, s.claimConflict(*holder)
				}
			}
		}
		if txConflicts < createRetries {
			if err := data.Backoff(ctx, txConflicts); err != nil {
				return e, err
			}
			return s.createAttempt(ctx, e, retried, txConflicts+1)
		}
	}
	if conflict.Code != api.CodeConflict {
		if claim == nil {
			return e, err
		}
		holder, herr := claim.holder(ctx, e)
		if herr != nil {
			return e, herr
		}
		if holder == nil {
			if !retried {
				if err := claim.releaseOrphan(ctx, e); err != nil {
					return e, err
				}
				return s.createAttempt(ctx, e, true, txConflicts)
			}
			return e, err
		}
		if _, hid := P(holder).ident(); hid != id {
			// A tombstone still holding the claim: free it and retry once.
			if P(holder).isDeleted() && !retried {
				if err := claim.releaseStale(ctx, *holder); err != nil {
					return e, err
				}
				return s.createAttempt(ctx, e, true, txConflicts)
			}
			// The winner goes back so the client can merge rather than drop
			// its write.
			return e, s.claimConflict(*holder)
		}
		// Our own id holds the claim: the createHash check below decides.
	}

	raw, rerr := s.getRaw(ctx, userID, id, true)
	if rerr != nil {
		return e, rerr
	}
	if raw == nil {
		claimRow, cerr := s.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
			TableName: aws.String(s.table.Name),
			Key:       data.Key(keys.OwnerSyncCreateClaimPk(userID, s.changeType, id), keys.SyncCreateClaimSk()),
		})
		if cerr != nil {
			return e, cerr
		}
		if claimRow.Item != nil {
			return e, &api.ConflictError{Message: s.label + " " + id + " was deleted", Code: api.CodeDeleted}
		}
		return e, &api.ConflictError{Message: "Create conflict (" + s.label + ")", Code: api.CodeConflict}
	}
	existing, merr := s.mapItem(raw)
	if merr != nil {
		return e, merr
	}
	if owner, _ := P(&existing).ident(); owner != userID {
		return e, s.notFound(id)
	}
	v := P(&existing).ver()
	if P(&existing).isDeleted() {
		return e, s.deletedConflict(id, existing)
	}
	// A row without createHash cannot prove what it was created with.
	if !createHashMatches(store.OptString(raw, "createHash"), s.createHash(e)) {
		return e, &api.ConflictError{
			Message: s.label + " " + id + " already exists with a different payload",
			Code:    api.CodePayloadMismatch, CurrentVersion: &v, Current: existing,
		}
	}
	return existing, nil
}

// readForWrite is a consistent read, so untouched fields cannot revert to a
// stale replica's values; the raw row keeps createHash across the rewrite.
func (s *versioned[T, P]) readForWrite(ctx context.Context, userID, id string) (data.Item, T, error) {
	var zero T
	raw, err := s.getRaw(ctx, userID, id, true)
	if err != nil {
		return nil, zero, err
	}
	if raw == nil {
		return nil, zero, s.notFound(id)
	}
	existing, err := s.mapItem(raw)
	if err != nil {
		return nil, zero, err
	}
	if owner, _ := P(&existing).ident(); owner != userID {
		return nil, zero, s.notFound(id)
	}
	if P(&existing).isDeleted() {
		return nil, zero, s.deletedConflict(id, existing)
	}
	return raw, existing, nil
}

// deletedConflict carries the tombstone so an offline client can tell
// "deleted elsewhere" from a missing id and offer to restore its copy.
func (s *versioned[T, P]) deletedConflict(id string, tombstone T) error {
	v := P(&tombstone).ver()
	return &api.ConflictError{Message: s.label + " " + id + " was deleted", Code: api.CodeDeleted, CurrentVersion: &v, Current: tombstone}
}

func (s *versioned[T, P]) versionConflict(ctx context.Context, userID, id string, expected int) error {
	current, err := s.getIncludingDeleted(ctx, userID, id, true)
	if err != nil {
		return err
	}
	if current == nil {
		return store.VersionConflict(expected, nil, nil)
	}
	v := P(current).ver()
	return store.VersionConflict(expected, &v, *current)
}

// mutate writes build(existing) at expected+1, so no two contents share a
// version.
func (s *versioned[T, P]) mutate(ctx context.Context, userID, id string, expected api.Expected, build func(existing T, now string) (T, error)) (T, error) {
	raw, existing, err := s.readForWrite(ctx, userID, id)
	if err != nil {
		return existing, err
	}
	base := expected.Of(P(&existing).ver())
	next, err := build(existing, s.nowISO())
	if err != nil {
		return next, err
	}
	P(&next).setVersion(base + 1)
	_, err = s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{
		TableName:                 aws.String(s.table.Name),
		Item:                      s.storedItem(next, nil, store.OptString(raw, "createHash")),
		ConditionExpression:       aws.String(store.VersionMatchCondition),
		ExpressionAttributeValues: store.VersionMatchValues(base),
	})
	err = store.MapVersionedWriteError(err, "Update conflict ("+s.label+" version)", store.ClaimWrite{VersionIndex: -1},
		func() error { return s.versionConflict(ctx, userID, id, base) })
	return next, err
}

// softDelete writes a tombstone with a TTL, extends the create claim from
// delete time so it outlives the tombstone, and frees any unique claim.
func (s *versioned[T, P]) softDelete(ctx context.Context, userID, id string, expected api.Expected, build func(existing T, now string) T) (T, error) {
	_, existing, err := s.readForWrite(ctx, userID, id)
	if err != nil {
		return existing, err
	}
	base := expected.Of(P(&existing).ver())
	at := s.now()
	tombstone := build(existing, store.ISOTime(at))
	P(&tombstone).setVersion(base + 1)
	ttl := ttlDaysFrom(tombstoneTTLDays, at)
	// No createHash: a deleted id never replays, so its fingerprint isn't kept.
	items := []types.TransactWriteItem{
		s.put(s.storedItem(tombstone, &ttl, nil), store.VersionMatchCondition, store.VersionMatchValues(base)),
		s.put(s.createClaimItem(userID, id, P(&tombstone).updated(), ttlDaysFrom(createClaimTTLDays, at)), "", nil),
	}
	if s.claim != nil {
		items = append(items, s.claim.release(existing)...)
	}
	_, err = s.table.DB.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: items})
	err = store.MapVersionedWriteError(err, "Delete conflict ("+s.label+" version)", store.ClaimWrite{VersionIndex: -1},
		func() error { return s.versionConflict(ctx, userID, id, base) })
	return tombstone, err
}
