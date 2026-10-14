package main

import (
	"errors"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contact"
	"github.com/gagnechris/gagnechris/services/api/internal/media"
	"github.com/gagnechris/gagnechris/services/api/internal/noteimages"
)

func envOf(vars map[string]string) func(string) string {
	return func(name string) string { return vars[name] }
}

func lambdaEnv() map[string]string {
	return map[string]string{
		"AWS_LAMBDA_RUNTIME_API":     "127.0.0.1:9001",
		"DATA_TABLE_NAME":            "gagnechris-prod",
		"ADMIN_WEB_CLIENT_ID":        "admin",
		"NOTEBOOK_WEB_CLIENT_ID":     "notebook",
		"IOS_CLIENT_ID":              "ios",
		"SITE_BUCKET_NAME":           "site",
		"NOTEBOOK_MEDIA_BUCKET_NAME": "notebook-media",
		"CONTACT_FROM_EMAIL":         "from@example.com",
		"CONTACT_TO_EMAIL":           "to@example.com",
		"USER_POOL_ID":               "us-east-1_pool",
	}
}

func TestLambdaConfig(t *testing.T) {
	c, err := loadConfig(envOf(lambdaEnv()))
	if err != nil {
		t.Fatal(err)
	}
	if c.clients != (api.ClientIDs{AdminWeb: "admin", NotebookWeb: "notebook", IOS: "ios"}) {
		t.Errorf("clients %+v", c.clients)
	}
	if c.contact != (contact.Config{FromEmail: "from@example.com", ToEmail: "to@example.com", ApexDomain: "gagnechris.com"}) {
		t.Errorf("contact %+v", c.contact)
	}
	if c.media != (media.Config{Bucket: "site"}) || c.userPoolID != "us-east-1_pool" || c.memoryUsers {
		t.Errorf("media %+v, pool %q, memory %v", c.media, c.userPoolID, c.memoryUsers)
	}
	if c.images != (noteimages.Config{Bucket: "notebook-media"}) {
		t.Errorf("images %+v", c.images)
	}
}

func TestLambdaConfigRequiresEveryValue(t *testing.T) {
	for _, name := range lambdaRequired {
		vars := lambdaEnv()
		vars[name] = " "
		_, err := loadConfig(envOf(vars))
		if err == nil || !strings.Contains(err.Error(), name) {
			t.Errorf("without %s: err = %v", name, err)
		}
	}
}

func TestLocalConfig(t *testing.T) {
	c, err := loadConfig(envOf(map[string]string{
		"DATA_TABLE_NAME":            "gagnechris-local",
		"API_CLAIMS_MODE":            "local",
		"SITE_STORAGE":               "filesystem",
		"SITE_BUCKET_NAME":           "/tmp/site",
		"NOTEBOOK_MEDIA_BUCKET_NAME": "/tmp/notebook-media",
		"LOCAL_API_PORT":             "9999",
		"USER_DIRECTORY":             "memory",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.clients != (api.ClientIDs{AdminWeb: "local-admin-web", NotebookWeb: "local-notebook-web", IOS: "local-ios"}) {
		t.Errorf("clients %+v", c.clients)
	}
	if c.contact.FromEmail != "local-from@gagnechris.com" || c.contact.ToEmail != "local-to@gagnechris.com" {
		t.Errorf("contact %+v", c.contact)
	}
	if c.media != (media.Config{Bucket: "/tmp/site", Filesystem: true, LocalOrigin: "http://127.0.0.1:9999"}) {
		t.Errorf("media %+v", c.media)
	}
	if c.images != (noteimages.Config{Bucket: "/tmp/notebook-media", Filesystem: true, LocalOrigin: "http://127.0.0.1:9999"}) {
		t.Errorf("images %+v", c.images)
	}
	if !c.memoryUsers || c.port != "8787" {
		t.Errorf("memory %v, port %q", c.memoryUsers, c.port)
	}
}

func TestLocalConfigRefusals(t *testing.T) {
	cases := map[string]map[string]string{
		"no table":           {"API_CLAIMS_MODE": "local"},
		"prod table":         {"DATA_TABLE_NAME": "gagnechris-prod", "API_CLAIMS_MODE": "local"},
		"test mode, non-it":  {"DATA_TABLE_NAME": "gagnechris-local", "API_CLAIMS_MODE": "test"},
		"test mode, no ids":  {"DATA_TABLE_NAME": "gagnechris-it-x", "API_CLAIMS_MODE": "test"},
		"unknown mode":       {"DATA_TABLE_NAME": "gagnechris-local", "API_CLAIMS_MODE": "prod"},
		"filesystem no root": {"DATA_TABLE_NAME": "gagnechris-local", "API_CLAIMS_MODE": "local", "SITE_STORAGE": "filesystem"},
	}
	for name, vars := range cases {
		if _, err := loadConfig(envOf(vars)); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestMainExitsOnMissingConfig(t *testing.T) {
	if os.Getenv("API_MAIN_SUBPROCESS") == "1" {
		main()
		return
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestMainExitsOnMissingConfig$")
	env := []string{"API_MAIN_SUBPROCESS=1", "PATH=" + os.Getenv("PATH")}
	for name, value := range lambdaEnv() {
		if name != "USER_POOL_ID" {
			env = append(env, name+"="+value)
		}
	}
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("main did not exit with an error: %v\n%s", err, out)
	}
	if !strings.Contains(string(out), "missing required config: USER_POOL_ID") {
		t.Errorf("output %q", out)
	}
}
