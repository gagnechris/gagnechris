package projects

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	p, err := parseProject(samplerows.Item("project"))
	if err != nil {
		t.Fatal(err)
	}
	apitypestest.Conforms[apitypes.Project](t, p)
	preview, demo, href := "/media/2026/10/p.png", "notebook", "https://example.com"
	p.PreviewImage, p.Demo, p.Href = &preview, &demo, &href
	p.Stack, p.Links = []string{"Go"}, []Link{{Label: "Code", URL: "https://github.com/x"}}
	apitypestest.Conforms[apitypes.Project](t, p)
	apitypestest.Conforms[apitypes.ProjectListResponse](t, listResponse{Items: []Project{p}})
}
