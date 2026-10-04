# Data model (single-table DynamoDB)

Shared table for Blog CMS posts and Notebook entities. Table name:
`gagnechris-<env>` (prod: `gagnechris-prod`).

Attribute names are lowercase. Keys use string partition/sort values with `#`
separators so entity types never collide.

**Key builders, item zod schemas, and mappers** live in `@gagnechris/data`
(`packages/data`). API and publisher must import those helpers — do not hard-code
`POST#…`, `META`, `PUBLISHED`, `HOME#current`, or `RESUME#current` in application
code.

## Keys

| Attribute           | Role                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `pk`                | Partition key                                                                                     |
| `sk`                | Sort key                                                                                          |
| `gsi1pk` / `gsi1sk` | GSI1 — list by status (admin + published-by-date)                                                 |
| `gsi2pk` / `gsi2sk` | GSI2 — Notebook tasks-for-note (`USER#<sub>#NOTE#<id>#TASKS`); posts' tag rows still mirror pk/sk |
| `syncPk` / `syncSk` | GSI3 — sparse per-user sync feed (one META row per synced entity)                                 |
| `entityType`        | Discriminator (`post`, `slug`, `resume`, `home`, `contact`, `rateLimit`, `note`, `task`, …)       |

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
| `status`                           | `draft` \| `published` \| `deleted` (soft delete). `published` means a live snapshot exists |
| `publishedAt`                      | ISO-8601 when first published; kept on unpublish                                            |
| `updatedAt`                        | ISO-8601                                                                                    |
| `coverImage`                       | Optional `/media/...` path                                                                  |
| `seo`                              | Optional map: `title`, `description`, `ogImage` overrides                                   |
| `version`                          | Number for optimistic concurrency                                                           |
| `gsi1pk`                           | `STATUS#<status>`                                                                           |
| `gsi1sk`                           | `TS#<sortTs>#POST#<postId>` — `sortTs` is `publishedAt` when published, else `updatedAt`    |

Admin autosave writes **only** this item. Edits never change the live site.

#### `POST#<postId>` / `PUBLISHED` — live snapshot

