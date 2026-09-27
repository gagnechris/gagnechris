# Data model (single-table DynamoDB)

Shared table for Blog CMS posts and (later) Notebook entities. Table name:
`gagnechris-<env>` (prod: `gagnechris-prod`).

Attribute names are lowercase. Keys use string partition/sort values with `#`
separators so entity types never collide.

## Keys

| Attribute | Role |
| --- | --- |
| `pk` | Partition key |
| `sk` | Sort key |
| `gsi1pk` / `gsi1sk` | GSI1 — list by status (admin + published-by-date) |
| `gsi2pk` / `gsi2sk` | GSI2 — list published posts by tag |
| `entityType` | Discriminator (`post`, `slug`, `resume`, `home`, `note`, `task`, …) |

Billing: on-demand. Streams: `NEW_AND_OLD_IMAGES` (publisher). PITR and
deletion protection on. Removal policy: `RETAIN`.

## Posts

Immutable id: `postId` (ULID). Public URL slug is mutable; uniqueness and
redirects use dedicated items.

### Items

#### `POST#<postId>` / `META` — canonical post

| Attr | Notes |
| --- | --- |
| `slug` | Current public slug |
| `title`, `excerpt`, `bodyMarkdown` | Content |
| `tags` | `string[]` |
| `status` | `draft` \| `published` \| `deleted` (soft delete) |
| `publishedAt` | ISO-8601 when first published; cleared/kept on unpublish per API |
| `updatedAt` | ISO-8601 |
| `coverImage` | Optional `/media/...` path |
| `seo` | Optional map: `title`, `description`, `ogImage` overrides |
| `version` | Number for optimistic concurrency (CHR-30) |
| `gsi1pk` | `STATUS#<status>` |
| `gsi1sk` | `TS#<sortTs>#POST#<postId>` — `sortTs` is `publishedAt` when published, else `updatedAt` |

#### `SLUG#<slug>` / `POST` — uniqueness + lookup

| Attr | Notes |
| --- | --- |
| `postId` | Owner of this slug |
| `entityType` | `slug` |

Create/rename: conditional `PutItem` with `attribute_not_exists(pk)` so two
posts cannot claim the same slug.

#### `SLUG#<oldSlug>` / `REDIRECT` — rename / soft URL keep

| Attr | Notes |
| --- | --- |
| `targetSlug` | Current slug to redirect to |
| `postId` | Owning post |
| `entityType` | `slugRedirect` |

On rename: write `REDIRECT` for the old slug, replace `SLUG#new` / `POST`,
update `META.slug`. Publisher (CHR-34) can emit a meta refresh or CloudFront
function later; until then the API/admin treats redirects as reserved slugs.

#### Optional: `POST#<postId>` / `REV#<version>` — revision history

Reserved for last-N body snapshots (not required for CHR-29 deploy). Same `pk`,
`sk` = `REV#<zeroPaddedVersion>`.

### Access patterns (posts)

| Need | How |
| --- | --- |
| Get by `postId` | `GetItem` `POST#id` / `META` |
| Get by slug | `GetItem` `SLUG#slug` / `POST` → then `META` (or follow `REDIRECT`) |
| List all (admin) | Query GSI1 `STATUS#draft` and `STATUS#published` (and `deleted` if needed), merge/sort client-side or two queries |
| List published by date | Query GSI1 `STATUS#published`, `ScanIndexForward=false` |
| List by tag (published) | See tag items below |
| Enforce slug uniqueness | Conditional put on `SLUG#` / `POST` |
| Soft delete | Set `status=deleted`, move GSI1 keys to `STATUS#deleted` |

### Tag index items

For each tag on a **published** post, maintain:

`TAG#<tag>` / `TS#<publishedAt>#POST#<postId>` with `gsi2pk`/`gsi2sk` mirroring
pk/sk (or project from GSI2 only). Simpler pattern used here:

| Keys | |
| --- | --- |
| `pk` | `TAG#<normalizedTag>` |
| `sk` | `TS#<publishedAt>#POST#<postId>` |
| `gsi2pk` | same as `pk` |
| `gsi2sk` | same as `sk` |
| `postId`, `slug` | denormalized for list cards |

On publish/unpublish/tag edit, rewrite these sparse items in a transaction with
`META`.

List by tag: `Query` `pk = TAG#x` (or GSI2), newest first.

## Resume (singleton)

One item holds the structured resume edited in `/admin/resume` and rendered to
`resume/index.html` by the publisher (CHR-84 / CHR-89).

#### `RESUME#current` / `META`

| Attr | Notes |
| --- | --- |
| `entityType` | `resume` |
| `resumeId` | `current` |
| `name` | Display name in the page header |
| `pdfPath` | Always `/resume.pdf` in practice; publisher regenerates that object via pdf-lib on publish |

No GSI keys: the singleton is always read with `GetItem`. Admin post listing
filters `entityType = 'post'` so `STATUS#*` queries never surface the resume.

`GET /api/admin/resume` seeds the item from `DEFAULT_RESUME` with
`status=published` the first time it is read, so the next publisher run emits
live HTML (and `/resume.pdf`) that matches the pre-CMS page. Publish/unpublish
flow through the same `META` stream the blog uses; a draft or missing resume
leaves the existing `resume/index.html` and `resume.pdf` in place rather than
deleting them.

## Home (singleton)

One item holds the home page header + About Me copy edited in `/admin/home`
and prerendered into `index.html` by the publisher (CHR-92).

#### `HOME#current` / `META`

| Attr | Notes |
| --- | --- |
| `entityType` | `home` |
| `homeId` | `current` |
| `name` | Header name (`<h1>`) |
| `title` | Header subtitle, e.g. `Engineering Leader` |
| `about` | About Me body text; blank lines separate paragraphs |

Same singleton conventions as the resume: no GSI keys, `GET /api/admin/home`
seeds from `DEFAULT_HOME` with `status=published` on first read, and a draft or
missing item leaves the live `index.html` alone.

`index.html` is both the Vite SPA shell and the home page. Web deploy uploads
the empty shell and then invokes `republishAll`, which re-injects the home
prerender. The publisher wraps every `#root` prerender in
`<!--prerender:start--> … <!--prerender:end-->` markers so `index.html` can be
read back as a clean shell for `/blog` and `/resume`. Quick Links and the
profile photo stay hard-coded in React for now.

## Notebook (reserved key space)

No Notebook APIs in this ticket; keys are reserved so posts never collide.

| Entity | `pk` | `sk` | GSI1 |
| --- | --- | --- | --- |
| Note | `NOTE#<noteId>` | `META` | `TYPE#NOTE` / `TS#<updatedAt>#NOTE#<id>` |
| Task | `TASK#<taskId>` | `META` | `TYPE#TASK` / `STATUS#<open\|done>#TS#...` |
| Note slug (optional) | `NSLUG#<slug>` | `NOTE` | — |

Access patterns to support later: get note by id, list notes by updated, get/list
tasks by status. Use `TYPE#*` on GSI1 so Notebook lists never scan `STATUS#*`
post partitions.

## Conventions

- Timestamps: UTC ISO-8601 with millisecond precision.
- Tag normalization: trim, lowercase, collapse internal whitespace to `-`.
- Transactions: slug claim + `META` (+ tag rows) in one `TransactWriteItems`
  where uniqueness matters.
- Streams: publisher consumes `META` modifications when `status` becomes
  `published` or content changes while published (CHR-34).
