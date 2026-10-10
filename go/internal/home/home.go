// Package home serves the admin Home routes, writing the rows
// services/api/src/home writes.
package home

import (
	"encoding/json"
	"time"

	"github.com/gagnechris/gagnechris/go/internal/api"
	"github.com/gagnechris/gagnechris/go/internal/contract"
	"github.com/gagnechris/gagnechris/go/internal/data"
	"github.com/gagnechris/gagnechris/go/internal/keys"
	"github.com/gagnechris/gagnechris/go/internal/store"
)

const id = "current"

type Home struct {
	Name  string     `json:"name"`
	Title string     `json:"title"`
	About string     `json:"about"`
	Seo   *store.Seo `json:"seo"`
	store.Publishable
}

func parse(item data.Item) (Home, error) {
	r := store.ReadItem(item)
	r.Str("pk", 1)
	r.Str("sk", 1)
	r.Literal("entityType", "home")
	r.OptStr("homeId", 1)
	h := Home{
		Name:        r.Str("name", 1),
		Title:       r.Str("title", 0),
		About:       r.Str("about", 0),
		Seo:         store.ReadSeo(r),
		Publishable: r.Publishable(),
	}
	return h, r.Err("home")
}

func metaItem(h Home) data.Item {
	item := data.Key(keys.HomePk(), keys.SKMeta)
	item["entityType"] = data.S("home")
	item["homeId"] = data.S(id)
	item["name"] = data.S(h.Name)
	item["title"] = data.S(h.Title)
	item["about"] = data.S(h.About)
	item["status"] = data.S(h.Status)
	item["publishedAt"] = data.OptS(h.PublishedAt)
	item["updatedAt"] = data.S(h.UpdatedAt)
	item["seo"] = data.Null
	if h.Seo != nil {
		item["seo"] = data.M(store.SeoItem(h.Seo))
	}
	item["version"] = data.N(int64(h.Version))
	return item
}

func publishedItem(h Home) data.Item {
	item := metaItem(h)
	item["sk"] = data.S(keys.SKPublished)
	item["status"] = data.S(store.StatusPublished)
	return item
}

func contentEqual(a, b Home) bool {
	return a.Name == b.Name && a.Title == b.Title && a.About == b.About && store.SeoEqual(a.Seo, b.Seo)
}

func defaultHome() Home {
	var h Home
	if err := json.Unmarshal(contract.Data.Defaults.Home, &h); err != nil {
		panic("default home: " + err.Error())
	}
	return h
}

// Routes are GET and PUT /admin/home and its publish verbs.
func Routes(table *data.Table, now func() time.Time) []api.Route {
	if now == nil {
		now = time.Now
	}
	s := &store.Singleton[Home]{
		PublishableStore: store.NewPublishableStore(store.PublishableConfig[Home]{
			Label: "home",
			Keys: func(string) store.PublishKeys {
				return store.PublishKeys{PK: keys.HomePk(), MetaSK: keys.SKMeta, PublishedSK: keys.SKPublished}
			},
			ID:            func(*Home) string { return id },
			State:         func(h *Home) *store.Publishable { return &h.Publishable },
			Parse:         parse,
			MetaItem:      metaItem,
			PublishedItem: publishedItem,
			ContentEqual:  contentEqual,
		}, table, now),
		ID:      id,
		Default: defaultHome,
	}
	return store.SingletonRoutes(s, "/admin/home", "Home", readUpdate)
}

func readUpdate(v *api.Validator) func(Home) Home {
	name, setName := v.String("name", false, false, api.MinLen(1))
	title, setTitle := v.String("title", false, false)
	about, setAbout := v.String("about", false, false)
	seo, setSeo := store.ReadSeoInput(v)
	return func(h Home) Home {
		if setName {
			h.Name = name
		}
		if setTitle {
			h.Title = title
		}
		if setAbout {
			h.About = about
		}
		if setSeo {
			h.Seo = seo
		}
		return h
	}
}
