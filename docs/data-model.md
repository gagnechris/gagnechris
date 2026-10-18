# Data model (single-table DynamoDB)

Shared table for Blog CMS posts, projects and Notebook entities. Table name:
`gagnechris-<env>` (prod: `gagnechris-prod`).

Attribute names are lowercase. Keys use string partition/sort values with `#`
separators so entity types never collide.

**Key builders, item zod schemas, and mappers** live in `@gagnechris/data`
(`packages/data`). The publisher, ops tools, infra, the Go contract generator
and tests import those helpers; the Go API builds keys with
`services/api/internal/keys`, which `keys_test.go` holds to the builders
through the generated contract. Do not hard-code
`POST#…`, `PROJECT#…`, `META`, `PUBLISHED`, `HOME#current`, or `RESUME#current`
in application code.

## Keys

| Attribute           | Role                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `pk`                | Partition key                                                                                            |
| `sk`                | Sort key                                                                                                 |
| `gsi1pk` / `gsi1sk` | GSI1 — list by status (posts by date, projects by order)                                                 |
| `gsi2pk` / `gsi2sk` | GSI2 — Notebook tasks-for-note (`USER#<sub>#NOTE#<id>#TASKS`)                                            |
| `syncPk` / `syncSk` | GSI3 — sparse per-user sync feed (one META row per synced entity)                                        |
| `entityType`        | Discriminator (`post`, `slug`, `project`, `resume`, `home`, `contact`, `removedUser`, `note`, `task`, …) |

All three GSIs project `ALL`. The table definition (`APP_TABLE` in
`packages/data/src/table.ts`) is shared by CDK and the local bootstrap.

Billing: on-demand. Streams: `NEW_AND_OLD_IMAGES` (publisher). TTL attribute:
`ttl`. PITR and deletion protection on, plus a daily AWS Backup with 7-day
retention. Removal policy: `RETAIN`.

## Posts

Immutable id: `postId` (ULID). Public URL slug is mutable; uniqueness and
redirects use dedicated items.

### Items

#### `POST#<postId>` / `META` — editable draft

| Attr                               | Notes                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `slug`                             | Current draft slug                                                                          |
| `title`, `excerpt`, `bodyMarkdown` | Draft content                                                                               |
| `tags`                             | `string[]`                                                                                  |
| `projectIds`                       | `string[]` of project ids (optional; missing reads as `[]`). The API rejects unknown ids    |
| `status`                           | `draft` \| `published` \| `deleted` (soft delete). `published` means a live snapshot exists |
| `publishedAt`                      | ISO-8601 when first published; kept on unpublish                                            |
| `updatedAt`                        | ISO-8601                                                                                    |
| `coverImage`                       | Optional `/media/...` path                                                                  |
| `seo`                              | Optional map: `title`, `description`, `ogImage` overrides                                   |
| `version`                          | Number for optimistic concurrency                                                           |
| `hasUnpublishedChanges`            | Boolean, written on every META write: published and the content differs from `PUBLISHED`    |
| `gsi1pk`                           | `STATUS#<status>`                                                                           |
| `gsi1sk`                           | `TS#<sortTs>#POST#<postId>` — `sortTs` is `publishedAt` when published, else `updatedAt`    |

Admin autosave writes **only** this item. Edits never change the live site.

#### `POST#<postId>` / `PUBLISHED` — live snapshot

Written only on `POST .../publish`. Same content attrs as META (no `hasUnpublishedChanges`, no GSI1 keys —
admin `STATUS#published` queries stay unique to META). The publisher stream
filter is `sk = PUBLISHED`, so draft META updates never invoke the Lambda.
`unpublish` / soft-delete removes this item.

#### `SLUG#<slug>` / `POST` — uniqueness + lookup

| Attr         | Notes              |
| ------------ | ------------------ |
| `postId`     | Owner of this slug |
| `entityType` | `slug`             |

Create/rename: conditional `PutItem` with `attribute_not_exists(pk)` so two
posts cannot claim the same slug. A post holds the claim on its draft slug and,
while it has a `PUBLISHED` row, on the live slug too: a draft rename keeps the
live URL reserved until publish, unpublish, discard or delete releases it.

#### `SLUG#<oldSlug>` / `REDIRECT` — rename / soft URL keep

| Attr         | Notes                       |
| ------------ | --------------------------- |
| `targetSlug` | Current slug to redirect to |
| `postId`     | Owning post                 |
| `entityType` | `slugRedirect`              |

On rename: write `REDIRECT` for the old slug, claim `SLUG#new` / `POST`,
release the old claim unless it is the live slug, update `META.slug`. The publisher reads `REDIRECT` by slug when it would
delete the page at an old published slug: if the row's `postId` is
published, it leaves a redirect page there instead (see Architecture,
request flow), which the edge serves as a 301 to the post's current slug. A
redirected slug is not reserved: another post can claim it, and its page
then replaces the redirect. When the post is unpublished or deleted, the next
publish scans every page under `blog/` and deletes the redirects it owned.

The API's post and project responses carry `publishedSlug` (derived, never
stored) while the draft slug differs from the live one, so View live opens the
live page; `projectLiveHref` and `postLivePath` in `@gagnechris/shared` pick
the URL.

### Access patterns (posts)

| Need                    | How                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Get by `postId`         | `BatchGetItem` `POST#id` / `META` and `PUBLISHED` (compared for `hasUnpublishedChanges`)                                                                                                                           |
| List all (admin)        | Query GSI1 `STATUS#published` then `STATUS#draft` (META only, summary attributes via `ProjectionExpression`), page in that order; the flag comes from META, and a META row without it is compared with `PUBLISHED` |
| Search / count (admin)  | Same queries; `q` is matched in the API on the projected rows (reads 200 rows at a time, stops at the page limit). Counts are `Select: COUNT` on each status partition                                             |
| List published by date  | GSI1 `STATUS#published` ids ∪ `SITE#publish` `postIds` → `BatchGet` `PUBLISHED`                                                                                                                                    |
| Enforce slug uniqueness | Conditional put on `SLUG#` / `POST`                                                                                                                                                                                |
| Soft delete             | Set META `status=deleted`, delete `PUBLISHED`, drop slug claims                                                                                                                                                    |
| Publish / discard       | Publish copies META → `PUBLISHED`; discard copies `PUBLISHED` → META                                                                                                                                               |

