package api

import (
	"encoding/json"
	"net/http"
	"os"
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

type authPolicy struct {
	prefix      string
	group       string
	clientIDEnv string
	trustsIOS   bool
}

const iosClientIDEnv = "IOS_CLIENT_ID"

var authPolicies = map[Auth]authPolicy{
	SiteAdmin: {prefix: "/admin", group: "site-admin", clientIDEnv: "ADMIN_WEB_CLIENT_ID"},
	UserAdmin: {prefix: "/admin", group: "user-admin", clientIDEnv: "ADMIN_WEB_CLIENT_ID"},
	Notebook:  {prefix: "/notebook", group: "notebook", clientIDEnv: "NOTEBOOK_WEB_CLIENT_ID", trustsIOS: true},
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

func envClientID(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

// authorize returns nil when claims may call a route with this auth.
func authorize(auth Auth, claims map[string]string) *Response {
	if claims["sub"] == "" {
		return JSON(http.StatusUnauthorized, map[string]any{
			"error": "unauthorized", "message": "Missing JWT claims",
		})
	}
	policy := authPolicies[auth]
	clientID := TokenClientID(claims)
	trusted := []string{envClientID(policy.clientIDEnv)}
	if policy.trustsIOS {
		trusted = append(trusted, envClientID(iosClientIDEnv))
	}
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
