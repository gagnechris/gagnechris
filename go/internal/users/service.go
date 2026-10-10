package users

import (
	"context"
	"slices"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/contract"
)

var (
	accessGroups      = contract.Data.Users.AccessGroups
	accessLevelGroups = contract.Data.Users.AccessLevelGroups
	accessLevels      = []string{"full", "cms", "notebook"}
)

const (
	groupSiteAdmin = "site-admin"
	groupNotebook  = "notebook"
)

// levelFromGroups: Full Admin needs every access group; anything less falls
// back to the CMS, then Notebook.
func levelFromGroups(groups []string) *string {
	level := ""
	switch {
	case !slices.ContainsFunc(accessGroups, func(g string) bool { return !slices.Contains(groups, g) }):
		level = "full"
	case slices.Contains(groups, groupSiteAdmin):
		level = "cms"
	case slices.Contains(groups, groupNotebook):
		level = "notebook"
	default:
		return nil
	}
	return &level
}

type ManagedUser struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      *string `json:"name"`
	Level     *string `json:"level"`
	Status    string  `json:"status"`
	CreatedAt *string `json:"createdAt"`
}

func toManagedUser(u DirectoryUser, removed *removedUser) ManagedUser {
	m := ManagedUser{ID: u.ID, Email: u.Email, Name: u.Name, CreatedAt: u.CreatedAt}
	switch {
	case removed != nil:
		m.Level, m.Status = removed.PreviousLevel, "removed"
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
	dir     Directory
	removed removedStore
	actor   string
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
		if rec == nil {
			return inviteResult{}, &conflictError{"user_exists", "Someone with this email already has an account."}
		}
		user, err := a.restore(ctx, existing.ID, &level)
		return inviteResult{User: user, Restored: true}, err
	}
	created, err := a.dir.InviteUser(ctx, email, name)
	if err != nil {
		return inviteResult{}, err
	}
	for _, group := range accessLevelGroups[level] {
		if err := a.dir.AddToGroup(ctx, created.ID, group); err != nil {
			return inviteResult{}, err
		}
	}
	user, err := a.managedUser(ctx, created.ID)
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
		if err := a.dir.SignOutEverywhere(ctx, id); err != nil {
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
	if err := a.dir.SignOutEverywhere(ctx, id); err != nil {
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
	if err := a.dir.SignOutEverywhere(ctx, id); err != nil {
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
// or their data, and is safe to retry.
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
		r := removedUser{UserID: id, Email: user.Email, PreviousLevel: levelFromGroups(user.Groups)}
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
	if err := a.dir.SignOutEverywhere(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	return a.managedUser(ctx, id)
}

func (a admin) restore(ctx context.Context, id string, level *string) (ManagedUser, error) {
	if _, err := a.requireUser(ctx, id); err != nil {
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
	if err := a.dir.EnableUser(ctx, id); err != nil {
		return ManagedUser{}, err
	}
	for _, g := range accessLevelGroups[*level] {
		if err := a.dir.AddToGroup(ctx, id, g); err != nil {
			return ManagedUser{}, err
		}
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