Written only on `POST .../publish`. Same content attrs as META (no GSI1 keys —
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

| Need                    | How                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Get by `postId`         | `GetItem` `POST#id` / `META` (+ compare to `PUBLISHED` for `hasUnpublishedChanges`) |
| Get by slug             | `GetItem` `SLUG#slug` / `POST` → then `META` (or follow `REDIRECT`)                 |
| List all (admin)        | Query GSI1 `STATUS#published` then `STATUS#draft` (META only), page in that order   |
| List published by date  | Query GSI1 `STATUS#published` for META ids → `GetItem` each `PUBLISHED`             |
| List by tag (published) | See tag items below                                                                 |
| Enforce slug uniqueness | Conditional put on `SLUG#` / `POST`                                                 |
| Soft delete             | Set META `status=deleted`, delete `PUBLISHED`, drop slug claim                      |
| Publish / discard       | Publish copies META → `PUBLISHED`; discard copies `PUBLISHED` → META                |

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

## Resume (singleton)

Editable draft plus an optional live snapshot.

#### `RESUME#current` / `META` — editable draft

| Attr         | Notes                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `entityType` | `resume`                                                                                   |
| `resumeId`   | `current`                                                                                  |
| `name`       | Display name in the page header                                                            |
| `pdfPath`    | Always `/resume.pdf` in practice; publisher regenerates that object via pdf-lib on publish |

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
or corrupt it re-renders `index.html` from that snapshot (or leaves
`index.html` alone if there is none).

#### `HOME#current` / `PUBLISHED` — live snapshot

Publisher reads only this item.

Web deploy uploads a pristine `_shell.html` (raw Vite shell) plus `index.html`
(home meta shell), then invokes `republishAll`, which reads `_shell.html` and
writes the home prerender into `index.html`. Home-only head tags therefore
cannot leak into `/posts` or `/resume`. Quick Links **link data** is defined
once in `@gagnechris/shared/render` (`HOME_QUICK_LINKS`); the publisher
prerenders HTML from that list and React renders the same list as JSX
(`<Link>` / tracked `<a>`) so SPA navigation and GA4 click events stay intact.
The site header and footer around every page come from
`@gagnechris/shared/site-chrome` (see [architecture.md](./architecture.md#public-pages)).
The prerender footer year is fixed at publish time; the SPA uses the live year.

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
tasks by area/status/due, tasks linked to a note.

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
| `version`                 | Optimistic concurrency                           |
| `createdAt` / `updatedAt` | ISO-8601 UTC ms                                  |
| `deleted`                 | Soft-delete flag (tombstone window on GSI3)      |

### Task fields

| Attr                               | Notes                                      |
| ---------------------------------- | ------------------------------------------ |
| `id`                               | Client ULID                                |
| `userId`                           | Cognito `sub`                              |
| `area`                             | `work` \| `personal`                       |
| `title`                            | Required non-empty                         |
| `description`                      | Markdown (may be empty)                    |
| `priority`                         | `low` \| `med` \| `high`                   |
| `status`                           | `todo` \| `in_progress` \| `done`          |
| `dueDate`                          | Optional `yyyy-mm-dd`; `null` when undated |
| `completedAt`                      | ISO-8601 when done; otherwise `null`       |
| `noteId`                           | Optional link to a note                    |
| `tags`                             | `string[]`                                 |
| `version` / timestamps / `deleted` | Same concurrency model as notes            |

### Keys

| Entity           | `pk`                                   | `sk`   | GSI1 / GSI2                                                                                                                       |
| ---------------- | -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Note             | `USER#<sub>#NOTE#<noteId>`             | `META` | GSI1: `USER#<sub>#AREA#<work\|personal>` / `DATE#<yyyy-mm-dd>#NOTE#<id>` (daily) or `PAGE#<updatedAt>#NOTE#<id>` (pages)          |
| Daily note claim | `USER#<sub>#DAILY#<area>#<yyyy-mm-dd>` | `NOTE` | — (one daily note per user/area/day; item stores `noteId`)                                                                        |
| Task             | `USER#<sub>#TASK#<taskId>`             | `META` | GSI1: `USER#<sub>#AREA#<area>#STATUS#<todo\|in_progress\|done>` / `DUE#<date>#TASK#<id>` or `UPDATED#<ts>#TASK#<id>` when undated |
| Tasks for a note | (task META)                            | `META` | GSI2: `USER#<sub>#NOTE#<noteId>#TASKS` / `TASK#<taskId>`                                                                          |

Synced Notebook entities also set `syncPk` / `syncSk` / `entityType` / `createHash` (GSI3) on META — see above. Create claims are owner-scoped: `CREATED#<TYPE>#USER#<sub>#<id>`. Soft-delete **omits** `gsi1*` / `gsi2*` so list indexes never return tombstones for 30 days.

**Write limits:** note `bodyMarkdown` and task `description` up to 100 KB (UTF-8), titles 300 characters, at most 50 tags of 50 characters. Over a limit, notebook `POST`/`PUT` return **413** `payload_too_large` with `fields`, well before DynamoDB's 400 KB item cap.

**Daily-note claim lifecycle:**

- **Race (two offline devices, same area/date, different ULIDs):** the daily claim Put is conditional; the first writer wins. The loser (`POST /notes` or `PUT /notes/daily/...`) gets **409 `daily_taken`** with `current` (the winner) and `currentVersion`. Nothing is dropped silently.
- **Client merge rule (web and iOS):** on `daily_taken`, keep the local draft and show a conflict. Then either reload and adopt `current`, or re-send your text as an update to `current.id` with `version: current.version` once the user chooses to merge. Never retry the create with the losing ULID.
- **Placeholder writers:** `PUT /notes/daily/...` with no `version` or `If-Match` when the day already exists returns 409 (`daily_taken` for a different id, `version_conflict` for the same id with changed content). Re-sending the exact create (same id and content) returns 200 with the stored note.
- **Delete frees the day:** soft-deleting a daily note removes its claim in the same transaction (only if the claim still points at that note). A claim pointing at a tombstone or at a missing META row (purged tombstone, partial restore) reads as empty on `GET`, and is freed on the next create (conditional on the claim still holding that `noteId`). `scripts/scan-orphan-daily-claims.mjs` counts and releases such claims (see `infra/RUNBOOK.md`).
- **Area is immutable for daily notes:** `PUT /notes/{id}` with a different `area` on a daily note → **400** `fields.area=immutable`. Pages can still move.

Notes and tasks use only GSI1–3; they need no further indexes.

API surface: Notebook repositories use `VersionedRepository` with the `ownerScoped` strategy, whose get/mutate/delete take a `{ userId, id }` key; posts use the `unscoped` (id-only) strategy through `PublishableRepository`. Query cursors are chosen per call / `IndexName` (`cursorKeysByIndex`). Use `USER#…#AREA#*` on GSI1 so Notebook lists never scan post `STATUS#*` partitions. Calendar `from`/`to` queries use the `DATE#` prefix only so freeform pages (`PAGE#…`) are excluded.

**List paging:** `GET /api/notebook/notes` without `area` walks the Work then Personal partitions with a composite `mp.` cursor instead of merging one page per area. Pages are grouped by partition, not globally sorted; clients that need a global order sort after loading. `limit` is a maximum: notes and tasks list pages also stop at about 1 MB of JSON (`PAGE_BYTE_BUDGET`, well under Lambda's 6 MB response cap) and return `nextCursor`, so clients must keep paging until `nextCursor` is absent. A single-partition cursor is the raw DynamoDB key. A malformed or foreign cursor → **400**.

### Tasks HTTP API

| Method                   | Path                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`                    | `/api/notebook/tasks`               | Query: `area`, `status`, `priority`, `dueOn`, `dueBefore`, `noteId`, `open` (`true` = todo + in_progress only), `today` (caller's local `yyyy-mm-dd` for overdue ranking; default UTC), `cursor`, `limit`. Single area+status uses GSI1; `noteId` uses GSI2. Multi-partition lists walk (area, status) partitions in order with a composite `mp.` cursor, so every task is returned exactly once. Done tasks never rank as overdue. |
| `POST`                   | `/api/notebook/tasks`               | Client ULID create; idempotent. `noteId` (create and `PUT`) must be the caller's live note, else **400** `fields.noteId=not_found`                                                                                                                                                                                                                                                                                                  |
| `GET` / `PUT` / `DELETE` | `/api/notebook/tasks/{id}`          | Soft-delete tombstone; `If-Match` / body `version`                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST`                   | `/api/notebook/tasks/{id}/complete` | Sets `status=done` and `completedAt`                                                                                                                                                                                                                                                                                                                                                                                                |
| `POST`                   | `/api/notebook/tasks/{id}/reopen`   | Sets `status=todo` (from `done`; other statuses unchanged), clears `completedAt`                                                                                                                                                                                                                                                                                                                                                    |

`dueBefore` / `dueOn` key conditions use the `DUE#` prefix only (undated `UPDATED#…` rows are excluded). List sort is applied **on the server**: overdue (`dueDate` &lt; UTC today), then earlier due dates, then priority, then id.

### Search HTTP API

| Method | Path                   | Notes                                                                                                                                                                                                                                                                                                                   |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/notebook/search` | JSON body: `q` (required), optional `area`, `limit` (max 50). POST so search terms never appear in a URL or access log; `GET` returns 405. Scans the caller's notes and tasks (up to 2,000 of each, fully paged across areas) and filters in memory; response groups `notes[]` / `tasks[]` with snippet + match ranges. |

### Human export

No dedicated export API. The admin **Export** button pages the notes and tasks list endpoints in the browser and builds a ZIP (Markdown + `tasks.json`). See `infra/RUNBOOK.md` (human export vs PITR).

## Conventions

- Timestamps: UTC ISO-8601 with millisecond precision.
- Tag normalization: trim, lowercase, collapse internal whitespace to `-`.
- Transactions: slug claim + `META` (+ tag rows) in one `TransactWriteItems`
  where uniqueness matters.
- Streams: publisher consumes `sk=PUBLISHED` modifications only. Draft
  META autosaves never rebuild the live site.
