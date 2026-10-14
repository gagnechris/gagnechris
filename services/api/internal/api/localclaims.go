package api

import (
	"regexp"
	"strconv"
	"time"
)

// WithLocalDefaults fills unset ids with the aud local claims carry.
func (c ClientIDs) WithLocalDefaults() ClientIDs {
	if c.AdminWeb == "" {
		c.AdminWeb = "local-admin-web"
	}
	if c.NotebookWeb == "" {
		c.NotebookWeb = "local-notebook-web"
	}
	if c.IOS == "" {
		c.IOS = "local-ios"
	}
	return c
}

var localToken = regexp.MustCompile(`^Bearer local(-ios)?:([A-Za-z0-9_-]{1,64})$`)

const localDefaultSub = "local-dev-user"

// LocalClaims is an ID token for the app that owns auth, with only that
// app's group. `Bearer local:<sub>` signs in as another user and
// `Bearer local-ios:<sub>` does the same on the iOS client; anything else is
// the default local user on the route's web client.
func LocalClaims(authorization string, auth Auth, clients ClientIDs, now time.Time) map[string]string {
	policy := authPolicies[auth]
	m := localToken.FindStringSubmatch(authorization)
	clients = clients.WithLocalDefaults()
	aud := policy.clientID(clients)
	if m != nil && m[1] != "" {
		aud = clients.IOS
	}
	claims := map[string]string{
		"sub":              localDefaultSub,
		"email":            "local@gagnechris.com",
		"cognito:username": "local-admin",
		"token_use":        "id",
		"aud":              aud,
		"cognito:groups":   "[" + policy.group + "]",
		// Local sign-in is always fresh, so the recent-sign-in check never
		// blocks.
		"auth_time": strconv.FormatInt(now.Unix(), 10),
		"iat":       strconv.FormatInt(now.Unix(), 10),
	}
	if m != nil && m[2] != localDefaultSub {
		sub := m[2]
		claims["sub"] = sub
		claims["email"] = sub + "@local.gagnechris.com"
		claims["cognito:username"] = sub
	}
	return claims
}
