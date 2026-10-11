# Hi, I'm Chris 👋

Hands-on Engineering Leader at [Ro](https://ro.co).

I build healthy teams that own their work and can operate independently. I also spend a lot of time helping teams figure out where AI can genuinely make their work better, without losing sight of quality.

### What I'm focused on

- AI in engineering teams
- Engineering culture
- Shipping quality software

### Links

🌐 [gagnechris.com](https://gagnechris.com) · ✍️ [Posts](https://gagnechris.com/posts) · 📄 [Resume](https://gagnechris.com/resume) · 💼 [LinkedIn](https://www.linkedin.com/in/christophergagne/) · [RSS](https://gagnechris.com/rss.xml)

---

**→ [Project documentation](https://github.com/gagnechris/gagnechris/blob/main/docs/README.md)** (architecture, local quickstart, CMS)

This repo is the source for [gagnechris.com](https://gagnechris.com).

### Go backend

The HTTP API behind the admin, the Notebook web app and the iOS app is Go, running as one AWS Lambda behind API Gateway ([`services/api/`](https://github.com/gagnechris/gagnechris/tree/main/services/api)):

- `services/api/cmd/api` is the entry point; it serves Lambda events in prod and plain HTTP locally.
- `services/api/internal/api` is a small router with auth, error bodies, gzip, request logs and metrics. Each route group (posts, projects, home, resume, search, Notebook, users, media, contact) is its own package.
- `services/api/internal/store` holds the DynamoDB patterns: optimistic versioning, transactions and cursor paging.
- The request and response types are generated from the OpenAPI spec (oapi-codegen), and the item schemas, key formats and limits from the TypeScript packages, so the Go code and the web and iOS clients share one contract. CI fails when they drift.
- A black-box HTTP suite (`services/api/test/http`) runs the API against DynamoDB Local on every PR.

The web apps, the iOS app and the publisher (which prerenders the public site with React) are TypeScript.

Code is [MIT](https://github.com/gagnechris/gagnechris/blob/main/LICENSE); blog posts, resume, bio, photos, and artwork are [© Chris Gagne, all rights reserved](https://github.com/gagnechris/gagnechris/blob/main/CONTENT-LICENSE).
