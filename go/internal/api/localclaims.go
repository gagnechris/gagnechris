package api

import (
	"os"
	"regexp"
	"strconv"
	"time"
)

// Local client ids match services/api/local/claims.ts, so the Go and Node
// servers accept the same local tokens.
var localClientIDs = map[string]string{
	"ADMIN_WEB_CLIENT_ID":    "local-admin-web",
	"NOTEBOOK_WEB_CLIENT_ID": "local-notebook-web",
	iosClientIDEnv:           "local-ios",
}

// ApplyLocalAuthEnv sets the client id variables authorize compares with,
// where they are unset.
func ApplyLocalAuthEnv() {
	for name, id := range localClientIDs {
		if envClientID(name) == "" {
			_ = os.Setenv(name, id)
		}
	}
}

var localToken = regexp.MustCompile(`^Bearer local(-ios)?:([A-Za-z0-9_-]{1,64})$`)

const localDefaultSub = "local-dev-user"

// LocalClaims is an ID token for the app that owns auth, with only that
// app's group. `Bearer local:<sub>` signs in as another user and
// `Bearer local-ios:<sub>` does the same on the iOS client; anything else is
// the default local user on the route's web client.
func LocalClaims(authorization string, auth Auth, now time.Time) map[string]string {
	policy := authPolicies[auth]
	m := localToken.FindStringSubmatch(authorization)
	aud := envClientID(policy.clientIDEnv)
	if aud == "" {
		aud = localClientIDs[policy.clientIDEnv]
	}
	if m != nil && m[1] != "" {
		if aud = envClientID(iosClientIDEnv); aud == "" {
			aud = localClientIDs[iosClientIDEnv]
		}
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
	}
	if m != nil && m[2] != localDefaultSub {
		sub := m[2]
		claims["sub"] = sub
		claims["email"] = sub + "@local.gagnechris.com"
		claims["cognito:username"] = sub
	}
	return claims
}
