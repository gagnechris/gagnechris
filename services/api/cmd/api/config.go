package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contact"
	"github.com/gagnechris/gagnechris/services/api/internal/media"
	"github.com/gagnechris/gagnechris/services/api/internal/noteimages"
)

// config is everything the API reads from its environment, read once at
// start so a missing value stops the process instead of failing requests.
type config struct {
	inLambda bool
	table    string
	clients  api.ClientIDs
	contact  contact.Config
	media    media.Config
	images   noteimages.Config
	// userPoolID is the Cognito pool; memoryUsers replaces it outside Lambda.
	userPoolID  string
	memoryUsers bool
	// originSecret proves a request came through CloudFront.
	originSecret string
	// Outside Lambda only.
	claimsMode api.ClaimsMode
	port       string
	outboxFile string
}

// lambdaRequired is what the API stack sets on the function.
var lambdaRequired = []string{
	"DATA_TABLE_NAME",
	"ADMIN_WEB_CLIENT_ID",
	"NOTEBOOK_WEB_CLIENT_ID",
	"IOS_CLIENT_ID",
	"SITE_BUCKET_NAME",
	"NOTEBOOK_MEDIA_BUCKET_NAME",
	"CONTACT_FROM_EMAIL",
	"CONTACT_TO_EMAIL",
	"USER_POOL_ID",
	"API_ORIGIN_SECRET",
}

func loadConfig(getenv func(string) string) (config, error) {
	env := func(name string) string { return strings.TrimSpace(getenv(name)) }
	c := config{
		inLambda: env("AWS_LAMBDA_RUNTIME_API") != "",
		table:    env("DATA_TABLE_NAME"),
		clients: api.ClientIDs{
			AdminWeb:    env("ADMIN_WEB_CLIENT_ID"),
			NotebookWeb: env("NOTEBOOK_WEB_CLIENT_ID"),
			IOS:         env("IOS_CLIENT_ID"),
		},
		contact: contact.Config{
			FromEmail:  env("CONTACT_FROM_EMAIL"),
			ToEmail:    env("CONTACT_TO_EMAIL"),
			ApexDomain: env("SITE_APEX_DOMAIN"),
		},
		media:        media.Config{Bucket: env("SITE_BUCKET_NAME")},
		images:       noteimages.Config{Bucket: env("NOTEBOOK_MEDIA_BUCKET_NAME")},
		userPoolID:   env("USER_POOL_ID"),
		originSecret: env("API_ORIGIN_SECRET"),
	}
	if c.inLambda {
		var missing []string
		for _, name := range lambdaRequired {
			if env(name) == "" {
				missing = append(missing, name)
			}
		}
		if len(missing) > 0 {
			return config{}, fmt.Errorf("missing required config: %s", strings.Join(missing, ", "))
		}
		c.contact = c.contact.WithDefaults(false)
		return c, nil
	}

	if c.table == "" {
		return config{}, errors.New("missing required config: DATA_TABLE_NAME")
	}
	if c.table == "gagnechris-prod" {
		return config{}, errors.New("refusing to serve gagnechris-prod over local HTTP")
	}
	c.claimsMode = api.ClaimsMode(env("API_CLAIMS_MODE"))
	switch c.claimsMode {
	case api.ClaimsNone:
	case api.ClaimsTest:
		// Test claims are whatever the caller sends.
		if !strings.HasPrefix(c.table, "gagnechris-it-") {
			return config{}, errors.New("the test API only serves gagnechris-it-* tables")
		}
		if c.clients.AdminWeb == "" || c.clients.NotebookWeb == "" || c.clients.IOS == "" {
			return config{}, errors.New("the test API needs ADMIN_WEB_CLIENT_ID, NOTEBOOK_WEB_CLIENT_ID and IOS_CLIENT_ID")
		}
	case api.ClaimsLocal:
		c.clients = c.clients.WithLocalDefaults()
	default:
		return config{}, fmt.Errorf("API_CLAIMS_MODE %q is not test or local", c.claimsMode)
	}

	c.port = env("PORT")
	if c.port == "" {
		c.port = "8787"
	}
	c.outboxFile = env("LOCAL_OUTBOX_FILE")
	c.contact = c.contact.WithDefaults(true)
	c.memoryUsers = env("USER_DIRECTORY") == "memory"

	if env("SITE_STORAGE") == "filesystem" {
		if c.media.Bucket == "" {
			return config{}, errors.New("SITE_STORAGE=filesystem needs SITE_BUCKET_NAME, the local site root")
		}
		c.media.Filesystem = true
		c.media.LocalOrigin = env("VITE_LOCAL_API_ORIGIN")
		if c.media.LocalOrigin == "" {
			port := env("LOCAL_API_PORT")
			if port == "" {
				port = "8787"
			}
			c.media.LocalOrigin = "http://127.0.0.1:" + port
		}
		c.images.Filesystem = true
		c.images.LocalOrigin = c.media.LocalOrigin
	}
	return c, nil
}
