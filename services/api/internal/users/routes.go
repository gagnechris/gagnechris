package users

import (
	"context"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	cip "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

type Deps struct {
	Table *data.Table
	AWS   aws.Config
	// UserPoolID is the Cognito pool the directory manages, when Directory is nil.
	UserPoolID string
	Directory  Directory
	Now        func() time.Time
}

// LocalDirectory is the local stack's stand-in for the Cognito pool.
func LocalDirectory(now func() time.Time) Directory {
	return NewMemoryDirectory(localSeed(), now)
}

// localSeed is the local fake-auth user, as a Full Admin, so the local stack
// can manage users.
func localSeed() []DirectoryUser {
	name, created := "Local Admin", "2026-01-01T00:00:00.000Z"
	return []DirectoryUser{{
		ID:        "local-dev-user",
		Email:     "local@gagnechris.com",
		Name:      &name,
		Enabled:   true,
		Status:    "CONFIRMED",
		CreatedAt: &created,
		Groups:    append([]string{}, accessGroups...),
	}}
}

type handlers struct {
	removed   removedStore
	directory func() (Directory, error)
}

func Routes(d Deps) []api.Route {
	if d.Now == nil {
		d.Now = time.Now
	}
	h := handlers{removed: removedRepo{table: d.Table, now: d.Now}}
	switch {
	case d.Directory != nil:
		h.directory = func() (Directory, error) { return d.Directory, nil }
	case d.UserPoolID == "":
		h.directory = func() (Directory, error) {
			return nil, &api.ServiceUnavailableError{Message: "User management is not configured"}
		}
	default:
		cognito := sync.OnceValue(func() *cip.Client { return cip.NewFromConfig(d.AWS) })
		h.directory = func() (Directory, error) {
			return CognitoDirectory{Client: cognito(), UserPoolID: d.UserPoolID}, nil
		}
	}

	route := func(method, pattern, metric string, handler api.Handler) api.Route {
		return api.Route{Method: method, Pattern: pattern, Auth: api.UserAdmin, Metric: metric, Handler: handler}
	}
	action := func(name, metric string, act func(admin, context.Context, string) (ManagedUser, error), sensitive bool) api.Route {
		return route(http.MethodPost, "/admin/users/:id/"+name, metric, func(ctx context.Context, r *api.Request) (*api.Response, error) {
			id, err := idParam(r)
			if err != nil {
				return nil, err
			}
			return h.run(func() (any, error) {
				if sensitive {
					if err := assertRecentSignIn(r); err != nil {
						return nil, err
					}
				}
				a, err := h.admin(r)
				if err != nil {
					return nil, err
				}
				return userResponse(act(a, ctx, id))
			})
		})
	}
	return []api.Route{
		route(http.MethodGet, "/admin/users", "UsersList", h.list),
		route(http.MethodPost, "/admin/users", "UsersInvite", h.invite),
		route(http.MethodPut, "/admin/users/:id/access", "UsersSetAccess", h.setAccess),
		action("disable", "UsersDisable", admin.disable, true),
		action("enable", "UsersEnable", admin.enable, true),
		action("sign-out", "UsersSignOut", admin.signOut, true),
		action("remove", "UsersRemove", admin.remove, true),
		action("resend-invite", "UsersResendInvite", admin.resendInvite, false),
		route(http.MethodPost, "/admin/users/:id/restore", "UsersRestore", h.restore),
	}
}

func (h handlers) admin(r *api.Request) (admin, error) {
	dir, err := h.directory()
	if err != nil {
		return admin{}, err
	}
	return admin{dir: dir, removed: h.removed, actor: r.UserID()}, nil
}

type reauthRequiredError struct{}

func (reauthRequiredError) Error() string { return "reauth required" }

// assertRecentSignIn: refresh tokens keep the original auth_time, so only a
// new sign-in passes.
func assertRecentSignIn(r *api.Request) error {
	authTime := math.NaN()
	if raw, ok := r.Claims["auth_time"]; ok {
		authTime = api.JSNumber(raw)
	}
	age := float64(time.Now().UnixMilli())/1000 - authTime
	if math.IsNaN(authTime) || math.IsInf(authTime, 0) || age > float64(contract.Data.Users.ReauthSeconds) {
		return reauthRequiredError{}
	}
	return nil
}

func (h handlers) run(work func() (any, error)) (*api.Response, error) {
	body, err := work()
	var conflict *conflictError
	switch {
	case errors.As(err, new(reauthRequiredError)):
		return api.JSON(http.StatusForbidden, map[string]string{
			"error":   contract.Data.Users.ReauthRequired,
			"message": "Confirm it’s you to change someone’s access.",
		}), nil
	case errors.As(err, &conflict):
		return api.JSON(http.StatusConflict, map[string]string{"error": conflict.code, "message": conflict.message}), nil
	case err != nil:
		return nil, err
	}
	return api.JSON(http.StatusOK, body), nil
}

func userResponse(u ManagedUser, err error) (any, error) {
	if err != nil {
		return nil, err
	}
	return map[string]ManagedUser{"user": u}, nil
}

var managedUserID = regexp.MustCompile(`^[A-Za-z0-9-]+$`)

func idParam(r *api.Request) (string, error) {
	v := api.NewQueryValidator(map[string]string{"id": r.Params["id"]})
	id, _ := v.String("id", true, false, api.MinLen(1), api.MaxLen(contract.Data.Limits.ManagedUserIDMaxLength), api.Matches(managedUserID))
	return id, v.ErrWith("Invalid path parameters")
}

func (h handlers) list(ctx context.Context, r *api.Request) (*api.Response, error) {
	return h.run(func() (any, error) {
		a, err := h.admin(r)
		if err != nil {
			return nil, err
		}
		users, err := a.list(ctx)
		return map[string][]ManagedUser{"users": users}, err
	})
}

func (h handlers) invite(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	email, ok := v.String("email", true, true)
	if ok {
		email = strings.ToLower(email)
		for _, rule := range []api.StringRule{api.Email, api.MaxLen(contract.Data.Limits.UserEmailMaxLength)} {
			if code := rule(email); code != "" {
				v.Fail("email", code)
			}
		}
	}
	name, hasName := v.String("name", false, true, api.MaxLen(contract.Data.Limits.UserNameMaxLength))
	level, _ := v.Enum("level", true, accessLevels...)
	if err := v.Err(); err != nil {
		return nil, err
	}
	var namePtr *string
	if hasName && name != "" {
		namePtr = &name
	}
	return h.run(func() (any, error) {
		if err := assertRecentSignIn(r); err != nil {
			return nil, err
		}
		a, err := h.admin(r)
		if err != nil {
			return nil, err
		}
		return a.invite(ctx, email, namePtr, level)
	})
}

func (h handlers) setAccess(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	level, _ := v.Enum("level", true, accessLevels...)
	if err := v.Err(); err != nil {
		return nil, err
	}
	id, err := idParam(r)
	if err != nil {
		return nil, err
	}
	return h.run(func() (any, error) {
		if err := assertRecentSignIn(r); err != nil {
			return nil, err
		}
		a, err := h.admin(r)
		if err != nil {
			return nil, err
		}
		return userResponse(a.setAccess(ctx, id, level))
	})
}

func (h handlers) restore(ctx context.Context, r *api.Request) (*api.Response, error) {
	v, err := api.NewValidator(r.Body)
	if err != nil {
		return nil, err
	}
	level, hasLevel := v.Enum("level", false, accessLevels...)
	if err := v.Err(); err != nil {
		return nil, err
	}
	id, err := idParam(r)
	if err != nil {
		return nil, err
	}
	var levelPtr *string
	if hasLevel {
		levelPtr = &level
	}
	return h.run(func() (any, error) {
		if err := assertRecentSignIn(r); err != nil {
			return nil, err
		}
		a, err := h.admin(r)
		if err != nil {
			return nil, err
		}
		return userResponse(a.restore(ctx, id, levelPtr))
	})
}
