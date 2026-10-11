// Package users serves Users & Access: the Cognito pool's users and their
// access groups, plus the removal records that keep a removed user's account
// and Notebook for a restore.
package users

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

type DirectoryUser struct {
	// ID is the Cognito sub; also the username, since the pool signs in by email.
	ID        string
	Email     string
	Name      *string
	Enabled   bool
	Status    string
	CreatedAt *string
	Groups    []string
}

// Directory is the user pool operations user management needs. Nothing here
// deletes a user.
type Directory interface {
	ListUsers(ctx context.Context) ([]DirectoryUser, error)
	// GetUser is nil for an unknown id.
	GetUser(ctx context.Context, id string) (*DirectoryUser, error)
	FindByEmail(ctx context.Context, email string) (*DirectoryUser, error)
	// InviteUser creates the user and sends the invite email with a temporary password.
	InviteUser(ctx context.Context, email string, name *string) (DirectoryUser, error)
	ResendInvite(ctx context.Context, email string) error
	AddToGroup(ctx context.Context, id, group string) error
	RemoveFromGroup(ctx context.Context, id, group string) error
	DisableUser(ctx context.Context, id string) error
	EnableUser(ctx context.Context, id string) error
	// SignOutEverywhere revokes refresh tokens, so the next token carries the current groups.
	SignOutEverywhere(ctx context.Context, id string) error
}

const invitedStatus = "FORCE_CHANGE_PASSWORD"

// MemoryDirectory stands in for Cognito in the local stack and tests;
// nothing persists.
type MemoryDirectory struct {
	mu    sync.Mutex
	users map[string]*DirectoryUser
	order []string
	now   func() time.Time
}

func NewMemoryDirectory(seed []DirectoryUser, now func() time.Time) *MemoryDirectory {
	d := &MemoryDirectory{users: map[string]*DirectoryUser{}, now: now}
	for _, u := range seed {
		d.put(u)
	}
	return d
}

func (d *MemoryDirectory) put(u DirectoryUser) {
	if _, ok := d.users[u.ID]; !ok {
		d.order = append(d.order, u.ID)
	}
	d.users[u.ID] = &u
}

func clone(u *DirectoryUser) DirectoryUser {
	c := *u
	c.Groups = slices.Clone(u.Groups)
	return c
}

func (d *MemoryDirectory) require(id string) (*DirectoryUser, error) {
	u, ok := d.users[id]
	if !ok {
		return nil, fmt.Errorf("no user %s", id)
	}
	return u, nil
}

func (d *MemoryDirectory) ListUsers(context.Context) ([]DirectoryUser, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := make([]DirectoryUser, 0, len(d.order))
	for _, id := range d.order {
		out = append(out, clone(d.users[id]))
	}
	return out, nil
}

func (d *MemoryDirectory) GetUser(_ context.Context, id string) (*DirectoryUser, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	u, ok := d.users[id]
	if !ok {
		return nil, nil
	}
	c := clone(u)
	return &c, nil
}

func (d *MemoryDirectory) FindByEmail(_ context.Context, email string) (*DirectoryUser, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, id := range d.order {
		if u := d.users[id]; u.Email == email {
			c := clone(u)
			return &c, nil
		}
	}
	return nil, nil
}

func (d *MemoryDirectory) InviteUser(_ context.Context, email string, name *string) (DirectoryUser, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	created := store.ISOTime(d.now())
	u := DirectoryUser{
		ID:        uuid.NewString(),
		Email:     email,
		Name:      name,
		Enabled:   true,
		Status:    invitedStatus,
		CreatedAt: &created,
		Groups:    []string{},
	}
	d.put(u)
	return clone(&u), nil
}

func (d *MemoryDirectory) ResendInvite(context.Context, string) error { return nil }

func (d *MemoryDirectory) update(id string, change func(u *DirectoryUser)) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	u, err := d.require(id)
	if err != nil {
		return err
	}
	change(u)
	return nil
}

func (d *MemoryDirectory) AddToGroup(_ context.Context, id, group string) error {
	return d.update(id, func(u *DirectoryUser) {
		if !slices.Contains(u.Groups, group) {
			u.Groups = append(u.Groups, group)
		}
	})
}

func (d *MemoryDirectory) RemoveFromGroup(_ context.Context, id, group string) error {
	return d.update(id, func(u *DirectoryUser) {
		u.Groups = slices.DeleteFunc(u.Groups, func(g string) bool { return g == group })
	})
}

func (d *MemoryDirectory) DisableUser(_ context.Context, id string) error {
	return d.update(id, func(u *DirectoryUser) { u.Enabled = false })
}

func (d *MemoryDirectory) EnableUser(_ context.Context, id string) error {
	return d.update(id, func(u *DirectoryUser) { u.Enabled = true })
}

func (d *MemoryDirectory) SignOutEverywhere(_ context.Context, id string) error {
	return d.update(id, func(*DirectoryUser) {})
}
