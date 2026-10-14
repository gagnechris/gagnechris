package users

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

type memRemoved map[string]removedUser

func (m memRemoved) list(context.Context) ([]removedUser, error) {
	var out []removedUser
	for _, r := range m {
		out = append(out, r)
	}
	return out, nil
}

func (m memRemoved) get(_ context.Context, id string) (*removedUser, error) {
	if r, ok := m[id]; ok {
		return &r, nil
	}
	return nil, nil
}

func (m memRemoved) put(_ context.Context, r removedUser, _ string) error {
	m[r.UserID] = r
	return nil
}

func (m memRemoved) delete(_ context.Context, id string) error {
	delete(m, id)
	return nil
}

func TestLevelFromGroupsMatchesTypeScript(t *testing.T) {
	cases := contract.Data.Users.LevelCases
	if len(cases) == 0 {
		t.Fatal("no level cases in the contract")
	}
	for _, tc := range cases {
		got, want := levelFromGroups(tc.Groups), tc.Level
		if (got == nil) != (want == nil) || (got != nil && *got != *want) {
			t.Errorf("%v: %v, want %v", tc.Groups, deref(got), deref(want))
		}
	}
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestRemoveKeepsTheFirstLevelAndRestoreBringsItBack(t *testing.T) {
	ctx := context.Background()
	dir := NewMemoryDirectory(localSeed(), time.Now)
	a := admin{dir: dir, removed: memRemoved{}, actor: "owner"}
	invited, err := a.invite(ctx, "a@example.com", nil, "cms")
	if err != nil {
		t.Fatal(err)
	}
	id := invited.User.ID
	for range 2 {
		u, err := a.remove(ctx, id)
		if err != nil || u.Status != "removed" || u.Level == nil || *u.Level != "cms" {
			t.Fatalf("remove: %+v %v", u, err)
		}
	}
	var conflict *conflictError
	if _, err := a.enable(ctx, id); !errors.As(err, &conflict) || conflict.code != "user_removed" {
		t.Errorf("enable a removed user: %v", err)
	}
	u, err := a.restore(ctx, id, nil)
	if err != nil || u.Status != "invited" || *u.Level != "cms" {
		t.Errorf("restore: %+v %v", u, err)
	}
	if _, err := a.remove(ctx, "local-dev-user"); !errors.As(err, &conflict) || conflict.code != "last_full_admin" {
		t.Errorf("remove the last Full Admin: %v", err)
	}
	self := admin{dir: dir, removed: memRemoved{}, actor: id}
	if _, err := self.setAccess(ctx, id, "full"); !errors.As(err, &conflict) || conflict.code != "self_change" {
		t.Errorf("own access: %v", err)
	}
}

type failingGroups struct {
	*MemoryDirectory
	// adds is how many AddToGroup calls succeed before the rest fail; -1 never fails.
	adds int
}

func (d *failingGroups) AddToGroup(ctx context.Context, id, group string) error {
	if d.adds == 0 {
		return errors.New("cognito down")
	}
	d.adds--
	return d.MemoryDirectory.AddToGroup(ctx, id, group)
}

func TestInviteAgainFinishesAnInviteThatFailedBeforeItsGroups(t *testing.T) {
	ctx := context.Background()
	for _, tc := range []struct {
		level string
		adds  int
	}{{"cms", 0}, {"full", 0}, {"full", 1}, {"full", 2}} {
		dir := &failingGroups{MemoryDirectory: NewMemoryDirectory(localSeed(), time.Now), adds: tc.adds}
		a := admin{dir: dir, removed: memRemoved{}, actor: "owner"}
		if _, err := a.invite(ctx, "half@example.com", nil, tc.level); err == nil {
			t.Fatalf("%+v: invite with failing groups succeeded", tc)
		}
		dir.adds = -1
		got, err := a.invite(ctx, "half@example.com", nil, tc.level)
		if err != nil || got.Restored || got.User.Status != "invited" || deref(got.User.Level) != tc.level {
			t.Fatalf("%+v: retry: %+v %v", tc, got, err)
		}
		for _, level := range []string{tc.level, "notebook"} {
			var conflict *conflictError
			if _, err := a.invite(ctx, "half@example.com", nil, level); !errors.As(err, &conflict) || conflict.code != "user_exists" {
				t.Errorf("%+v: inviting a finished invite at %s: %v", tc, level, err)
			}
		}
	}
}
