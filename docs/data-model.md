# Data model (single-table DynamoDB)

Shared table for Blog CMS posts, projects and Notebook entities. Table name:
`gagnechris-<env>` (prod: `gagnechris-prod`).

Attribute names are lowercase. Keys use string partition/sort values with `#`
separators so entity types never collide.

**Key builders, item zod schemas, and mappers** live in `@gagnechris/data`
(`packages/data`). API and publisher must import those helpers — do not hard-code
`POST#…`, `PROJECT#…`, `META`, `PUBLISHED`, `HOME#current`, or `RESUME#current`
in application code.

## Keys

| Attribute           | Role                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `pk`                | Partition key                                                                                            |
| `sk`                | Sort key                                                                                                 |
| `gsi1pk` / `gsi1sk` | GSI1 — list by status (posts by date, projects by order)                                                 |
| `gsi2pk` / `gsi2sk` | GSI2 — Notebook tasks-for-note (`USER#<sub>#NOTE#<id>#TASKS`); posts' tag rows still mirror pk/sk        |
| `syncPk` / `syncSk` | GSI3 — sparse per-user sync feed (one META row per synced entity)                                        |
| `entityType`        | Discriminator (`post`, `slug`, `project`, `resume`, `home`, `contact`, `removedUser`, `note`, `task`, …) |

Billing: on-demand. Streams: `NEW_AND_OLD_IMAGES` (publisher). PITR and
deletion protection on. Removal policy: `RETAIN`.

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
posts cannot claim the same slug.

#### `SLUG#<oldSlug>` / `REDIRECT` — rename / soft URL keep

| Attr         | Notes                       |
| ------------ | --------------------------- |
| `targetSlug` | Current slug to redirect to |
| `postId`     | Owning post                 |
| `entityType` | `slugRedirect`              |

On rename: write `REDIRECT` for the old slug, replace `SLUG#new` / `POST`,
update `META.slug`. The publisher does not serve redirects; the API/admin
treats redirect slugs as reserved.

### Access patterns (posts)

| Need                    | How                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Get by `postId`         | `GetItem` `POST#id` / `META` (+ compare to `PUBLISHED` for `hasUnpublishedChanges`)                                                                                                                                |
| Get by slug             | `GetItem` `SLUG#slug` / `POST` → then `META` (or follow `REDIRECT`)                                                                                                                                                |
| List all (admin)        | Query GSI1 `STATUS#published` then `STATUS#draft` (META only, summary attributes via `ProjectionExpression`), page in that order; the flag comes from META, and a META row without it is compared with `PUBLISHED` |
| List published by date  | GSI1 `STATUS#published` ids ∪ `SITE#publish` `postIds` → `BatchGet` `PUBLISHED`                                                                                                                                    |
| List by tag (published) | See tag items below                                                                                                                                                                                                |
| Enforce slug uniqueness | Conditional put on `SLUG#` / `POST`                                                                                                                                                                                |
| Soft delete             | Set META `status=deleted`, delete `PUBLISHED`, drop slug claim                                                                                                                                                     |
| Publish / discard       | Publish copies META → `PUBLISHED`; discard copies `PUBLISHED` → META                                                                                                                                               |

### Tag index items

For each tag on a **published** post, maintain:

`TAG#<tag>` / `TS#<publishedAt>#POST#<postId>` with `gsi2pk`/`gsi2sk` mirroring
pk/sk so items remain GSI-projectable. List-by-tag still uses the table primary
key. Notebook tasks linked to a note also use GSI2 with owner-scoped partitions
(`USER#<sub>#NOTE#<id>#TASKS`); those keys never collide with `TAG#…` partitions.

Pattern used here:

| Keys             |                                  |
| ---------------- | -------------------------------- |
| `pk`             | `TAG#<normalizedTag>`            |
| `sk`             | `TS#<publishedAt>#POST#<postId>` |
| `gsi2pk`         | same as `pk`                     |
| `gsi2sk`         | same as `sk`                     |
| `postId`, `slug` | denormalized for list cards      |

On publish/unpublish, rewrite these sparse items from the **PUBLISHED**
snapshot (draft tag edits do not change the public tag index until publish).

List by tag: `Query` `pk = TAG#x` (or GSI2), newest first.

## Projects

