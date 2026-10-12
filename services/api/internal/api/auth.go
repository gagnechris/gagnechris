package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"slices"
	"strings"
)

// Auth is who may call a route. Protected routes live under the prefixes API
// Gateway's JWT authorizer covers (infra/lib/stacks/api-stack.ts).
type Auth string

const (
	Public    Auth = "public"
	SiteAdmin Auth = "site-admin"
	UserAdmin Auth = "user-admin"
	Notebook  Auth = "notebook"
)

// ClientIDs are the Cognito app clients whose tokens the router trusts. The
// iOS app has both spaces, so its client is trusted on every prefix; the group
// still decides.
type ClientIDs struct {
	AdminWeb    string
	NotebookWeb string
	IOS         string
}

type authPolicy struct {
	prefix   string
	group    string
	clientID func(ClientIDs) string
}

func adminWeb(c ClientIDs) string    { return c.AdminWeb }
func notebookWeb(c ClientIDs) string { return c.NotebookWeb }

var authPolicies = map[Auth]authPolicy{
	SiteAdmin: {prefix: "/admin", group: "site-admin", clientID: adminWeb},
	UserAdmin: {prefix: "/admin", group: "user-admin", clientID: adminWeb},
	Notebook:  {prefix: "/notebook", group: "notebook", clientID: notebookWeb},
}

const userAdminPath = "/admin/users"

// RequiredAuth is the auth a route pattern must declare; Public for paths
// outside the protected prefixes.
func RequiredAuth(pattern string) Auth {
	under := func(prefix string) bool {
		return pattern == prefix || strings.HasPrefix(pattern, prefix+"/")
	}
	switch {
	case under(userAdminPath):
		return UserAdmin
	case under("/admin"):
		return SiteAdmin
	case under("/notebook"):
		return Notebook
	}
	return Public
}

var bracketedGroups = regexp.MustCompile(`^\[([^\[\]"]*)\]$`)

// ClaimGroups accepts a JSON array of strings or the HTTP API authorizer's
// bracketed form ("[a b]"), split on whitespace only: Cognito group names may
// contain commas. Anything else is no groups.
func ClaimGroups(raw string) []string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	if strings.HasPrefix(value, `["`) {
		var groups []string
		if json.Unmarshal([]byte(value), &groups) != nil {
			return nil
		}
		return groups
	}
	m := bracketedGroups.FindStringSubmatch(value)
	if m == nil {
		return nil
	}
	return strings.Fields(m[1])
}

// TokenClientID: ID tokens name the client in aud, access tokens in
// client_id.
func TokenClientID(claims map[string]string) string {
	switch claims["token_use"] {
	case "id":
		return claims["aud"]
	case "access":
		return claims["client_id"]
	}
	return ""
}

// authorize returns nil when claims may call a route with this auth.
func authorize(auth Auth, clients ClientIDs, claims map[string]string) *Response {
	if claims["sub"] == "" {
		return JSON(http.StatusUnauthorized, map[string]any{
			"error": "unauthorized", "message": "Missing JWT claims",
		})
	}
	policy := authPolicies[auth]
	clientID := TokenClientID(claims)
	trusted := []string{policy.clientID(clients), clients.IOS}
	if clientID != "" && slices.Contains(trusted, clientID) {
		if slices.Contains(ClaimGroups(claims["cognito:groups"]), policy.group) {
			return nil
		}
		return forbidden("Requires the " + policy.group + " group")
	}
	return forbidden("Token is not from the " + policy.prefix[1:] + " app client")
}

func forbidden(message string) *Response {
	return JSON(http.StatusForbidden, map[string]any{"error": "forbidden", "message": message})
}
