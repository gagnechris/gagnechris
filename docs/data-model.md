# Data model (single-table DynamoDB)

Shared table for Blog CMS posts and (later) Notebook entities. Table name:
`gagnechris-<env>` (prod: `gagnechris-prod`).

Attribute names are lowercase. Keys use string partition/sort values with `#`
separators so entity types never collide.

**Key builders, item zod schemas, and mappers** live in `@gagnechris/data`
(`packages/data`). API and publisher must import those helpers — do not hard-code
`POST#…`, `META`, `PUBLISHED`, `HOME#current`, or `RESUME#current` in application
code.

## Keys

| Attribute           | Role                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `pk`                | Partition key                                                                               |
| `sk`                | Sort key                                                                                    |
| `gsi1pk` / `gsi1sk` | GSI1 — list by status (admin + published-by-date)                                           |
| `gsi2pk` / `gsi2sk` | GSI2 — list published posts by tag                                                          |
| `entityType`        | Discriminator (`post`, `slug`, `resume`, `home`, `contact`, `rateLimit`, `note`, `task`, …) |

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
| `version`                          | Number for optimistic concurrency (CHR-30)                                                  |
| `gsi1pk`                           | `STATUS#<status>`                                                                           |
| `gsi1sk`                           | `TS#<sortTs>#POST#<postId>` — `sortTs` is `publishedAt` when published, else `updatedAt`    |

Admin autosave writes **only** this item. Edits never change the live site.

#### `POST#<postId>` / `PUBLISHED` — live snapshot (CHR-96)

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
update `META.slug`. Publisher (CHR-34) can emit a meta refresh or CloudFront
function later; until then the API/admin treats redirects as reserved slugs.

#### Optional: `POST#<postId>` / `REV#<version>` — revision history

Reserved for last-N body snapshots (not required for CHR-29 deploy). Same `pk`,
`sk` = `REV#<zeroPaddedVersion>`.

### Access patterns (posts)

| Need                    | How                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Get by `postId`         | `GetItem` `POST#id` / `META` (+ compare to `PUBLISHED` for `hasUnpublishedChanges`) |
| Get by slug             | `GetItem` `SLUG#slug` / `POST` → then `META` (or follow `REDIRECT`)                 |
| List all (admin)        | Query GSI1 `STATUS#draft` and `STATUS#published` (META only), merge/sort            |
| List published by date  | Query GSI1 `STATUS#published` for META ids → `GetItem` each `PUBLISHED`             |
| List by tag (published) | See tag items below                                                                 |
| Enforce slug uniqueness | Conditional put on `SLUG#` / `POST`                                                 |
| Soft delete             | Set META `status=deleted`, delete `PUBLISHED`, drop slug claim                      |
| Publish / discard       | Publish copies META → `PUBLISHED`; discard copies `PUBLISHED` → META                |

### Tag index items

For each tag on a **published** post, maintain:

`TAG#<tag>` / `TS#<publishedAt>#POST#<postId>` with `gsi2pk`/`gsi2sk` mirroring
pk/sk (or project from GSI2 only). Simpler pattern used here:

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

#### `RESUME#current` / `META` — editable draft — draft

| Attr         | Notes                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------ |
| `entityType` | `resume`                                                                                   |
| `resumeId`   | `current`                                                                                  |
| `name`       | Display name in the page header                                                            |
| `pdfPath`    | Always `/resume.pdf` in practice; publisher regenerates that object via pdf-lib on publish |

No GSI keys. `GET /api/admin/resume` seeds META as a **draft** from
`DEFAULT_RESUME` on first read (CHR-96). Publish copies META → `PUBLISHED`
(and triggers PDF regeneration). Unpublish deletes `PUBLISHED`. A missing
published snapshot leaves the existing `resume/index.html` and `resume.pdf`
in place rather than deleting them.

#### `RESUME#current` / `PUBLISHED` — live snapshot

Same content attrs as META. Publisher reads only this item. Existing
`status=published` META rows are copied to `PUBLISHED` on first admin read or
publisher rebuild so the live site does not change during rollout.

## Home (singleton)

Same draft / published split as the resume.

#### `HOME#current` / `META` — editable draft — draft

| Attr         | Notes                                               |
| ------------ | --------------------------------------------------- |
| `entityType` | `home`                                              |
| `homeId`     | `current`                                           |
| `name`       | Header name (`<h1>`)                                |
| `title`      | Header subtitle, e.g. `Engineering Leader`          |
| `about`      | About Me body text; blank lines separate paragraphs |

`GET /api/admin/home` seeds META as a **draft** from `DEFAULT_HOME`. Publish
writes `HOME#current` / `PUBLISHED`; unpublish deletes it. A draft or missing
published item leaves the live `index.html` alone.