Immutable id: `projectId` (ULID). Same draft / published split, slug claims and
soft delete as posts, through `ProjectsRepository`
(`services/api/src/projects/repository.ts`, a `PublishableRepository`).
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
listing ids from GSI1 `PROJECT_STATUS#published`.

#### `PROJECT_SLUG#<slug>` / `PROJECT` and `PROJECT_SLUG#<oldSlug>` / `REDIRECT`

Slug claim (`entityType` `projectSlug`, `projectId`) and rename redirect
(`projectSlugRedirect`, `targetSlug`), written in the same transaction as META
exactly as for posts. A separate partition from `SLUG#…`, so a project and a
post can share a slug and their redirect rows never collide.

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

| Attr         | Notes                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `entityType` | `resume`                                                                                   |
| `resumeId`   | `current`                                                                                  |
| `name`       | Display name in the page header                                                            |
| `pdfPath`    | Always `/resume.pdf` in practice; publisher regenerates that object via pdf-lib on publish |
| `content`    | `ResumeContentSchema` (below)                                                              |

`content` holds `summary`, `competencies`, `experience`, `skills`,
`education`, plus optional `headline` (current role) and
`earlierRolesThrough` (cut-off year: roles that ended in or before it are "earlier
roles"). Each `experience` entry is `title`, `company` (bare name), `start`
and `end` (`YYYY-MM`; `end: null` is present), optional `note` (for example
"contract, concurrent") and `bullets`. An entry without `start` is the old
shape, with its dates inside `company` (`Ro | July 2019 - Present`); it still
parses, and `scripts/migrate-resume-dates.ts` moves the dates into
`start`/`end`. The PDF renders entries as `Company | Month YYYY - Month YYYY`;
the page puts `Mon YYYY – Mon YYYY` in a date column and reads old-shape rows
through the same parser. With `earlierRolesThrough` set, roles whose `end` year
is on or before it collapse under "Earlier roles, <first start year>–<cut-off>";
unset, every role is expanded. Education keeps a free-text `year` (a single
completion date, no range), shown in the date column as stored.

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

| Attr         | Notes                                               |
| ------------ | --------------------------------------------------- |
| `entityType` | `home`                                              |
| `homeId`     | `current`                                           |
| `name`       | Header name (`<h1>`)                                |
| `title`      | Header subtitle, e.g. `Engineering Leader`          |
| `about`      | About Me body text; blank lines separate paragraphs |

`GET /api/admin/home` seeds META as a **draft** from `DEFAULT_HOME`. Publish
writes `HOME#current` / `PUBLISHED`; unpublish deletes it. On publish the
publisher also writes `home/last-published.json`; when `PUBLISHED` is missing
or corrupt it re-renders `index.html` from that snapshot. With no snapshot, a
missing Home renders `DEFAULT_HOME` (what the SPA falls back to) and a corrupt
one leaves `index.html` alone.

`index.html` also lists the three newest published posts (Recent posts), so
the home target runs on every post publish, unpublish and delete as well as on
Home changes. It reads the same catalog as `posts.json`. When the rendered
bytes are unchanged (a body edit, or an edit to a post outside the top three)
nothing is written and `/` is not invalidated. With no posts the section is
left out.

#### `HOME#current` / `PUBLISHED` — live snapshot

Publisher reads only this item.

Web deploy uploads a pristine `_shell.html` (raw Vite shell) plus `index.html`
(home meta shell), then invokes `republishAll`, which reads `_shell.html` and
writes the home prerender into `index.html`. Home-only head tags therefore
cannot leak into `/posts` or `/resume`. The hero's links sentence is defined
once in `@gagnechris/shared/render` (`HOME_LINKS_SENTENCE`); the publisher
prerenders HTML from that list and React renders the same list as JSX
(`<Link>` / tracked `<a>`) so SPA navigation and GA4 click events stay intact.
The site header and footer around every page come from
`@gagnechris/shared/site-chrome` (see [architecture.md](./architecture.md#public-pages)).
The prerender footer year is fixed at publish time; the SPA uses the live year.

## Site publish row

#### `SITE#publish` / `META`

One row, updated in the same transaction as every write or delete of a post,
project, home or resume `PUBLISHED` row (`buildSitePublishUpdate` in
`@gagnechris/data`). Its sort key is not `PUBLISHED`, so the publisher stream
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
`PublishableRepository`, so the publisher still unions them with GSI1.

## Contact messages

Public contact form submissions are persisted before SES notification so a
failed send never loses the message. Sort key is `MSG` (not `PUBLISHED`), so
the publisher stream filter (`sk = PUBLISHED`) ignores these writes.

Anti-bot timing (`elapsedMs` / `formStartedAt`) is **best-effort and
client-controlled**: a bot can omit or inflate the value. The hard caps are
the per-IP contact rate limit and the global SES daily cap.

#### `CONTACT#<ulid>` / `MSG`

| Attr                       | Notes                                       |
| -------------------------- | ------------------------------------------- |
| `entityType`               | `contact`                                   |
| `contactId`                | Same ULID as in `pk`                        |
| `name`, `email`, `message` | Visitor-submitted fields                    |
| `sourceIp`                 | `requestContext.http.sourceIp` when present |
| `createdAt`                | ISO-8601                                    |
| `emailStatus`              | `pending` \| `sent` \| `failed`             |
| `emailError`               | Optional short error string when send fails |

### Rate-limit counters (TTL)

Attribute `ttl` (epoch seconds) is enabled on the table for auto-expiry.
Counters use non-`PUBLISHED` sort keys, so the publisher stream filter ignores
them (same as draft `META` rows).

| Purpose               | `pk`                   | `sk`                   | Limit      |
| --------------------- | ---------------------- | ---------------------- | ---------- |
| Contact per IP / hour | `RATE#contact#ip#<ip>` | `HOUR#<yyyy-mm-ddTHH>` | 3          |
| SES emails / UTC day  | `RATE#ses#global`      | `DAY#<yyyy-mm-dd>`     | 100        |
| Resume notify IP/day  | `RATE#resume#ip#<ip>`  | `DAY#<yyyy-mm-dd>`     | 1 (dedupe) |

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

| Attr        | Notes                                                         |
| ----------- | ------------------------------------------------------------- |
| `pk` / `sk` | `CREATED#<TYPE>#<id>` / `META`                                |
| `ttl`       | `SYNC_CREATE_CLAIM_TTL_DAYS` (365) — outlives tombstone purge |

`GET /api/notebook/sync/changes`:

- Normalizes `since` with `Date.parse` → `toISOString()` so missing milliseconds or offsets match UTC-ms keys.
- Re-queries an overlap window (`SYNC_OVERLAP_MS`, 15s ≥ `API_LAMBDA_TIMEOUT_MS`) below `since` so late-committed writes are not skipped; clients dedupe by `(id, version)`.
- Returns opaque `nextSince` (server watermark at query start) for the next poll.
- Pages with real DynamoDB `ExclusiveStartKey` (opaque `cursor`; exact key set, string values; GSI cursors must match the status partition). `limit` counts returned changes, not skipped corrupt rows, and is a maximum: a page also stops at about 1 MB of JSON and returns `nextCursor`.
- Cursors are bound to the queried partition and the sync `since` lower bound (stored in the cursor as `boundSince`, empty without `since`); foreign / wrong-`since` cursors, including a no-`since` cursor reused with `since`, → **400**. `ValidationException` on ExclusiveStartKey is also mapped to 400.
- Projection ALL on GSI3 → latest entity state per row (tombstones omit `entity`).

Adding a synced entity: **`sync` config on its `VersionedRepository`** (`sync: { changeType, userIdOf, createPayloadHash }`, which stamps `entityType` / `syncPk` / `syncSk`; see [adding-an-entity.md](./adding-an-entity.md)), one entry in `services/api/src/sync/adapters.ts` (the feed adapter; the repository does not register it), and its variant in `SyncChangeSchema` — no edits to the ledger/feed modules. A test fails until the adapter list and the schema agree; a row with no adapter returns 500.

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

| Attr                      | Notes                                            |
| ------------------------- | ------------------------------------------------ |
| `id`                      | Client ULID                                      |
| `userId`                  | Cognito `sub`                                    |
| `area`                    | `work` \| `personal`                             |
| `type`                    | `daily` \| `page`                                |
| `date`                    | `yyyy-mm-dd` when `type=daily`; `null` for pages |
| `title`                   | String (may be empty)                            |
| `bodyMarkdown`            | Markdown body                                    |
| `tags`                    | `string[]` (normalized on write)                 |
| `pinned`                  | Boolean                                          |
| `taskIds`                 | Embedded task ids; see Task embeds               |
| `version`                 | Optimistic concurrency                           |
| `createdAt` / `updatedAt` | ISO-8601 UTC ms                                  |
| `deleted`                 | Soft-delete flag (tombstone window on GSI3)      |

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
- `taskIds` is derived by the API from `bodyMarkdown` on every create and update (unique ids, first-seen order); clients never send it. Rows written before embeds have no `taskIds` attribute and derive it on read.
- Parsing lives in `@gagnechris/shared` (`findTaskEmbeds`, `taskEmbedIds`, `replaceTaskEmbeds`, `taskEmbedFallbackLine`) and is React Native safe, so the native app can use the same parser.
- A renderer without live tasks replaces each embed line with a plain checklist line: `- [ ] Title`, `- [x] Title` when done, `- [ ] ~~Title~~ (dropped)` when dropped, or `- [ ] (deleted task)` when the task is gone. The Notebook export and search do this; the shared markdown sanitizer passes an unrendered token through as text.
- On the web, typing `[ ] some text` on its own line (not `- [ ]`, which stays a markdown checklist) and then pressing Enter or leaving the line creates the task with a client ULID (`noteId` = this note, `area` = the note's area, and `startDate`, `someday` and `priority` from the line's task syntax, which is removed from the title; see `docs/architecture.md`) and replaces the line with the token in the same editor change, so the next autosave already holds the token. Creates retry with the same ULID, so a lost response never makes a second task. A deleted task renders as a muted "Deleted task" row.

### Task fields

| Attr                               | Notes                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                               | Client ULID                                                                                                                                |
| `userId`                           | Cognito `sub`                                                                                                                              |
| `area`                             | `work` \| `personal`                                                                                                                       |
| `title`                            | Required non-empty                                                                                                                         |
| `description`                      | Markdown (may be empty)                                                                                                                    |
| `priority`                         | `low` \| `med` \| `high`                                                                                                                   |
| `status`                           | `todo` \| `in_progress` \| `done` \| `dropped`. `todo` and `in_progress` are open; `dropped` closes a task without doing it (not a delete) |
| `dueDate`                          | Optional `yyyy-mm-dd` deadline; `null` when none. Independent of `startDate`; it never decides whether a task shows on Today or Upcoming   |
| `startDate`                        | Show-on day (`yyyy-mm-dd`): the task shows on Today from this day. `null` means now. Omitted on create → `null`                            |
| `someday`                          | Boolean. Someday tasks never show on Today and always have `startDate: null`                                                               |
| `completedAt`                      | ISO-8601 when done; otherwise `null`                                                                                                       |
| `noteId`                           | Optional link to a note                                                                                                                    |
| `tags`                             | `string[]`                                                                                                                                 |
| `version` / timestamps / `deleted` | Same concurrency model as notes                                                                                                            |

### Keys

| Entity           | `pk`                                   | `sk`   | GSI1 / GSI2                                                                                                                                                                              |
| ---------------- | -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note             | `USER#<sub>#NOTE#<noteId>`             | `META` | GSI1: `USER#<sub>#AREA#<work\|personal>` / `DATE#<yyyy-mm-dd>#NOTE#<id>` (daily) or `PAGE#<updatedAt>#NOTE#<id>` (pages)                                                                 |
| Daily note claim | `USER#<sub>#DAILY#<area>#<yyyy-mm-dd>` | `NOTE` | — (one daily note per user/area/day; item stores `noteId`)                                                                                                                               |
| Task             | `USER#<sub>#TASK#<taskId>`             | `META` | GSI1: `USER#<sub>#AREA#<area>#STATUS#<todo\|in_progress\|done\|dropped>` / `START#<startDate>#TASK#<id>`, `UPDATED#<ts>#TASK#<id>` when `startDate` is null, or `SOMEDAY#<ts>#TASK#<id>` |
| Tasks for a note | (task META)                            | `META` | GSI2: `USER#<sub>#NOTE#<noteId>#TASKS` / `TASK#<taskId>`                                                                                                                                 |

**Show-on date and someday.** `someday` is a separate boolean, not a sentinel `startDate`, so `startDate` is always a real calendar date or `null`, Upcoming can order by it without excluding a magic value, and a later deadline field can sit beside it. The API keeps the two exclusive: a body with `someday: true` and a non-null `startDate` is **400**; `PUT` with `someday: true` clears `startDate`, and `PUT` with a non-null `startDate` clears `someday`.

**Rows without `startDate`.** Task META rows written before `startDate` existed have no `startDate` or `someday` attribute and a GSI1 sort key of `DUE#<dueDate>#TASK#<id>`. The API reads them as `startDate = dueDate`, `someday = false` (an explicit `null` stays `null`), but its start-date queries read only `START#`, `UPDATED#` and `SOMEDAY#`, so a dated row still keyed `DUE#` shows in no Today or Upcoming list until `scripts/migrate-task-start-dates.ts` rekeys it (see `infra/RUNBOOK.md`). Any API write to such a row also stores `startDate` and rekeys it to `START#`.

Synced Notebook entities also set `syncPk` / `syncSk` / `entityType` / `createHash` (GSI3) on META — see above. Create claims are owner-scoped: `CREATED#<TYPE>#USER#<sub>#<id>`. Soft-delete **omits** `gsi1*` / `gsi2*` so list indexes never return tombstones for 30 days.

**Write limits:** note `bodyMarkdown` and task `description` up to 100 KB (UTF-8), titles 300 characters, at most 50 tags of 50 characters. Over a limit, notebook `POST`/`PUT` return **413** `payload_too_large` with `fields`, well before DynamoDB's 400 KB item cap.

**Daily-note claim lifecycle:**

- **Race (two offline devices, same area/date, different ULIDs):** the daily claim Put is conditional; the first writer wins. The loser (`POST /notes` or `PUT /notes/daily/...`) gets **409 `daily_taken`** with `current` (the winner) and `currentVersion`. Nothing is dropped silently.
- **Client merge rule (web and iOS):** on `daily_taken`, keep the local draft and show a conflict. Then either reload and adopt `current`, or re-send your text as an update to `current.id` with `version: current.version` once the user chooses to merge. Never retry the create with the losing ULID.
- **Placeholder writers:** `PUT /notes/daily/...` with no `version` or `If-Match` when the day already exists returns 409 (`daily_taken` for a different id, `version_conflict` for the same id with changed content). Re-sending the exact create (same id and content) returns 200 with the stored note.
- **Carry-in on open:** `POST /notes/daily/{area}/{date}/open` with a client `id` returns the day's note as `GET` does, except when no note exists: it then collects the open, non-someday tasks of that area that show on that day but are not scheduled for exactly that day (at most 100), and if there are any creates the note with that `id` and a `## Carried in` block of their embeds. The daily claim makes this happen once: a concurrent opener that loses the claim returns the winner, and an existing note (even an empty one) is never changed. With nothing to carry it returns the empty placeholder and writes nothing.
- **Delete frees the day:** soft-deleting a daily note removes its claim in the same transaction (only if the claim still points at that note). A claim pointing at a tombstone or at a missing META row (purged tombstone, partial restore) reads as empty on `GET`, and is freed on the next create (conditional on the claim still holding that `noteId`). `scripts/scan-orphan-daily-claims.mjs` counts and releases such claims (see `infra/RUNBOOK.md`).
- **Area is immutable for daily notes:** `PUT /notes/{id}` with a different `area` on a daily note → **400** `fields.area=immutable`. Pages can still move.

Notes and tasks use only GSI1–3; they need no further indexes.

API surface: Notebook repositories use `VersionedRepository` with the `ownerScoped` strategy, whose get/mutate/delete take a `{ userId, id }` key; posts use the `unscoped` (id-only) strategy through `PublishableRepository`. Query cursors are chosen per call / `IndexName` (`cursorKeysByIndex`). Use `USER#…#AREA#*` on GSI1 so Notebook lists never scan post `STATUS#*` partitions. Calendar `from`/`to` queries use the `DATE#` prefix only so freeform pages (`PAGE#…`) are excluded.

**List paging:** `GET /api/notebook/notes` without `area` walks the Work then Personal partitions with a composite `mp.` cursor instead of merging one page per area. Pages are grouped by partition, not globally sorted; clients that need a global order sort after loading. `limit` is a maximum: notes and tasks list pages also stop at about 1 MB of JSON (`PAGE_BYTE_BUDGET`, well under Lambda's 6 MB response cap) and return `nextCursor`, so clients must keep paging until `nextCursor` is absent. A single-partition cursor is the raw DynamoDB key. A malformed or foreign cursor → **400**.

### Tasks HTTP API

| Method                   | Path                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`                    | `/api/notebook/tasks`               | Query: `area`, `status`, `priority`, `startOnOrBefore`, `startAfter`, `startOn`, `someday` (`true` / `false`), `dueOn`, `dueBefore`, `noteId`, `open` (`true` = todo + in_progress only; done and dropped are closed), `today` (caller's local `yyyy-mm-dd` for carried-over ranking; default UTC), `cursor`, `limit`. Single area+status uses GSI1; `noteId` uses GSI2. Multi-partition lists walk (area, status, sort-key range) partitions in order with a composite `mp.` cursor, so every task is returned exactly once. Done and dropped tasks never rank as carried over. |
| `POST`                   | `/api/notebook/tasks`               | Client ULID create; idempotent. `noteId` (create and `PUT`) must be the caller's live note, else **400** `fields.noteId=not_found`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET` / `PUT` / `DELETE` | `/api/notebook/tasks/{id}`          | Soft-delete tombstone; `If-Match` / body `version`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `POST`                   | `/api/notebook/tasks/{id}/complete` | Sets `status=done` and `completedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST`                   | `/api/notebook/tasks/{id}/reopen`   | Sets `status=todo` (from `done` or `dropped`; other statuses unchanged), clears `completedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Start-date filters (at most one of `startOnOrBefore`, `startAfter`, `startOn`; `someday=true` with any of them is **400**):

| Filter                        | Matches                                | GSI1 sort-key ranges per (area, status)   |
| ----------------------------- | -------------------------------------- | ----------------------------------------- |
| `startOnOrBefore=<d>` (Today) | `startDate` ≤ d or `null`, not someday | `START#` … `START#<d>#TASK~`, `UPDATED#*` |
| `startAfter=<d>` (Upcoming)   | `startDate` &gt; d, not someday        | `START#<d>#TASK~` … `START#\uffff`        |
| `startOn=<d>`                 | `startDate` = d                        | `START#<d>#…`                             |
| `someday=true` / `false`      | someday tasks / everything else        | `SOMEDAY#*` / whole partition, filtered   |

Today is `open=true&startOnOrBefore=<local today>`; Upcoming is `open=true&startAfter=<local today>`. `priority`, `dueOn` and `dueBefore` have no key condition: they filter each page, so a page can hold fewer than `limit` items while `nextCursor` is set. List sort is applied **on the server** within each page: carried over (open, `startDate` &lt; `today`), then earlier start dates, then `startDate: null`, then someday, then priority, then id. Pages are not globally sorted across partitions; clients that need one order (Upcoming by date) sort after loading every page.

### Search HTTP API

| Method | Path                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/notebook/search` | JSON body: `q` (required), optional `area`, `limit` (max 50). POST so search terms never appear in a URL or access log; `GET` returns 405. Scans the caller's notes and tasks (up to 2,000 of each, fully paged across areas) and filters in memory; note bodies are matched with task embeds replaced by the task's title. Response groups `notes[]` / `tasks[]` with snippet + match ranges; a daily note hit also carries its `date`. |

### Human export

No dedicated export API. The **Export** button on the Notebook's Notes page pages the notes and tasks list endpoints in the browser and builds a ZIP (Markdown + `tasks.json`). Task embeds are written as plain checklist lines, so exported notes contain no `{{task:…}}` tokens. See `infra/RUNBOOK.md` (human export vs PITR).

## Conventions

- Timestamps: UTC ISO-8601 with millisecond precision.
- Tag normalization: trim, lowercase, collapse internal whitespace to `-`.
- Transactions: slug claim + `META` (+ tag rows) in one `TransactWriteItems`
  where uniqueness matters.
- Streams: publisher consumes `sk=PUBLISHED` modifications only. Draft
  META autosaves never rebuild the live site.
