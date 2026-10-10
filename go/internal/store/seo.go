package store

import (
	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/data"
)

// Seo is PostSeoSchema, which posts, Home and Resume share.
type Seo struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	OgImage     *string `json:"ogImage,omitempty"`
}

func ReadSeo(r *ItemReader) *Seo {
	m := r.OptMap("seo")
	if m == nil {
		return nil
	}
	return &Seo{Title: m.OptStr("title", 0), Description: m.OptStr("description", 0), OgImage: m.OptStr("ogImage", 0)}
}

func SeoItem(seo *Seo) data.Item {
	m := data.Item{}
	for k, v := range map[string]*string{"title": seo.Title, "description": seo.Description, "ogImage": seo.OgImage} {
		if v != nil {
			m[k] = data.S(*v)
		}
	}
	return m
}

func OptEqual(a, b *string) bool {
	return (a == nil) == (b == nil) && (a == nil || *a == *b)
}

func SeoEqual(a, b *Seo) bool {
	if a == nil || b == nil {
		return a == b
	}
	return OptEqual(a.Title, b.Title) && OptEqual(a.Description, b.Description) && OptEqual(a.OgImage, b.OgImage)
}

// ReadSeoInput reads PostSeoSchema.nullable().optional().
func ReadSeoInput(v *api.Validator) (seo *Seo, present bool) {
	sub, present := v.Object("seo", true)
	if sub == nil {
		return nil, present
	}
	seo = &Seo{}
	for key, dst := range map[string]**string{"title": &seo.Title, "description": &seo.Description, "ogImage": &seo.OgImage} {
		if s, ok := sub.String(key, false, false); ok {
			*dst = &s
		}
	}
	return seo, true
}