#### `HOME#current` / `PUBLISHED` — live snapshot

Publisher reads only this item (with the same META→PUBLISHED migration as
resume).

Web deploy uploads a pristine `_shell.html` (raw Vite shell) plus `index.html`
(home meta shell), then invokes `republishAll`, which reads `_shell.html` and
writes the home prerender into `index.html`. Home-only head tags therefore
cannot leak into `/blog` or `/resume`. Profile photo, Quick Links, and footer
**link data** are defined once in `@gagnechris/shared/home` (`HOME_QUICK_LINKS` /
`HOME_FOOTER_LINKS`); the publisher prerenders HTML from that list and React
renders the same list as JSX (`<Link>` / tracked `<a>`) so SPA navigation and
GA4 click events stay intact (CHR-116 / CHR-122 / CHR-125). The prerender
footer year is fixed at publish time; the SPA uses the live year.

## Contact messages (CHR-98)

Public contact form submissions are persisted before SES notification so a
failed send never loses the message. Sort key is `MSG` (not `META`) so the
publisher stream filter ignores these writes.

Anti-bot timing (`elapsedMs` / `formStartedAt`) is **best-effort and
client-controlled** (CHR-114 / CHR-122): a bot can omit or inflate the value.
Hard caps remain the per-IP contact rate limit and the global SES daily cap. A
signed server-issued token would make timing authoritative if spam warrants it.

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
Counters use non-`META` sort keys so streams ignore them.

| Purpose               | `pk`                   | `sk`                   | Limit      |
| --------------------- | ---------------------- | ---------------------- | ---------- |
| Contact per IP / hour | `RATE#contact#ip#<ip>` | `HOUR#<yyyy-mm-ddTHH>` | 3          |
| SES emails / UTC day  | `RATE#ses#global`      | `DAY#<yyyy-mm-dd>`     | 100        |
| Resume notify IP/day  | `RATE#resume#ip#<ip>`  | `DAY#<yyyy-mm-dd>`     | 1 (dedupe) |

## Notebook sync ledger (CHR-141 fixture spike)

Per authenticated user, append-only sync rows drive `GET /api/notebook/sync/changes`:

| Attr         | Notes                                                         |
| ------------ | ------------------------------------------------------------- |
| `pk`         | `SYNC#<userId>` (Cognito `sub`)                               |
| `sk`         | `TS#<updatedAt>#FIXTURE#<fixtureId>` (lex order ≈ time order) |
| `entityType` | `syncChange`                                                  |
| `changeType` | `fixtureNote` (future: `note`, `task`, …)                     |
| `entityId`   | ULID                                                          |
| `version`    | Entity version after the change                               |
| `deleted`    | `true` for tombstone rows                                     |
| `updatedAt`  | ISO-8601 UTC                                                  |

Fixture note **META** items use `FIXTURE#<id>` / `META` (not `NOTE#`). Creates/updates/deletes dual-write META + a ledger row in one `TransactWriteItems` when possible. Tombstoned META items carry `ttl` (epoch seconds, default 30 days from delete).

Clients:

- Generate **ULIDs** locally for idempotent create.
- Poll or page the change feed with `since` + opaque `cursor`.
- Send **`If-Match: "<version>"`** (or body `version`) on update/delete; treat **412** vs **409** as documented in [architecture.md](./architecture.md).

## Notebook (reserved key space)

Production Notebook notes/tasks will use the keys below; the CHR-141 fixture uses `FIXTURE#` instead so the spike does not collide with future `NOTE#` data.

| Entity               | `pk`            | `sk`   | GSI1                                       |
| -------------------- | --------------- | ------ | ------------------------------------------ |
| Note                 | `NOTE#<noteId>` | `META` | `TYPE#NOTE` / `TS#<updatedAt>#NOTE#<id>`   |
| Task                 | `TASK#<taskId>` | `META` | `TYPE#TASK` / `STATUS#<open\|done>#TS#...` |
| Note slug (optional) | `NSLUG#<slug>`  | `NOTE` | —                                          |

Access patterns to support later: get note by id, list notes by updated, get/list
tasks by status. Use `TYPE#*` on GSI1 so Notebook lists never scan `STATUS#*`
post partitions.

## Conventions

- Timestamps: UTC ISO-8601 with millisecond precision.
- Tag normalization: trim, lowercase, collapse internal whitespace to `-`.
- Transactions: slug claim + `META` (+ tag rows) in one `TransactWriteItems`
  where uniqueness matters.
- Streams: publisher consumes `sk=PUBLISHED` modifications only (CHR-96). Draft
  META autosaves never rebuild the live site.
