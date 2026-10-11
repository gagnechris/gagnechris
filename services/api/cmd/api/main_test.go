package main

import (
	"encoding/json"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"

	"github.com/gagnechris/gagnechris/services/api/internal/data"
)

var patternParam = regexp.MustCompile(`:([A-Za-z_][A-Za-z0-9_]*)\+?`)

func TestRoutesMatchOpenAPI(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/shared/openapi/openapi.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	var spec []string
	for path, methods := range doc.Paths {
		for method := range methods {
			if !strings.HasPrefix(method, "x-") {
				spec = append(spec, strings.ToUpper(method)+" "+path)
			}
		}
	}
	var served []string
	for _, r := range allRoutes(&data.Table{}, nil, aws.Config{Region: "us-east-1"}) {
		served = append(served, r.Method+" /api"+patternParam.ReplaceAllString(r.Pattern, "{$1}"))
	}
	sort.Strings(spec)
	sort.Strings(served)
	if strings.Join(spec, "\n") != strings.Join(served, "\n") {
		t.Errorf("routes and OpenAPI operations differ\nroutes:\n%s\nopenapi:\n%s", strings.Join(served, "\n"), strings.Join(spec, "\n"))
	}
}
