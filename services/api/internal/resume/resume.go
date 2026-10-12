// Package resume serves the admin Resume routes, writing the rows the
// @gagnechris/data builders define.
package resume

import (
	"encoding/json"
	"reflect"
	"regexp"
	"time"

	"github.com/gagnechris/gagnechris/services/api/internal/api"
	"github.com/gagnechris/gagnechris/services/api/internal/contract"
	"github.com/gagnechris/gagnechris/services/api/internal/data"
	"github.com/gagnechris/gagnechris/services/api/internal/keys"
	"github.com/gagnechris/gagnechris/services/api/internal/store"
)

const id = "current"

// Content is ResumeContentSchema's output, kept as decoded JSON so it is
// stored and returned field for field.
type Content = map[string]any

type Resume struct {
	Name    string     `json:"name"`
	PdfPath string     `json:"pdfPath"`
	Content Content    `json:"content"`
	Seo     *store.Seo `json:"seo"`
	store.Publishable
}

var month = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

func optString(v *api.Validator, out map[string]any, key string, rules ...api.StringRule) {
	if s, ok := v.String(key, false, false, rules...); ok {
		out[key] = s
	}
}

func strings(v *api.Validator, out map[string]any, key string) {
	if l, ok := v.StringArray(key, true, false, -1); ok {
		out[key] = l
	}
}

// readContent checks ResumeContentSchema at key and returns the parsed
// value, unknown keys dropped; nil when the field is missing or invalid.
func readContent(v *api.Validator, key string, required bool) Content {
	cv := v.Struct(key, required)
	if cv == nil {
		return nil
	}
	c := Content{}
	optString(cv, c, "headline")
	if n, ok := cv.Int("earlierRolesThrough", false, api.MinInt(contract.Data.Limits.ResumeYearMin), api.MaxInt(contract.Data.Limits.ResumeYearMax)); ok {
		c["earlierRolesThrough"] = n
	}
	if s, ok := cv.String("summary", true, false); ok {
		c["summary"] = s
	}
	strings(cv, c, "competencies")
	experience := []any{}
	if cv.ObjectArray("experience", true, -1, func(ev *api.Validator) {
		e := map[string]any{}
		for _, k := range []string{"title", "company"} {
			if s, ok := ev.String(k, true, false); ok {
				e[k] = s
			}
		}
		strings(ev, e, "bullets")
		start, hasStart := ev.String("start", false, false, api.Matches(month))
		if hasStart {
			e["start"] = start
		}
		end, hasEnd := ev.NullableString("end", api.Matches(month))
		if hasEnd {
			e["end"] = nil
			if end != nil {
				e["end"] = *end
			}
		}
		optString(ev, e, "note")
		if ev.Clean() && end != nil {
			if !hasStart {
				ev.Fail("end", api.CodeCustom)
			} else if *end < start {
				ev.Fail("end", api.CodeCustom)
			}
		}
		experience = append(experience, e)
	}) {
		c["experience"] = experience
	}
	strings(cv, c, "skills")
	education := []any{}
	if cv.ObjectArray("education", true, -1, func(ev *api.Validator) {
		e := map[string]any{}
		for _, k := range []string{"title", "institution", "location", "year"} {
			if s, ok := ev.String(k, true, false); ok {
				e[k] = s
			}
		}
		optString(ev, e, "degreeDetail")
		education = append(education, e)
	}) {
		c["education"] = education
	}
	return normalize(c)
}

// normalize round-trips c through JSON so it compares and stores like a
// value read back from DynamoDB.
func normalize(c Content) Content {
	b, err := json.Marshal(c)
	if err != nil {
		panic(err)
	}
	var out Content
	if err := json.Unmarshal(b, &out); err != nil {
		panic(err)
	}
	return out
}

func parse(item data.Item) (Resume, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "resume")
	r.OptStr("resumeId", 1)
	res := Resume{
		Name:        r.Str("name", 1),
		PdfPath:     r.Str("pdfPath", 1),
		Seo:         store.ReadSeo(r),
		Publishable: r.Publishable(),
	}
	if c, ok := r.Checked("content", func(v *api.Validator) any { return readContent(v, "content", true) }).(Content); ok {
		res.Content = c
	}
	return res, r.Err("resume")
}

func metaItem(res Resume) data.Item {
	item := data.Key(keys.ResumePk(), keys.SKMeta)
	item["entityType"] = data.S("resume")
	item["resumeId"] = data.S(id)
	item["name"] = data.S(res.Name)
	item["pdfPath"] = data.S(res.PdfPath)
	item["content"] = data.FromJSON(res.Content)
	item["status"] = data.S(res.Status)
	item["publishedAt"] = data.OptS(res.PublishedAt)
	item["updatedAt"] = data.S(res.UpdatedAt)
	item["seo"] = data.Null
	if res.Seo != nil {
		item["seo"] = data.M(store.SeoItem(res.Seo))
	}
	item["version"] = data.N(int64(res.Version))
	return item
}

func publishedItem(res Resume) data.Item {
	item := metaItem(res)
	item["sk"] = data.S(keys.SKPublished)
	item["status"] = data.S(store.StatusPublished)
	return item
}

func contentEqual(a, b Resume) bool {
	return a.Name == b.Name && a.PdfPath == b.PdfPath && reflect.DeepEqual(a.Content, b.Content) && store.SeoEqual(a.Seo, b.Seo)
}

func defaultResume() Resume {
	var res Resume
	if err := json.Unmarshal(contract.Data.Defaults.Resume, &res); err != nil {
		panic("default resume: " + err.Error())
	}
	return res
}

// Routes are GET and PUT /admin/resume and its publish verbs.
func Routes(table *data.Table, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	s := &store.Singleton[Resume]{
		PublishableStore: store.NewPublishableStore(store.PublishableConfig[Resume]{
			Label: "resume",
			Keys: func(string) store.PublishKeys {
				return store.PublishKeys{PK: keys.ResumePk(), MetaSK: keys.SKMeta, PublishedSK: keys.SKPublished}
			},
			ID:            func(*Resume) string { return id },
			State:         func(r *Resume) *store.Publishable { return &r.Publishable },
			Parse:         parse,
			MetaItem:      metaItem,
			PublishedItem: publishedItem,
			ContentEqual:  contentEqual,
		}, table, now),
		ID:      id,
		Default: defaultResume,
	}
	return store.SingletonRoutes(s, "/admin/resume", "Resume", readUpdate)
}

func readUpdate(v *api.Validator) func(Resume) Resume {
	name, setName := v.String("name", false, false, api.MinLen(1))
	pdfPath, setPdfPath := v.String("pdfPath", false, false, api.MinLen(1))
	content := readContent(v, "content", false)
	seo, setSeo := store.ReadSeoInput(v)
	return func(res Resume) Resume {
		if setName {
			res.Name = name
		}
		if setPdfPath {
			res.PdfPath = pdfPath
		}
		if content != nil {
			res.Content = content
		}
		if setSeo {
			res.Seo = seo
		}
		return res
	}
}
