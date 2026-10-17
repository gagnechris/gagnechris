package users

import (
	"context"
	"slices"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
)

var (
	accessGroups      = contract.Data.Users.AccessGroups
	accessLevelGroups = contract.Data.Users.AccessLevelGroups
	accessLevels      = contract.Data.Users.AccessLevels
)

// levelFromGroups is the first level, most access first, whose groups are
// all held: Full Admin needs every access group; anything less falls back to
// the CMS, then Notebook.
func levelFromGroups(groups []string) *string {
	for _, level := range accessLevels {
		if !slices.ContainsFunc(accessLevelGroups[level], func(g string) bool { return !slices.Contains(groups, g) }) {
			return &level
		}
	}
	return nil
}

type ManagedUser struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      *string `json:"name"`
	Level     *string `json:"level"`
	Status    string  `json:"status"`
	CreatedAt *string `json:"createdAt"`
	// RemovalUnfinished: removed, but a step failed, so they may still sign
	// in; running remove again finishes it.
	RemovalUnfinished bool `json:"removalUnfinished,omitempty"`
}

func holdsAccessGroup(u DirectoryUser) bool {
	return slices.ContainsFunc(u.Groups, func(g string) bool { return slices.Contains(accessGroups, g) })
}

func toManagedUser(u DirectoryUser, removed *removedUser) ManagedUser {
	m := ManagedUser{ID: u.ID, Email: u.Email, Name: u.Name, CreatedAt: u.CreatedAt}
	switch {
	case removed != nil:
		m.Level, m.Status = removed.PreviousLevel, "removed"
		m.RemovalUnfinished = removed.Pending || u.Enabled || holdsAccessGroup(u)
	case !u.Enabled:
		m.Level, m.Status = levelFromGroups(u.Groups), "disabled"
	case u.Status == invitedStatus:
		m.Level, m.Status = levelFromGroups(u.Groups), "invited"
	default:
		m.Level, m.Status = levelFromGroups(u.Groups), "active"
	}
	return m
}

func isActiveFullAdmin(u ManagedUser) bool {
	return u.Level != nil && *u.Level == "full" && u.Status != "disabled" && u.Status != "removed"
}

// conflictError is a 409 whose code the admin app shows a message for.
type conflictError struct{ code, message string }

func (e *conflictError) Error() string { return e.message }

// admin keeps the pool manageable, whatever the UI allows: nobody changes
// their own access, and at least one enabled Full Admin always remains.
type admin struct {
	dir      Directory
	removed  removedStore
	sessions Sessions
	actor    string
}

// Sessions ends the sessions a user already holds, past what signing them
// out of Cognito does.
type Sessions interface {
	Revoke(ctx context.Context, userID string) error
}

// endSessions: global sign-out stops refreshes, and the revocation refuses
// the tokens already issued.
func (a admin) endSessions(ctx context.Context, id string) error {
	if err := a.dir.SignOutEverywhere(ctx, id); err != nil {
		return err
	}
	return a.sessions.Revoke(ctx, id)
}

var byEmail = collate.New(language.Und)

func (a admin) list(ctx context.Context) ([]ManagedUser, error) {
	users, err := a.dir.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	removed, err := a.removed.list(ctx)
	if err != nil {
		return nil, err
	}
	byID := map[string]*removedUser{}
	for i := range removed {
		byID[removed[i].UserID] = &removed[i]
	}
	out := make([]ManagedUser, 0, len(users))
	for _, u := range users {
		out = append(out, toManagedUser(u, byID[u.ID]))
	}
	slices.SortStableFunc(out, func(x, y ManagedUser) int { return byEmail.CompareString(x.Email, y.Email) })
	return out, nil
}

type inviteResult struct {
	User     ManagedUser `json:"user"`
	Restored bool        `json:"restored"`
}

