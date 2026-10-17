package users

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	active := toManagedUser(localSeed()[0], nil)
	invited := toManagedUser(DirectoryUser{ID: "u2", Email: "b@example.com", Enabled: true, Status: invitedStatus}, nil)
	removed := toManagedUser(DirectoryUser{ID: "u3", Email: "c@example.com"}, &removedUser{UserID: "u3", PreviousLevel: active.Level})

	unfinished := toManagedUser(DirectoryUser{ID: "u4", Email: "d@example.com", Enabled: true}, &removedUser{UserID: "u4", PreviousLevel: active.Level, Pending: true})

	apitypestest.Conforms[apitypes.GetAPIAdminUsers200JSONResponseBody](t, map[string][]ManagedUser{"users": {active, invited, removed, unfinished}})
	user, _ := userResponse(active, nil)
	apitypestest.Conforms[apitypes.PutAPIAdminUsersIDAccess200JSONResponseBody](t, user)
	apitypestest.Conforms[apitypes.PostAPIAdminUsers200JSONResponseBody](t, inviteResult{User: invited, Restored: false})
}