### Tags

A post's `tags` live only on its META and `PUBLISHED` rows; there is no
per-tag index. A table may still hold `TAG#<tag>` /
`TS#<publishedAt>#POST#<postId>` rows (`entityType` `tagIndex`), which nothing
reads; `scripts/migrate-tag-rows.ts` deletes them (see `infra/RUNBOOK.md`).

## Projects

Immutable id: `projectId` (ULID). Same draft / published split, slug claims and
soft delete as posts, through the Go `projects` package
(`services/api/internal/projects`, on `store.PublishableStore`).
Admin-only API: `/api/admin/projects*` (`site-admin`); the public side is
the publisher's static `/projects` pages.

#### `PROJECT#<projectId>` / `META` — editable draft

| Attr                                                                     | Notes                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `slug`                                                                   | URL slug (`/projects/<slug>`), claimed in its own partition                                               |
| `name`, `pitch`                                                          | Name and one-line pitch                                                                                   |
| `stage`                                                                  | `idea` \| `building` \| `live` (not `status`, which is the publish status)                                |
| `stageNote`                                                              | Short note shown with the stage, e.g. `since 2026`                                                        |
| `previewImage`                                                           | `/media/...` path or `null`                                                                               |
| `bodyMarkdown`                                                           | Page body (why / how sections); a list of `**Label** value` items renders as label/value rows             |
| `stack`                                                                  | `string[]`, trimmed and de-duplicated                                                                     |
| `links`                                                                  | `{ label, url }[]`; `url` is a site path or an `http`, `https`, `mailto` or `tel` URL (as in post bodies) |
| `demo`                                                                   | `posts` \| `notebook` \| `null`                                                                           |
| `order`                                                                  | Integer 0–999999; lists sort by it, then name                                                             |
| `href`                                                                   | Site path or `https` URL, or `null`. When set the card links here and no project page is generated        |
| `status`, `publishedAt`, `updatedAt`, `version`, `hasUnpublishedChanges` | As for posts                                                                                              |
| `gsi1pk`                                                                 | `PROJECT_STATUS#<status>` (never posts' `STATUS#…`, so the published-posts query never sees projects)     |
| `gsi1sk`                                                                 | `ORDER#<order, 6 digits>#PROJECT#<projectId>`                                                             |

#### `PROJECT#<projectId>` / `PUBLISHED` — live snapshot

Same content attrs, no GSI1 keys. Written on publish, deleted on unpublish and
soft delete. A draft may have a `demo` with no `previewImage`, but publishing
it is a 400 with `fields.previewImage = 'required_with_demo'`
(`projectPublishFieldErrors` in `packages/shared/src/projects.ts`, which the
admin editor uses to block Publish too). The publisher reads only these rows (`ConsistentRead`), after
listing ids from GSI1 `PROJECT_STATUS#published` and the `SITE#publish` `projectIds`.

#### `PROJECT_SLUG#<slug>` / `PROJECT` and `PROJECT_SLUG#<oldSlug>` / `REDIRECT`

Slug claim (`entityType` `projectSlug`, `projectId`) and rename redirect
(`projectSlugRedirect`, `targetSlug`), written in the same transaction as META
exactly as for posts, and served the same way (`projectId`). A separate
partition from `SLUG#…`, so a project and a post can share a slug and their
redirect rows never collide.

### Pages

A published project has a page at `/projects/<slug>` unless `href` is set or it
is an `idea` with an empty body (`projectHasPage` in `@gagnechris/shared`).
Either way it is listed on `/projects`; `projectCardHref` gives the card's link
(`href`, the page, or none). Only projects with a page are in `sitemap.xml`.
Don't Feed the Bears is the `href` case: its card links to
`/dont-feed-the-bears` and there is no `/projects/dont-feed-the-bears`.

A post's `projectIds` tag it to projects. Ids rather than slugs, so a slug
rename keeps the tag: the publisher resolves ids to the current slug and name
when it renders. A project page's Build log lists the published posts tagged
with it, newest first, and a tagged post's page shows "Part of" with a link to
each published project (`projectCardHref`: its page, its `href`, or plain text
for an idea with no page).

## Resume (singleton)

Editable draft plus an optional live snapshot.

#### `RESUME#current` / `META` — editable draft

| Attr                                            | Notes                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `entityType`                                    | `resume`                                                                                   |
| `resumeId`                                      | `current`                                                                                  |
| `name`                                          | Display name in the page header                                                            |
| `pdfPath`                                       | Always `/resume.pdf` in practice; publisher regenerates that object via pdf-lib on publish |
| `content`                                       | `ResumeContentSchema` (below)                                                              |
| `seo`                                           | Optional overrides map, or `null`                                                          |
| `status`, `publishedAt`, `updatedAt`, `version` | As for posts (no `hasUnpublishedChanges` attribute)                                        |

`content` holds `summary`, `competencies`, `experience`, `skills`,
`education`, plus optional `headline` (current role) and
`earlierRolesThrough` (cut-off year: roles that ended in or before it are "earlier
roles"). Each `experience` entry is `title`, `company` (bare name), `start`
and `end` (`YYYY-MM`; `end: null` is present), optional `note` (for example
"contract, concurrent") and `bullets`. An entry without `start` keeps its
dates inside `company` (`Ro | July 2019 - Present`); it parses, and
`scripts/migrate-resume-dates.ts` moves the dates into `start`/`end`. The PDF renders entries as `Company | Month YYYY - Month YYYY`;
the page puts `Mon YYYY – Mon YYYY` in a date column and reads old-shape rows
through the same parser. With `earlierRolesThrough` set, roles whose `end` year
is on or before it collapse under "Earlier roles, <first start year>–<cut-off>";
unset, every role is expanded. Each `education` entry is `title`,
`institution`, `location`, optional `degreeDetail`, and a free-text `year` (a
single completion date, no range), shown in the date column as stored.

No GSI keys. `GET /api/admin/resume` seeds META as a **draft** from
`DEFAULT_RESUME` on first read. Publish copies META → `PUBLISHED` (and
triggers PDF regeneration). Unpublish deletes `PUBLISHED`; the publisher then
replaces `resume/index.html` with a "Resume available on request" page and
deletes `resume.pdf`. A corrupt `PUBLISHED` row leaves both in place.

#### `RESUME#current` / `PUBLISHED` — live snapshot

Same content attrs as META. Publisher reads only this item.

## Home (singleton)

Same draft / published split as the resume.

#### `HOME#current` / `META` — editable draft

| Attr                                            | Notes                                               |
| ----------------------------------------------- | --------------------------------------------------- |
| `entityType`                                    | `home`                                              |
| `homeId`                                        | `current`                                           |
| `name`                                          | Header name (`<h1>`)                                |
| `title`                                         | Header subtitle, e.g. `Engineering Leader`          |
| `about`                                         | About Me body text; blank lines separate paragraphs |
| `seo`                                           | Optional overrides map, or `null`                   |
| `status`, `publishedAt`, `updatedAt`, `version` | As for posts                                        |

`GET /api/admin/home` seeds META as a **draft** from `DEFAULT_HOME`. Publish
writes `HOME#current` / `PUBLISHED`; unpublish deletes it. On publish the
publisher also writes `home/last-published.json` (and `home/index.json`, the iOS
app's name, title and about, on every Home render); when `PUBLISHED` is missing
or corrupt it re-renders `index.html` from that snapshot. With no snapshot, a
missing Home renders `DEFAULT_HOME` (what the SPA falls back to) and a corrupt
one leaves `index.html` alone.

`index.html` also lists the three newest published posts (Recent posts) and
the first two published projects by `order` that are not ideas, so the home
target runs on every post and project publish, unpublish and delete as well as
on Home changes. It reads the same catalogs as `posts.json` and `/projects`.
When the rendered bytes are unchanged (a body edit, or an edit to a post
outside the top three) nothing is written and `/` is not invalidated. With no
posts the section is left out.

#### `HOME#current` / `PUBLISHED` — live snapshot

Publisher reads only this item.

Web deploy uploads a pristine `_shell.html` (raw Vite shell) plus `index.html`
(home meta shell), then invokes `republishAll`, which reads `_shell.html` and
writes the home prerender into `index.html`. Home-only head tags therefore
cannot leak into `/posts` or `/resume`. The hero's links sentence is defined
once in `@gagnechris/shared` (`HOME_LINKS_SENTENCE`, also exported from
`@gagnechris/shared/render`); the `@gagnechris/public-ui` home body renders it
with `PublicLink` (tracked links), and the publisher renders that same
component server-side while the public app hydrates it, so SPA navigation and
GA4 click events stay intact. The site header and footer around every page
come from `@gagnechris/public-ui` (see [architecture.md](./architecture.md#public-pages)).
The prerender footer year is fixed at publish time; the SPA uses the live year.

## Site publish row

#### `SITE#publish` / `META`

One row, updated in the same transaction as every write or delete of a post,
project, home or resume `PUBLISHED` row (`sitePublishUpdate` in
`services/api/internal/store/publishable.go`; the publisher reads it with
`parseSitePublishItem` from `@gagnechris/data`). Its sort key is not `PUBLISHED`, so the publisher stream
filter ignores it.

| Attribute    | Type          | Notes                                                              |
| ------------ | ------------- | ------------------------------------------------------------------ |
| `entityType` | `sitePublish` |                                                                    |
| `generation` | number        | +1 on every publish, unpublish and soft delete; missing reads as 0 |
| `postIds`    | string set    | Posts with a `PUBLISHED` row (absent when empty)                   |
| `projectIds` | string set    | Projects with a `PUBLISHED` row (absent when empty)                |

The publisher reads it with `ConsistentRead`: `generation` tells a rebuild
whether a commit landed while it ran, and the id sets list just-published
items GSI1 has not indexed yet. Ids are added only by publishes made through
`store.PublishableStore` (`services/api/internal/store/publishable.go`), so the
publisher still unions them with GSI1.

## Contact messages

Public contact form submissions are persisted before SES notification so a
failed send never loses the message. Sort key is `MSG` (not `PUBLISHED`), so
the publisher stream filter (`sk = PUBLISHED`) ignores these writes.

Anti-bot timing (`elapsedMs` / `formStartedAt`) is **best-effort and
client-controlled**: a bot can omit or inflate the value. The hard caps are
the per-IP contact rate limit and the global SES daily cap
(`SES_GLOBAL_DAILY_CAP`, one counter for contact mail and resume-download
notices). Per-IP limits count an IPv6 caller by its /64 prefix, since a
client can rotate addresses within it. The address is the viewer's, as
CloudFront reports it, not the CloudFront edge's (`docs/architecture.md`,
Client address for per-IP limits). Once the daily cap is used up, the
contact form answers 429 without saving the message. Resume notices stop once that counter reaches
`RESUME_NOTIFY_SES_DAILY_CAP`, so the rest of the day's mail is left for the
contact form.

#### `CONTACT#<ulid>` / `MSG`

| Attr                       | Notes                                       |
| -------------------------- | ------------------------------------------- |
| `entityType`               | `contact`                                   |
| `contactId`                | Same ULID as in `pk`                        |
| `name`, `email`, `message` | Visitor-submitted fields                    |
| `sourceIp`                 | Caller IP, or `unknown` when absent         |
| `createdAt`                | ISO-8601                                    |
| `emailStatus`              | `pending` \| `sent` \| `failed`             |
| `emailError`               | Optional short error string when send fails |

### Rate-limit counters (TTL)

Attribute `ttl` (epoch seconds) is enabled on the table for auto-expiry.
Counter rows (`entityType` `rateLimit`) hold a `count` and expire an hour after
their window ends (a day for `DAY#` rows). They use non-`PUBLISHED` sort keys, so the publisher stream filter ignores
them (same as draft `META` rows).

| Purpose                                 | `pk`                             | `sk`                   | Limit      |
| --------------------------------------- | -------------------------------- | ---------------------- | ---------- |
| Contact per IP / hour                   | `RATE#contact#ip#<ip>`           | `HOUR#<yyyy-mm-ddTHH>` | 3          |
| SES emails / UTC day                    | `RATE#ses#global`                | `DAY#<yyyy-mm-dd>`     | 100        |
| Resume notify IP/day                    | `RATE#resume#ip#<ip>`            | `DAY#<yyyy-mm-dd>`     | 1 (dedupe) |
| Notebook image uploads / user / UTC day | `RATE#notebook-image#user#<sub>` | `DAY#<yyyy-mm-dd>`     | 200        |

## User revocations

The API refuses a user's tokens issued before `revokedBefore` (see
`docs/architecture.md`, Users and access). One row per user, replaced on each
revocation, expiring through `ttl` a day later.

| Attr            | Notes                                        |
| --------------- | -------------------------------------------- |
| `pk` / `sk`     | `USER_REVOCATIONS` / `USER#<sub>`            |
| `entityType`    | `userRevocation`                             |
| `userId`        | Cognito `sub`                                |
| `revokedBefore` | ISO-8601 time the user's sessions were ended |
| `ttl`           | Epoch seconds, a day after `revokedBefore`   |

## Removed users

Removing a user's access keeps their Cognito account (disabled, no groups), so
this row is what marks them removed and remembers the level a restore gives
back. Restore deletes the row. See `docs/architecture.md`, Users and access.

#### `REMOVED_USERS` / `USER#<sub>`

| Attr            | Notes                                                   |
| --------------- | ------------------------------------------------------- |
| `entityType`    | `removedUser`                                           |
| `userId`        | Cognito `sub`, same as in `sk`                          |
| `email`         | Email at removal                                        |
| `previousLevel` | `full` \| `cms` \| `notebook` \| `null` (had no access) |
| `pending`       | `true` until every removal step has run; absent after   |
| `createdAt`     | ISO-8601, when they were removed                        |
| `removedBy`     | `sub` of the Full Admin who removed them                |

## Notebook sync feed

Synced entities stamp sparse GSI3 keys on their **META** item (no append-only ledger):

| Attr         | Notes                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `syncPk`     | `SYNC#<userId>` (Cognito `sub`) — GSI3 partition                                                                                       |
| `syncSk`     | `<updatedAt>#<TYPE>#<id>` (ISO-8601 UTC ms; lex order ≈ time order)                                                                    |
| `entityType` | Adapter key for the change feed (stamped from sync `changeType`)                                                                       |
| `createHash` | `sha256:<hex>` of the create-time fields for idempotent ULID retries (never the text itself; live META only, not tombstones or claims) |
| `ttl`        | Set on soft-delete (default 30 days via `SYNC_TOMBSTONE_TTL_DAYS`)                                                                     |

Create also writes a durable claim row (not on GSI3):

| Attr         | Notes                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `pk` / `sk`  | `CREATED#<TYPE>#USER#<sub>#<id>` / `META`                                                        |
| `entityType` | `syncCreateClaim`                                                                                |
| `ttl`        | `SYNC_CREATE_CLAIM_TTL_DAYS` (365), restarted on soft delete, so it outlives the tombstone purge |

`GET /api/notebook/sync/changes`:

- Parses `since` as an ISO-8601 datetime and normalizes it to UTC milliseconds, so missing milliseconds or offsets match UTC-ms keys. An unparseable `since` is **400**; one older than the tombstone horizon (30-day TTL less a 1-day margin and the overlap) is **410** `resync_required`, and the client does a full resync.
- Re-queries an overlap window (`SYNC_OVERLAP_MS`, 15s ≥ `API_LAMBDA_TIMEOUT_MS`) below `since` so late-committed writes are not skipped; clients dedupe by `(id, version)`.
- Returns opaque `nextSince` (server watermark at query start) for the next poll.
- Pages with real DynamoDB `ExclusiveStartKey` (opaque `cursor`; exact key set, string values). `limit` counts returned changes, not skipped corrupt rows, and is a maximum: a page also stops at about 1 MB of JSON, or after 5 queries, and returns `nextCursor`.
- Cursors are bound to the caller's `syncPk` and the sync `since` lower bound (stored in the cursor as `boundSince`, empty without `since`); foreign / wrong-`since` cursors, including a no-`since` cursor reused with `since`, → **400**. `ValidationException` on ExclusiveStartKey is also mapped to 400.
- Projection ALL on GSI3 → latest entity state per row (tombstones omit `entity`).

Adding a synced entity: a Go repository on the generic `versioned` store (`services/api/internal/notebook/versioned.go`; its `changeType` makes it stamp `entityType` / `syncPk` / `syncSk`, and `createHash` fingerprints creates; see [adding-an-entity.md](./adding-an-entity.md)), one entry in `syncAdapters` (`services/api/internal/notebook/sync.go`, the feed adapter; the store does not register it), and its variant in `SyncChangeSchema` — no edits to the feed query. `TestSyncAdaptersCoverEveryChangeType` fails until the adapters and the contract's `sync.changeTypes` (from `SYNC_CHANGE_TYPES`) agree; a row with no adapter returns 500.

Clients:

- Generate **ULIDs** locally for idempotent create (payload-hash mismatch → 409).
- Poll or page the change feed with `since` / `nextSince` + opaque `cursor`.
- Send **`If-Match: "<version>"`**, **`If-Match: W/"<version>"`**, or **`If-Match: *`** (or body `version`) on update/delete; treat **412** vs **409** as documented in [architecture.md](./architecture.md).

## Notebook (owner-scoped key space)

Notebook notes/tasks use **owner-scoped** keys so a second Cognito user
(or recreated pool `sub`) cannot read, mutate, or collide with another user's rows.
Access patterns: daily note by `(user, area, date)`, notes by area/date (calendar),
tasks by area/status/start date, tasks linked to a note.

Wire types live in `@gagnechris/shared` (`NoteSchema`, `TaskSchema`, sync variants).
Dynamo item schemas and mappers live in `@gagnechris/data`
(`NoteMetaItemSchema`, `TaskMetaItemSchema`, `DailyNoteClaimItemSchema`,
`buildNoteMetaItem`, `buildTaskMetaItem`, `buildDailyNoteClaimItem`).

### Note fields

| Attr                      | Notes                                                       |
| ------------------------- | ----------------------------------------------------------- |
| `id`                      | Client ULID                                                 |
| `userId`                  | Cognito `sub`                                               |
| `area`                    | One of the user's area ids (see Areas)                      |
| `type`                    | `daily` \| `page` (a standing note in the web app)          |
| `date`                    | `yyyy-mm-dd` when `type=daily`; `null` for pages            |
| `title`                   | String (may be empty)                                       |
| `bodyMarkdown`            | Markdown body                                               |
| `tags`                    | `string[]` (normalized on write)                            |
| `pinned`                  | Boolean                                                     |
| `archived`                | Boolean, pages only; absent reads as `false`                |
| `taskIds`                 | Embedded task ids; see Task embeds                          |
| `unopened`                | `true` on a daily note not yet opened; see Carry-in on open |
| `version`                 | Optimistic concurrency                                      |
| `createdAt` / `updatedAt` | ISO-8601 UTC ms                                             |
| `deleted`                 | Soft-delete flag (tombstone window on GSI3)                 |

### Task embeds

A note embeds a task with a line that holds only the token `{{task:<ULID>}}`, optionally indented with spaces or tabs:

```markdown
## Standup

{{task:01J9Z8X7W6V5T4S3R2Q1P0N9M8}}
Context written under the task.
```

- The note stores the reference only. Title, checked state, show-on date and priority always come from the task record, so completing or renaming a task changes every note that embeds it.
- Only whole lines are embeds. A token inside other text, after a list marker, or inside a fenced code block is plain text.
- The same task can be embedded in many notes. The task's `noteId` stays its home note (where it was created).
- `taskIds` is derived by the API from `bodyMarkdown` on every create and update (unique ids, first-seen order); clients never send it. A row with no `taskIds` attribute derives it on read.
- Parsing lives in `@gagnechris/shared` (`findTaskEmbeds`, `taskEmbedIds`, `replaceTaskEmbeds`, `removeTaskEmbedLines`, `taskEmbedFallbackLine`) and is React Native safe, so the native app can use the same parser.
- A renderer without live tasks replaces each embed line with a plain checklist line: `- [ ] Title`, `- [x] Title` when done, `- [ ] ~~Title~~ (dropped)` when dropped, or `- [ ] (deleted task)` when the task is gone. The Notebook export and search do this; the shared markdown sanitizer passes an unrendered token through as text.
- On the web, typing `[ ] some text` on its own line and then pressing Enter or leaving the line creates the task with a client ULID (`noteId` = this note, `area` = the note's area, and `startDate`, `someday` and `priority` from the line's task syntax, which is removed from the title; see `docs/architecture.md`) and replaces the line with the token in the same editor change, so the next autosave already holds the token. Creates retry with the same ULID, so a lost response never makes a second task. Each `[ ]` line makes its own task, so the same text twice gives two tasks, and pasting several `[ ]` lines converts each one. Undoing a conversion brings the line back; leaving it again embeds the same task (its token is no longer in the note), and if the line was edited first the task is updated to the new text, so undo never leaves an orphan (and is not a delete). In a note, typing the `]` that completes `- [ ]` (or `* [ ]`, `+ [ ]`) at a bullet's start rewrites the line to `[ ]` after the same indent (`bulletCheckboxAsTask` in `@gagnechris/shared`; on the web one undo step brings the bullet back), so it becomes a task the same way; `- [ ]` already in the text, pasted, or in a template stays a markdown checklist.
- **Subtasks:** an embed line indented under another embed line, with no blank line between them, is a subtask of that task. Subtasks are one level deep: a task line under a subtask is nested but has no parent. Only the task's home note decides its parent, and only when the parent is in the same area and is not itself a subtask, so two notes cannot nest tasks under each other. The API sets each task's `parentId` from its home note on every note create and update (`taskEmbedNesting` and `taskEmbedParents` in `@gagnechris/shared`, ported to Go), when a task moves to another note or area, and clears it when the parent is deleted. That clear reads only the parent's home note, daily notes dated from the day before the parent was created and pages saved since then; a subtask homed in an older note keeps the deleted parent's id until that note is next saved. Setting a parent never fails the note save or the task update; a failure is logged.
- Deleting an embed line deletes its task, in whichever note the line was. The delete waits `EMBED_DELETE_GRACE_MS` (3 s) and is dropped if the line comes back first (undo, paste); closing the note sends it at once. Cutting a line does not delete the task, since it is being moved. A note line whose task is deleted or missing is taken out of the note, and the note saves without it.

### Task fields

| Attr                               | Notes                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                               | Client ULID                                                                                                                                |
| `userId`                           | Cognito `sub`                                                                                                                              |
| `area`                             | One of the user's area ids (see Areas)                                                                                                     |
| `title`                            | Required non-empty                                                                                                                         |
| `description`                      | Markdown (may be empty)                                                                                                                    |
| `priority`                         | `low` \| `med` \| `high`                                                                                                                   |
| `status`                           | `todo` \| `in_progress` \| `done` \| `dropped`. `todo` and `in_progress` are open; `dropped` closes a task without doing it (not a delete) |
| `dueDate`                          | Optional `yyyy-mm-dd` deadline; `null` when none. Independent of `startDate`; it never decides whether a task shows on Today or Upcoming   |
| `startDate`                        | Show-on day (`yyyy-mm-dd`): the task shows on Today from this day. `null` means now. Omitted on create → `null`                            |
| `someday`                          | Boolean. Someday tasks never show on Today and always have `startDate: null`                                                               |
| `completedAt`                      | ISO-8601 when done; otherwise `null`                                                                                                       |
| `noteId`                           | Optional link to a note                                                                                                                    |
| `parentId`                         | The task this is a subtask of, from indentation in its home note (see Task embeds); `null` when none. Set by the API only                  |
| `tags`                             | `string[]`                                                                                                                                 |
| `version` / timestamps / `deleted` | Same concurrency model as notes                                                                                                            |

### Keys

| Entity           | `pk`                                   | `sk`                    | GSI1 / GSI2                                                                                                                                                                              |
| ---------------- | -------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note             | `USER#<sub>#NOTE#<noteId>`             | `META`                  | GSI1: `USER#<sub>#AREA#<area>` / `DATE#<yyyy-mm-dd>#NOTE#<id>` (daily) or `PAGE#<updatedAt>#NOTE#<id>` (pages)                                                                           |
| Daily note claim | `USER#<sub>#DAILY#<area>#<yyyy-mm-dd>` | `NOTE`                  | — (one daily note per user/area/day; item stores `noteId`)                                                                                                                               |
| Daily template   | `USER#<sub>#DAILY_TEMPLATE#<area>`     | `META`                  | — (one per user/area; no row means the built-in template)                                                                                                                                |
| Note template    | `USER#<sub>#NOTE_TEMPLATES`            | `TEMPLATE#<templateId>` | — (one partition per user, read with one Query)                                                                                                                                          |
| Areas            | `USER#<sub>#NOTEBOOK_AREAS`            | `META`                  | — (one per user; no row means Work and Personal at version 0)                                                                                                                            |
| Task             | `USER#<sub>#TASK#<taskId>`             | `META`                  | GSI1: `USER#<sub>#AREA#<area>#STATUS#<todo\|in_progress\|done\|dropped>` / `START#<startDate>#TASK#<id>`, `UPDATED#<ts>#TASK#<id>` when `startDate` is null, or `SOMEDAY#<ts>#TASK#<id>` |
| Tasks for a note | (task META)                            | `META`                  | GSI2: `USER#<sub>#NOTE#<noteId>#TASKS` / `TASK#<taskId>`                                                                                                                                 |

**Show-on date and someday.** `someday` is a separate boolean, not a sentinel `startDate`, so `startDate` is always a real calendar date or `null`, Upcoming can order by it without excluding a magic value, and a later deadline field can sit beside it. The API keeps the two exclusive: a body with `someday: true` and a non-null `startDate` is **400**; `PUT` with `someday: true` clears `startDate`, and `PUT` with a non-null `startDate` clears `someday`.

**Rows without `startDate`.** Task META rows stored with no `startDate` or `someday` attribute have a GSI1 sort key of `DUE#<dueDate>#TASK#<id>`. The API reads them as `startDate = dueDate`, `someday = false` (an explicit `null` stays `null`), but its start-date queries read only `START#`, `UPDATED#` and `SOMEDAY#`, so a dated row still keyed `DUE#` shows in no Today or Upcoming list until `scripts/migrate-task-start-dates.ts` rekeys it (see `infra/RUNBOOK.md`). Any API write to such a row also stores `startDate` and rekeys it to `START#`.

Synced Notebook entities also set `syncPk` / `syncSk` / `entityType` / `createHash` (GSI3) on META — see above. Create claims are owner-scoped: `CREATED#<TYPE>#USER#<sub>#<id>`. Soft-delete **omits** `gsi1*` / `gsi2*` so list indexes never return tombstones for 30 days.

**Write limits:** note `bodyMarkdown` and task `description` up to 100 KB (UTF-8), titles 300 characters, at most 50 tags of 50 characters. Over a limit, notebook `POST`/`PUT` return **413** `payload_too_large` with `fields`, well before DynamoDB's 400 KB item cap.

**Daily-note claim lifecycle:**

- **Race (two offline devices, same area/date, different ULIDs):** the daily claim Put is conditional; the first writer wins. The loser (`POST /notes` or `PUT /notes/daily/...`) gets **409 `daily_taken`** with `current` (the winner) and `currentVersion`. Nothing is dropped silently.
- **Client merge rule (web and iOS):** on `daily_taken`, keep the local draft and show a conflict. Then either reload and adopt `current`, or re-send your text as an update to `current.id` with `version: current.version` once the user chooses to merge. Never retry the create with the losing ULID.
- **Autosave:** `PUT /notes/daily/...` with a `version` or `If-Match` reads the note named by `id` (one consistent read) and writes it with the version condition. Only when that id is not this area and day's note does it read the claim, then update the claim's note or create one.
- **Placeholder writers:** `PUT /notes/daily/...` with no `version` or `If-Match` when the day already exists returns 409 (`daily_taken` for a different id, `version_conflict` for the same id with changed content). Re-sending the exact create (same id and content) returns 200 with the stored note.
- **Carry-in on open:** `POST /notes/daily/{area}/{date}/open` with a client `id` returns the day's note as `GET` does, except on the day's first open: it then collects the open, non-someday tasks of that area that show on that day but are not scheduled for exactly that day (at most 100), leaving out any the note already embeds. With no note yet, if there are any it creates the note with that `id` from the area's daily template with their embeds added at the end of the template's carry-over section, in place of the empty list items (`- `, `- [ ] `) that end it and straight under the heading when nothing else is left: the heading named by the template's `carryOverSection`, else its first heading (the section runs to the next heading of any level; `carryIntoDailyTemplate` in `@gagnechris/shared`, ported to Go). A template with no heading, or a blank one, gets a `## Carried in` section of the embeds on top instead. A daily note created any other way (a daily `PUT`, `POST /notes`, a task moved to that day) is stored with `unopened: true`; its first open adds the embeds to the note as it stands by the same rule, matching `carryOverSection` against the note's headings with the day's tokens filled, and removes the mark (an `UpdateItem` at the note's version when nothing carries in, so the version stays). Carried-in tasks nest as the area's latest earlier daily note nests them, so a task indented under another there carries in indented under it even when that note is not its home; tasks that note doesn't embed nest under their stored `parentId`. A subtask whose parent is done carries in alone. Each day carries in once: a concurrent opener that loses the daily claim, or whose write to an unopened note fails its version condition, reads the day again and returns the note the other wrote, and a note without the mark (even an empty one) is never changed. With no note and nothing to carry it returns the empty placeholder and writes nothing.
- **Daily templates:** `GET`, `PUT` and `DELETE /api/notebook/templates/daily/{area}` read, save and reset the area's template (`version` from `If-Match` or the body; a stale one is **409**/**412**). No row reads as the built-in template (`DEFAULT_DAILY_TEMPLATES` in `@gagnechris/shared` for Work and Personal, blank for any other area) at version 0 with `isDefault: true`. A reset writes a row with `isDefault: true` and the next version rather than deleting it, so another device's stale save still conflicts. `carryOverSection` is the heading text (unfilled, as `dailyTemplateHeadings` lists it) that carried-in tasks go under, or `null` for the first heading; a `PUT` naming a heading the body doesn't have is **400**, `null` clears it, and a `PUT` that leaves it out (the iOS editor) keeps the stored one. A reset clears it. Text is limited to 10 KB (**413**), and task lines (`[ ] text` outside code fences) or `{{task:…}}` embeds are **400**, since every new day would repeat them; `- [ ]` checklists are allowed. The empty-day placeholder from `GET` and `/open` carries `templateMarkdown`, the template with `{{weekday}}`, `{{date}}` and `{{area}}` (the area's current name) filled for that day; clients show it as the note's text, and the day is written only on the first edit. Editing a template never changes notes that exist.
- **Note templates:** `GET /api/notebook/templates/notes` lists every template of the user, oldest first (no paging); `POST` creates one with a client ULID, a `name` (trimmed, 1–100 characters) and `bodyMarkdown` (up to 10 KB, **413** over it; task lines allowed, but a `{{task:…}}` embed outside code fences is **400**, since every note the template went into would show that one task). A repeat with the same id and content returns the stored template; the same id with other content is **409** `payload_mismatch`. A user has at most 100 (**409** `conflict` past that; the count is read before the write, so concurrent creates can pass it slightly). `GET`, `PUT` (rename or new text) and `DELETE /api/notebook/templates/notes/{id}` work like the other versioned rows (`version` from `If-Match` or the body; stale is **409**/**412**). They are not synced: a delete removes the row (**204**) and leaves no tombstone. The API stores the text unfilled; clients fill `{{weekday}}`, `{{date}}` and `{{area}}` (`fillNoteTemplate` in `@gagnechris/shared`) when they insert it, and its task lines become tasks the way typed ones do.
- **Delete frees the day:** soft-deleting a daily note removes its claim in the same transaction (only if the claim still points at that note). A claim pointing at a tombstone or at a missing META row (purged tombstone, partial restore) reads as empty on `GET`, and is freed on the next create (conditional on the claim still holding that `noteId`). `scripts/scan-orphan-daily-claims.mjs` counts and releases such claims (see `infra/RUNBOOK.md`).
- **Areas:** a user has 1 to 4 areas (`NotebookAreasSchema` in `@gagnechris/shared`), each an `id` and a `name`, in the order the area switch shows them. An id is a lowercase slug (`a-z`, `0-9` and single hyphens, up to 24 characters) fixed once the area exists; notes, tasks, daily templates and GSI1 keys store it, so `work` and `personal` rows are valid as stored. A name is 1–30 characters, and two areas can't share an id or a name (case-insensitive). `GET /api/notebook/areas` returns `{ areas, version, updatedAt }`, Work and Personal at version 0 until the list is first saved. `PUT /api/notebook/areas` replaces the whole list (`version` from `If-Match` or the body; stale is **409**/**412**; more than 4 is **400** `areas=too_big`). Renaming or reordering only rewrites this row. Removing an area needs it to hold no live note and no task in any status, archived, done and dropped included (**409** `conflict` otherwise, with a message naming the area and counting what it holds, such as "Family still has 3 notes (1 archived), 2 done tasks and 1 dropped task."); the save then deletes its daily template in the same transaction, so an area added later with that id starts blank. The row also keeps `areaIndex`, a map of each listed id to `true`: note and task creates, the daily note create and a `PUT` that moves a note or task to another area check in their transaction that the area is still in it, so a write that read the list before a removal is refused rather than landing in the removed area (a row saved before `areaIndex` existed has none, and is not checked until the list is next saved). The emptiness check counts on GSI1, which can lag a write by a moment, so a row created just before the removal can still outlive it; such a row shows in no list or search until an area with that id is added back. Writes that put a row in an area (note and task create, `PUT` that moves one, the daily routes, template `PUT` and `DELETE`) and the daily note `GET` and open answer **400** `fields.area=not_found` for an id not on the list; other reads only check the id's form. A new area's built-in daily template is blank.
- **Area is immutable for daily notes:** `PUT /notes/{id}` with a different `area` on a daily note → **400** `fields.area=immutable`. Pages can still move.

Notes and tasks use only GSI1–3; they need no further indexes.

API surface: Notebook repositories use the generic `versioned` store (`services/api/internal/notebook/versioned.go`), whose get/mutate/delete take the owner's `userId` and the record id; posts and projects use id-only keys through `store.PublishableStore`. Query cursor keys are chosen per query (`store.PageQuery.CursorKeys`). Use `USER#…#AREA#*` on GSI1 so Notebook lists never scan post `STATUS#*` partitions. Calendar `from`/`to` queries use the `DATE#` prefix only so freeform pages (`PAGE#…`) are excluded.

**Mentions:** `GET /api/notebook/notes?taskId=<ulid>` lists the notes whose `taskIds` hold that task (a filter on each page, no key condition), which the task page's Mentioned in reads.

**List paging:** `GET /api/notebook/notes` without `area` walks the user's areas' partitions in list order with a composite `mp.` cursor instead of merging one page per area. Pages are grouped by partition, not globally sorted; clients that need a global order sort after loading. `limit` is a maximum: notes and tasks list pages also stop at about 1 MB of JSON (`store.PageByteBudget`, well under Lambda's 6 MB response cap) and return `nextCursor`, so clients must keep paging until `nextCursor` is absent. A single-partition cursor is the raw DynamoDB key. A malformed or foreign cursor → **400**.

**Batch read:** `POST /api/notebook/notes/batch` with JSON body `ids` (1 to 100 ULIDs) returns `items`, the caller's live notes among them in request order, from one BatchGetItem. Deleted and unknown ids are left out, as their `GET` would 404. Today's and Upcoming's source-note chips read notes this way.

### Tasks HTTP API

| Method                   | Path                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`                    | `/api/notebook/tasks`               | Query: `area`, `status`, `priority`, `startOnOrBefore`, `startAfter`, `startBefore`, `startOn`, `someday` (`true` / `false`), `undated` (`true`), `dueOn`, `dueBefore`, `noteId`, `open` (`true` = todo + in_progress only; done and dropped are closed), `today` (caller's local `yyyy-mm-dd` for carried-over ranking; default UTC), `cursor`, `limit`. Single area+status uses GSI1; `noteId` uses GSI2. Multi-partition lists walk (area, status, sort-key range) partitions in order with a composite `mp.` cursor, so every task is returned exactly once. Done and dropped tasks never rank as carried over. |
| `POST`                   | `/api/notebook/tasks`               | Client ULID create; idempotent. `noteId` (create and `PUT`) must be the caller's live note, else **400** `fields.noteId=not_found`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST`                   | `/api/notebook/tasks/batch`         | JSON body `ids` (1 to 100 ULIDs) → `items`: the caller's live tasks among them, in request order, from one BatchGetItem. Deleted and unknown ids are left out, as their `GET` would 404. Note embeds and the search palette read tasks this way.                                                                                                                                                                                                                                                                                                                                                                    |
| `GET` / `PUT` / `DELETE` | `/api/notebook/tasks/{id}`          | Soft-delete tombstone; `If-Match` / body `version`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST`                   | `/api/notebook/tasks/{id}/complete` | Sets `status=done` and `completedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `POST`                   | `/api/notebook/tasks/{id}/reopen`   | Sets `status=todo` (from `done` or `dropped`; other statuses unchanged), clears `completedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Start-date filters (at most one of `startOnOrBefore`, `startAfter`/`startBefore` (together they are one window), `startOn`; `someday=true` or `undated=true` with any of them, or the two together, is **400**):

| Filter                        | Matches                                | GSI1 sort-key ranges per (area, status)     |
| ----------------------------- | -------------------------------------- | ------------------------------------------- |
| `startOnOrBefore=<d>` (Today) | `startDate` ≤ d or `null`, not someday | `START#` … `START#<d>#TASK~`, `UPDATED#*`   |
| `startAfter=<d>` (Upcoming)   | `startDate` &gt; d, not someday        | `START#<d>#TASK~` … `START#\uffff`          |
| `startBefore=<d>`             | `startDate` &lt; d, not someday        | … `START#<d>#` (from `startAfter` when set) |
| `startOn=<d>`                 | `startDate` = d                        | `START#<d>#…`                               |
| `someday=true` / `false`      | someday tasks / everything else        | `SOMEDAY#*` / whole partition, filtered     |
| `undated=true`                | `startDate` `null`, not someday        | `UPDATED#*`                                 |

Today is `open=true&startOnOrBefore=<local today>` plus, for Coming up, `open=true&startAfter=<local today>&startBefore=<today + 15>` (the next 14 days); Upcoming is `open=true&startAfter=<local today>`. The Tasks show-on filters map to these with `taskShowOnQuery` (`@gagnechris/shared`), so every filter pages on the server. `priority`, `dueOn` and `dueBefore` have no key condition: each Query reads at least 100 rows and keeps the matches, and one request makes at most 20 Queries, so a page can hold fewer than `limit` items (even none) while `nextCursor` is set. List sort is applied **on the server** within each page: carried over (open, `startDate` &lt; `today`), then earlier start dates, then `startDate: null`, then someday, then priority, then id. Pages are not globally sorted across partitions; clients that need one order (Upcoming by date) sort after loading every page. The web and iOS Tasks lists sort what they have loaded with `sortTasksForList` (`@gagnechris/shared`): overdue and due-today first, then by show-on date, then undated, then someday.

### Search HTTP API

| Method | Path                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/notebook/search` | JSON body: `q` (required), optional `area`, `limit` (max 50). POST so search terms never appear in a URL or access log; `GET` returns 405. Scans up to 2,000 of the caller's notes and 2,000 tasks, and about 16 MB of note text and of task text, and filters in memory: notes newest first (pages by last update, then daily notes by date), open tasks (`todo`, `in_progress`) before `done` and `dropped`, and without `area` a page from each of the user's areas in turn. `truncated` is true when rows were left unread, and the web palette and iOS search then say only the most recent notes and tasks were searched; note bodies and task descriptions are matched as plain text (`markdownPlainText` in `@gagnechris/shared`, ported to Go), with task embeds replaced by the task's line. Response groups `notes[]` / `tasks[]` and `truncated`, with a plain-text snippet + match ranges; a title hit's snippet is the body or description (around a match there, else its start, empty when there is none); a daily note hit also carries its `date`, and a task hit its `status` and `version`, so a hit can be checked off without reading the task. |

### Human export

No dedicated export API. The **Export** button on the Notebook's Notes page pages the notes and tasks list endpoints in the browser and builds a ZIP (Markdown + `tasks.json`). Task embeds are written as plain checklist lines, so exported notes contain no `{{task:…}}` tokens. See `infra/RUNBOOK.md` (human export vs PITR).

## Conventions

- Timestamps: UTC ISO-8601 with millisecond precision.
- Tag normalization: trim, lowercase, collapse internal whitespace to `-`.
- Transactions: slug claim + `META` in one `TransactWriteItems`
  where uniqueness matters.
- Streams: publisher consumes `sk=PUBLISHED` modifications only. Draft
  META autosaves never rebuild the live site.