func (a admin) invite(ctx context.Context, email string, name *string, level string) (inviteResult, error) {
	existing, err := a.dir.FindByEmail(ctx, email)
	if err != nil {
		return inviteResult{}, err
	}
	if existing != nil {
		rec, err := a.removed.get(ctx, existing.ID)
		if err != nil {
			return inviteResult{}, err
		}
		if rec != nil {
			user, err := a.restore(ctx, existing.ID, &level)
			return inviteResult{User: user, Restored: true}, err
		}
		if !inviteUnfinished(*existing) {
			return inviteResult{}, &conflictError{"user_exists", "Someone with this email already has an account."}
		}
		return a.grantInvite(ctx, existing.ID, level)
	}
	created, err := a.dir.InviteUser(ctx, email, name)
	if err != nil {
		return inviteResult{}, err
	}
	return a.grantInvite(ctx, created.ID, level)
}

// inviteUnfinished is an invite whose account was created but which holds
// no access level yet, so inviting again finishes it. A pending invite that
// already has a level is someone else's to change through setAccess.
func inviteUnfinished(u DirectoryUser) bool {
	return u.Enabled && u.Status == invitedStatus && levelFromGroups(u.Groups) == nil
}

// grantInvite takes back the groups it added when one fails, so a failed
// invite holds no level and inviting again finishes it.
func (a admin) grantInvite(ctx context.Context, id, level string) (inviteResult, error) {
	var added []string
	for _, group := range accessLevelGroups[level] {
		if err := a.dir.AddToGroup(ctx, id, group); err != nil {
			for _, g := range added {
				_ = a.dir.RemoveFromGroup(ctx, id, g)
			}
			return inviteResult{}, err
		}
		added = append(added, group)
	}
	user, err := a.managedUser(ctx, id)
	return inviteResult{User: user}, err
}

