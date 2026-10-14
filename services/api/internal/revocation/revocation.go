// Package revocation ends the sessions a user already holds. Cognito's
// global sign-out only revokes refresh tokens, and API Gateway keeps
// accepting an ID token until it expires, so the API refuses a user's tokens
// issued before their revocation row's time.
package revocation

import (
	"context"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/jstime"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

// CacheFor is how long an instance trusts what it read; another instance
// takes up to this long to see a new revocation.
const CacheFor = 30 * time.Second

// keepFor outlives every token issued before the revocation (ID and access
// tokens last an hour), after which the row expires.
const keepFor = 24 * time.Hour

type entry struct {
	// before is the revocation time in Unix seconds; 0 when there is none.
	before int64
	read   time.Time
}

type Store struct {
	table *data.Table
	now   func() time.Time
	mu    sync.Mutex
	seen  map[string]entry
}

func New(table *data.Table, now func() time.Time) *Store {
	if now == nil {
		now = time.Now
	}
	return &Store{table: table, now: now, seen: map[string]entry{}}
}

// Revoke refuses the user's tokens issued before now.
func (s *Store) Revoke(ctx context.Context, userID string) error {
	at := s.now()
	item := data.Key(keys.UserRevocationsPk(), keys.UserRevocationSk(userID))
	item["entityType"] = data.S("userRevocation")
	item["userId"] = data.S(userID)
	item["revokedBefore"] = data.S(jstime.ISO(at))
	item["ttl"] = data.N(at.Add(keepFor).Unix())
	if _, err := s.table.DB.PutItem(ctx, &dynamodb.PutItemInput{TableName: &s.table.Name, Item: item}); err != nil {
		return err
	}
	s.mu.Lock()
	s.seen[userID] = entry{before: at.Unix(), read: at}
	s.mu.Unlock()
	return nil
}

// Revoked reports whether a token issued at issuedAt (Unix seconds; 0 when
// unknown) was issued before the user's sessions were ended. Token times are
// whole seconds, so a token from the same second as the revocation passes.
func (s *Store) Revoked(ctx context.Context, userID string, issuedAt int64) (bool, error) {
	before, err := s.before(ctx, userID)
	if err != nil {
		return false, err
	}
	return before != 0 && issuedAt < before, nil
}

func (s *Store) before(ctx context.Context, userID string) (int64, error) {
	now := s.now()
	s.mu.Lock()
	e, ok := s.seen[userID]
	s.mu.Unlock()
	if ok && now.Sub(e.read) < CacheFor {
		return e.before, nil
	}
	res, err := s.table.DB.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: &s.table.Name,
		Key:       data.Key(keys.UserRevocationsPk(), keys.UserRevocationSk(userID)),
	})
	if err != nil {
		return 0, err
	}
	var before int64
	if res.Item != nil {
		r := store.ReadItem(res.Item)
		r.Literal("entityType", "userRevocation")
		at, perr := time.Parse(time.RFC3339Nano, r.Str("revokedBefore", 1))
		if err := r.Err("user revocation"); err != nil {
			return 0, err
		}
		if perr != nil {
			return 0, perr
		}
		before = at.Unix()
	}
	s.mu.Lock()
	// Revocations only move forward, so a later one this instance saw wins.
	if cur, ok := s.seen[userID]; ok && cur.before > before {
		before = cur.before
	}
	s.seen[userID] = entry{before: before, read: now}
	s.mu.Unlock()
	return before, nil
}
