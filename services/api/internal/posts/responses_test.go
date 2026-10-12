package posts

import (
	"testing"

	"github.com/gagnechris/gagnechris/services/api/internal/apitypes"
	"github.com/gagnechris/gagnechris/services/api/internal/apitypes/apitypestest"
	"github.com/gagnechris/gagnechris/services/api/internal/contract/samplerows"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

func TestResponsesMatchGeneratedTypes(t *testing.T) {
	p, err := parseMeta(samplerows.Item("postTagged"))
	if err != nil {
		t.Fatal(err)
	}
	apitypestest.Conforms[apitypes.Post](t, p)
	cover, seoTitle := "/media/2026/10/cover.png", "Hello"
	p.CoverImage, p.Seo = &cover, &store.Seo{Title: &seoTitle}
	apitypestest.Conforms[apitypes.Post](t, p)

	summary := Summary{ID: p.ID, Slug: p.Slug, Title: p.Title, Tags: []string{"go"}, ProjectIDs: p.ProjectIDs, Publishable: p.Publishable}
	apitypestest.Conforms[apitypes.GetAPIAdminPosts200JSONResponseBody](t, listResponse{
		Items: []Summary{summary}, NextCursor: "cursor", Counts: &counts{All: 1, Published: 1},
	})
	apitypestest.Conforms[apitypes.GetAPIAdminPosts200JSONResponseBody](t, listResponse{Items: []Summary{}})
}