func (a admin) setAccess(ctx context.Context, id, level string) (ManagedUser, error) {
	if err := a.assertNotSelf(id); err != nil {
		return ManagedUser{}, err
	}
	user, err := a.requireActive(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	if level != "full" {
		if err := a.assertFullAdminRemains(ctx, user); err != nil {
			return ManagedUser{}, err
		}
	}
	target := accessLevelGroups[level]
	var current []string
	for _, g := range user.Groups {
		if slices.Contains(accessGroups, g) {
			current = append(current, g)
		}
	}
	// Add before removing so a failure part-way never leaves less access than either level.
	for _, g := range target {
		if !slices.Contains(current, g) {
			if err := a.dir.AddToGroup(ctx, id, g); err != nil {
				return ManagedUser{}, err
			}
		}
	}
	dropped := 0
	for _, g := range current {
		if !slices.Contains(target, g) {
			dropped++
			if err := a.dir.RemoveFromGroup(ctx, id, g); err != nil {
				return ManagedUser{}, err
			}
		}
	}
	if dropped > 0 {
		if err := a.endSessions(ctx, id); err != nil {
			return ManagedUser{}, err
		}
	}
	return a.managedUser(ctx, id)
}

func (a admin) disable(ctx context.Context, id string) (ManagedUser, error) {
	if err := a.assertNotSelf(id); err != nil {
		return ManagedUser{}, err
	}
	user, err := a.requireActive(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	if err := a.assertFullAdminRemains(ctx, user); err != nil {
		return ManagedUser{}, err
	}
	if err := a.dir.DisableUser(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	if err := a.endSessions(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

func (a admin) signOut(ctx context.Context, id string) (ManagedUser, error) {
	if err := a.assertNotSelf(id); err != nil {
		return ManagedUser{}, err
	}
	if _, err := a.requireActive(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	if err := a.endSessions(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

func (a admin) enable(ctx context.Context, id string) (ManagedUser, error) {
	if _, err := a.requireActive(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	if err := a.dir.EnableUser(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

// remove drops every group and disables sign-in; it never deletes the user
// or their data. The record is written first, marked pending, so the level a
// restore gives back survives a failure part-way; running remove again
// finishes it.
func (a admin) remove(ctx context.Context, id string) (ManagedUser, error) {
	if err := a.assertNotSelf(id); err != nil {
		return ManagedUser{}, err
	}
	user, err := a.requireUser(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	rec, err := a.removed.get(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	if rec == nil {
		if err := a.assertFullAdminRemains(ctx, user); err != nil {
			return ManagedUser{}, err
		}
		r := removedUser{UserID: id, Email: user.Email, PreviousLevel: levelFromGroups(user.Groups), Pending: true}
		if err := a.removed.put(ctx, r, a.actor); err != nil {
			return ManagedUser{}, err
		}
	}
	for _, g := range user.Groups {
		if slices.Contains(accessGroups, g) {
			if err := a.dir.RemoveFromGroup(ctx, id, g); err != nil {
				return ManagedUser{}, err
			}
		}
	}
	if err := a.dir.DisableUser(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	if err := a.endSessions(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	if err := a.removed.finish(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

// restore gives back exactly the chosen level's groups, dropping any a
// removal that stopped part-way left behind.
func (a admin) restore(ctx context.Context, id string, level *string) (ManagedUser, error) {
	user, err := a.requireUser(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	rec, err := a.removed.get(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	if rec == nil {
		return ManagedUser{}, &conflictError{"not_removed", "This user was not removed."}
	}
	if level == nil {
		level = rec.PreviousLevel
	}
	if level == nil {
		return ManagedUser{}, api.BadRequest("Choose an access level to restore.", nil)
	}
	target := accessLevelGroups[*level]
	for _, g := range target {
		if err := a.dir.AddToGroup(ctx, id, g); err != nil {
			return ManagedUser{}, err
		}
	}
	dropped := false
	for _, g := range user.Groups {
		if slices.Contains(accessGroups, g) && !slices.Contains(target, g) {
			dropped = true
			if err := a.dir.RemoveFromGroup(ctx, id, g); err != nil {
				return ManagedUser{}, err
			}
		}
	}
	if dropped {
		if err := a.endSessions(ctx, id); err != nil {
			return ManagedUser{}, err
		}
	}
	if err := a.dir.EnableUser(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	if err := a.removed.delete(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

func (a admin) resendInvite(ctx context.Context, id string) (ManagedUser, error) {
	user, err := a.requireActive(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	if user.Status != invitedStatus {
		return ManagedUser{}, &conflictError{"not_invited", "This user has already signed in."}
	}
	if err := a.dir.ResendInvite(ctx, user.Email); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

func (a admin) assertNotSelf(id string) error {
	if id == a.actor {
		return &conflictError{"self_change", "You can't change, disable or remove your own access."}
	}
	return nil
}

func (a admin) requireUser(ctx context.Context, id string) (DirectoryUser, error) {
	user, err := a.dir.GetUser(ctx, id)
	if err != nil {
		return DirectoryUser{}, err
	}
	if user == nil {
		return DirectoryUser{}, api.NotFound("User not found")
	}
	return *user, nil
}

// requireActive: a removed user only comes back through restore.
func (a admin) requireActive(ctx context.Context, id string) (DirectoryUser, error) {
	user, err := a.requireUser(ctx, id)
	if err != nil {
		return DirectoryUser{}, err
	}
	rec, err := a.removed.get(ctx, id)
	if err != nil {
		return DirectoryUser{}, err
	}
	if rec != nil {
		return DirectoryUser{}, &conflictError{"user_removed", "This user was removed. Restore them first."}
	}
	return user, nil
}

func (a admin) assertFullAdminRemains(ctx context.Context, target DirectoryUser) error {
	if level := levelFromGroups(target.Groups); !target.Enabled || level == nil || *level != "full" {
		return nil
	}
	all, err := a.list(ctx)
	if err != nil {
		return err
	}
	for _, u := range all {
		if u.ID != target.ID && isActiveFullAdmin(u) {
			return nil
		}
	}
	return &conflictError{"last_full_admin", "There must always be at least one Full Admin."}
}

func (a admin) managedUser(ctx context.Context, id string) (ManagedUser, error) {
	user, err := a.requireUser(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	rec, err := a.removed.get(ctx, id)
	if err != nil {
		return ManagedUser{}, err
	}
	return toManagedUser(user, rec), nil
}
