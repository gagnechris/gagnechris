# Migrate legacy posts into the CMS (CHR-36)

One-time import of the old bundled `src/posts` markdown into DynamoDB. Fixtures live under `scripts/migrate-posts/fixtures/` (recovered from git after CHR-35 removed the in-repo copies).

| Fixture                              | Status    | Slug             |
| ------------------------------------ | --------- | ---------------- |
| `welcome-to-my-blog.md`              | published | `welcome`        |
| `building-high-performing-teams.bak` | draft     | from frontmatter |
| `embracing-agentic-ai.bak`           | draft     | from frontmatter |

Idempotent: existing slugs are skipped.

## Local

```bash
npm run local:up
npm run local:bootstrap
source scripts/local/env.sh
npm run migrate:posts
```

With `SITE_STORAGE=filesystem` the script also rebuilds `.local-site/`. Or use `npm run local:dev` and confirm drafts under `/admin` and `/blog/welcome` via `/__site`.

## Production

Writes rows in `gagnechris-prod`. The publisher Lambda runs from DynamoDB Streams — no separate invoke.

Unset any local DynamoDB overrides first (`AWS_ENDPOINT_URL_DYNAMODB`, fake `AWS_ACCESS_KEY_ID`, `SITE_STORAGE`):

```bash
aws sso login --sso-session gagnechris
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN \
  AWS_ENDPOINT_URL_DYNAMODB AWS_ENDPOINT_URL SITE_STORAGE
AWS_PROFILE=gagnechris-admin \
  AWS_REGION=us-east-1 \
  DATA_TABLE_NAME=gagnechris-prod \
  CONFIRM_PROD_MIGRATE=1 \
  npm run migrate:posts
```

Then verify:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://gagnechris.com/blog/welcome/
curl -sS https://gagnechris.com/blog/posts.json | head -c 400
```

`src/posts/`, `frontmatter.ts`, and the hand-written `public/sitemap.xml` were already removed in CHR-35.
