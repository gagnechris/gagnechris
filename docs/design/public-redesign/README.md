# Public site redesign (B · Editorial)

Reference designs for the public site on `gagnechris.com`. The source is the
"Public Site Redesign" Claude design canvas, row B. Screenshots of each
artboard live in Linear, not in this repo. Row A is the rejected alternative.

| Artboard                | Size      | Shows                                                                                                                           |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| All B artboards         | —         | Site header (photo, name, Posts / Projects / Resume / Contact) and footer (©, RSS, Don't feed the bears)                        |
| Home                    | 1440×1700 | Name, italic title, About lede, inline links sentence, Recent posts, What I'm building (two project cards)                      |
| Post                    | 1440×1435 | Meta line (date · reading time), title, italic excerpt, serif body with h2 and lists, author note after a dark rule             |
| Posts                   | 1440×1000 | Title, italic description, Subscribe via RSS, posts grouped under year labels with short dates on the right                     |
| Resume                  | 1440×3576 | Title, italic headline, Summary lede, Download PDF / LinkedIn / Get in touch, dated experience, earlier roles collapsed, skills |
| Projects                | 1440×1532 | Title, italic intro, project entries with preview, status label, name, pitch, stack line                                        |
| Project Posts (demo)    | 1440×2200 | Project page template with the Posts demo (editor and public page side by side) and Build log                                   |
| Project Notebook (demo) | 1440×2300 | Project page template with the Notebook demo (mini Today) and Build log                                                         |
| Phone · Contact         | 393×852   | Header with the menu button, Contact title, intro, labelled form, full-width button                                             |
| Phone · 404             | 393×852   | "404" label, Page not found, one sentence, Home / Posts / Projects / Resume rows, bears line                                    |
| Phone · Bears landing   | 393×852   | Kicker, title, game cards with shorter copy                                                                                     |
| Phone · Menu open       | 393×852   | Full-screen menu: sections with chevrons, then LinkedIn, GitHub, RSS and Don't feed the bears                                   |
| Phone · Home/Posts/Post | 393×852   | Phone header with the menu button; Home, Posts and Post (reading) at phone size                                                 |

The PNG exports are 2×; measured values below are at 1×. The phone layout
applies at `max-width: 480px`; wider viewports use the desktop values.

## Layout

| Item                | Value                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| Column              | 720px, centred (x 360–1080 on the 1440 artboard), 24px gutters                         |
| Ground              | White, no panels, cards or left stripes                                                |
| Header              | Photo top at 30px (measured); 44px tap targets, so the header row starts at 28px       |
| Header → first text | About 100px from the header row to the first line of page content (measured)           |
| Footer              | Last text line 48px above the page bottom (measured); at least 96px below page content |
| Demo slot           | Up to 1072px wide, centred on the page (see Project page)                              |

## Header and footer (measured)

| Element              | Value                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Photo                | 40px circle, 12px gap to the name                                                                         |
| Name                 | Newsreader 20px / 500, ink                                                                                |
| Nav links            | Inter 14px / 500, `neutral-700` (#384259); 12px horizontal padding, 4px between links (28px text to text) |
| Current nav link     | Inter 14px / 600, ink, 1px underline 6px below the baseline                                               |
| Nav right edge       | Last label ends 12px inside the column                                                                    |
| Footer text          | Inter 13px / 400, `neutral-600` (#4d5871); © on the left, links on the right                              |
| Footer links         | Underlined (1px, 3px offset), 20px apart, last one flush with the column                                  |
| At 390px (see Phone) | Photo 32px, name 19px; a menu button replaces the nav                                                     |

## Type scale

Values from the design unless marked measured.

| Use                                  | Face       | Size / weight / line height                     |
| ------------------------------------ | ---------- | ----------------------------------------------- |
| Home name                            | Newsreader | 68px / 500                                      |
| Home title line                      | Newsreader | italic 26px, `link` colour (measured)           |
| Home About lede                      | Newsreader | 23px / 1.6                                      |
| Home links sentence                  | Newsreader | 20px / 1.6 (measured)                           |
| Home Recent posts title              | Newsreader | 30px / 500 (measured)                           |
| Home Recent posts excerpt            | Newsreader | 19px, `inkSoft` (measured)                      |
| Home Recent posts date               | Inter      | 13.5px, `neutral-600` (measured)                |
| Post, Posts and Project titles       | Newsreader | 60px / 500                                      |
| Post excerpt subtitle                | Newsreader | italic 24px                                     |
| Post body                            | Newsreader | 21px / 1.7, measure about 680px                 |
| Post h2                              | Newsreader | 32px / 500                                      |
| Post meta (date · N min read)        | Inter      | 13px                                            |
| Resume role ("Title _at Company_")   | Newsreader | 25px / 500 / 1.3 (measured)                     |
| Resume bullets                       | Newsreader | 18px / 1.6 (measured)                           |
| Resume date column                   | Inter      | 13px, tabular figures, 150px column             |
| Section labels (RECENT POSTS, years) | Inter      | about 13px / 600, uppercase, tracked (measured) |
| Section label rule                   | —          | 1px ink, full column width (measured)           |

## Post (measured)

| Element               | Value                                                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column                | 680px measure, centred (x 380–1060); 20px inside the 720px column                                                                                                                                                                        |
| Meta line             | Inter 13px, `neutral-600`; "February 1, 2026 · 1 min read"; cap top 102px below the header row                                                                                                                                           |
| Title                 | Newsreader 60px / 500, line height 1.1, -0.01em; 14px below the meta line                                                                                                                                                                |
| Excerpt               | Newsreader italic 24px / 1.4, `inkSoft`; 17px below the title                                                                                                                                                                            |
| Body                  | Newsreader 21px / 1.7 (35.7px lines), #22272d; paragraphs 1.2em apart; first line 48px below the excerpt                                                                                                                                 |
| h2                    | Newsreader 32px / 500, line height 1.25; 1.75em above, 0.5em below                                                                                                                                                                       |
| Links                 | `link`, underlined 1px at 0.18em offset (2px on hover)                                                                                                                                                                                   |
| Author note           | 64px below the body, 1px ink rule, 24px above the text; Newsreader 19px / 1.6, #2b3138; name in ink at 500                                                                                                                               |
| Reading time          | `readingMinutes`: words / 230, rounded, at least 1                                                                                                                                                                                       |
| Not drawn (our specs) | Blockquote: italic `inkSoft`, 2px ink rule. Code: system mono at 0.8em on `neutral-100`; blocks scroll in a bordered box. Figure caption: Inter 13px `neutral-600`. Tables scroll in their box; header rule ink, row rules `neutral-200` |
| At 390px (not drawn)  | h2 26px, author note 17px; the rest is under Phone                                                                                                                                                                                       |

## Posts (measured)

| Element              | Value                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column               | Full 720px column                                                                                                                                   |
| Title                | "Posts", Newsreader 60px / 500, line height 1.1; cap top 99px below the header row                                                                  |
| Intro                | "Ideas, lessons and experiments from software engineering, leadership and AI." Newsreader italic 24px / 1.4, `inkSoft`                              |
| Subscribe via RSS    | Inter 14px / 500, `link`, 1px underline 3px below the baseline, 44px target; links to `/rss.xml`                                                    |
| Year label           | Inter 13px / 600, tracked 0.12em, ink; 13px above a 1px ink rule across the column                                                                  |
| Entry                | One link: title Newsreader 28px / 500 (underlined on hover and focus), short date ("Feb 1") Inter 13px `neutral-600` on the right, baseline-aligned |
| Entry excerpt        | Newsreader 19px / 1.5, `inkSoft`                                                                                                                    |
| Entry spacing        | 25px above the title, 28px below the excerpt, 1px `neutral-200` rule between entries; 56px between years                                            |
| Order                | `groupPostsByYear`: years newest first (UTC), posts newest first; undated posts last under "Undated"                                                |
| At 390px (see Phone) | Title 46px, intro 19px, entry title 24px, excerpt 17px; the date goes under the excerpt                                                             |

## Projects (measured)

| Element              | Value                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column               | Full 720px column                                                                                                                                                                                                                                                                  |
| Title                | "Projects", as the Posts title (Newsreader 60px / 500)                                                                                                                                                                                                                             |
| Intro                | "Things I’m building, mostly for myself, in the open. Most of them sit behind a login, so some pages have a demo you can play with." Newsreader italic 24px / 1.4, `inkSoft`; 56px to the list rule                                                                                |
| List                 | 1px ink rule above, 1px `neutral-200` rule under each entry; entries ordered by `order`, then name                                                                                                                                                                                 |
| Entry                | One link (an unlinked `<div>` for an `idea` with no body): 240×160 preview, 32px gap, text column; 36px above and below                                                                                                                                                            |
| Stage label          | Inter 12px / 600 with an 8px dot 8px before it; text "Live", "Building" or "Idea", then " · " and `stageNote` when set                                                                                                                                                             |
| Live                 | Dot `primary-600` (#2d7471), text `link`                                                                                                                                                                                                                                           |
| Building             | Dot #c28d24, text #7a5a12; the dot fades to 35% and back every 2.4s, not under `prefers-reduced-motion`                                                                                                                                                                            |
| Idea                 | 1.5px dashed `neutral-600` ring, text `neutral-600`                                                                                                                                                                                                                                |
| Name                 | Newsreader 32px / 500, line height 1.2, ink, 8px below the label; underlined on hover and focus                                                                                                                                                                                    |
| Pitch                | Newsreader 19px / 1.5, `inkSoft`, 10px below the name                                                                                                                                                                                                                              |
| Stack line           | Inter 13px / 1.4, `neutral-600`, items joined with " · ", 8px below the pitch                                                                                                                                                                                                      |
| Preview image        | `previewImage`, `object-fit: cover`, 12px radius, no border                                                                                                                                                                                                                        |
| Mini-UI (no image)   | 12px radius, 1px border, 14px padding: two white panes (1px `neutral-200`, 6px radius, 10px padding, 8px apart) with 8px title bars, 5px `neutral-300` and 4px `neutral-200` lines                                                                                                 |
| Mini-UI by `demo`    | `posts`: `primary-50` ground, `primary-100` border, an editor pane with a 44×16 `primary-600` button and a preview pane headed "Welcome". `notebook`: `neutral-50` ground, `neutral-200` border, a wider pane with a done and an open task, and a side pane. None: two plain panes |
| Idea preview         | 1px dashed `neutral-300` box, "Coming soon" Inter 13px `neutral-500` (deviation: the artboard's `neutral-400` is about 2.5:1 on white)                                                                                                                                             |
| Focus                | The global 2px `link` outline, 4px outside the entry                                                                                                                                                                                                                               |
| Empty state          | "Nothing to show yet. The first project is on its way." Newsreader 19px `inkSoft`, 25px under the rule (not drawn)                                                                                                                                                                 |
| At 390px (see Phone) | The preview spans the column, 130px tall, above the text; no stack line                                                                                                                                                                                                            |
| Not as drawn         | The second intro sentence says "some pages" (the artboard: "each page"), since not every project has a demo; phones show both sentences (the phone artboard has only the first)                                                                                                    |

## Home · What I’m building (measured)

| Element    | Value                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section    | Below Recent posts: label row as Recent posts ("WHAT I’M BUILDING", All projects → `/projects`); 100px from the last Recent posts rule to the label                                    |
| Cards      | Up to two projects that are not ideas, by `order`; two columns, 32px apart, 32px below the rule                                                                                        |
| Card       | Same markup as the Projects entry, stacked: preview full width, 188px tall; label 15px below; name Newsreader 28px, 14px below; pitch Newsreader 18px / 1.5, 12px below; no stack line |
| Links line | "Read my posts, see what I’m building, check out my resume, or find me on LinkedIn and GitHub."                                                                                        |
| At 390px   | Not drawn: the cards stack like Projects entries, All projects is hidden as All posts is                                                                                               |

## Project page (measured)

Measured on B · Project Posts (demo) and B · Project Notebook (demo). Positions
are glyph tops on the 1440 artboard.

| Element               | Value                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                | Full 720px column. "Projects" back link (Inter 14px / 500, `link`, underlined on hover) at y 162.5, 90px below the header row (10px above the shared header gap)                                                  |
| Stage label           | As on Projects (dot, "Live · since 2026"); 34.5px below the back link                                                                                                                                             |
| Name                  | Newsreader 60px / 500, line height 1.1; 33px below the stage label                                                                                                                                                |
| Pitch                 | Newsreader italic 24px / 1.45 (35px lines), `inkSoft`; 83.5px from the name's top                                                                                                                                 |
| Try it slot           | Only when `demo` is set. Up to 1072px wide (x 184–1256, the Posts demo's box), centred; 1px `neutral-200` border, 16px radius, soft shadow                                                                        |
| Try it label          | "TRY IT", Inter 13px / 600, tracked 0.12em, ink; at the 680px body measure; 88px below the pitch's last line, 29px above the box                                                                                  |
| Slot fallback         | Until a demo loads, and with JavaScript off: the project's `previewImage` at the Posts box ratio (1072 × 444, `object-fit: cover`, top aligned), or the card's mini-UI at 444px tall                              |
| Slot → body           | 75px from the slot's last line (the box, or the demo's caption when it has one) to the first heading                                                                                                              |
| Body                  | Post reading styles (Newsreader 21px / 1.7, #22272d) at the 680px measure (x 380–1060); h2 32px with 1.55em above (83px from the last paragraph line to the heading)                                              |
| Numbered steps        | An ordered list: 1px `neutral-200` rule above and under each step, 16px padding; number Inter 13px / 600 `link` ("01"); text Newsreader 19px / 1.6, 48px in from the measure                                      |
| Label/value rows      | A bulleted list whose items each start with a bold label (`- **Label** value`) renders as a `<dl>`: rules and padding as steps; label Inter 13px / 600 `neutral-700`, value Newsreader 19px / 1.6 at x 578        |
| Stack line            | Inter 13px / 1.4, `neutral-600`, " · " between items; 23px below the last rule                                                                                                                                    |
| Links                 | Not drawn: Inter 14px / 500, `link`, underlined, 20px apart, 44px targets, under the stack line                                                                                                                   |
| Build log heading     | Newsreader 32px / 500; 72.5px below the stack line; 1px `neutral-200` rule 51.5px below its top                                                                                                                   |
| Build log entry       | One link to the post: title Newsreader 24px / 500 (underlined on hover and focus) 25px below the rule; full date ("February 1, 2026") Inter 13px `neutral-600` 42.5px below the title; rule 32.5px below the date |
| Build log order       | Published posts tagged with the project, newest first                                                                                                                                                             |
| Build log empty state | "No posts about <name> yet. Follow along via RSS." with the second sentence linking `/rss.xml`; Newsreader 21px, `inkSoft`; 58.5px below the heading, no rule                                                     |
| Not as drawn          | The Try it label sits on the body measure at x 380 (the artboard has 384.5)                                                                                                                                       |

## Posts demo (B · Project Posts (demo), measured)

`apps/web/src/demos/posts/`. The kit's `DemoFrame` in its `split` layout: the
slot draws no box, the note sits on the label row and Reset is in the editor
toolbar.

| Element          | Value                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note             | "Write on the left, publish, watch the right. Nothing is saved." Inter 13px, `neutral-600`, on the "TRY IT" line, right edge at the measure's (x 1060)                                                                                                                                                                                                                      |
| Panes            | Two 526 × 444px cards (x 184–710 and 730–1256), 20px apart; 1px `neutral-200` border, 16px radius, the slot's soft shadow                                                                                                                                                                                                                                                   |
| Editor bar       | 55px, white, 1px `neutral-200` rule: "EDITOR" Inter 12px / 600 tracked, `neutral-600`; the kit `StatusBadge`; Reset and Publish (kit `Button`, 13px) on the right                                                                                                                                                                                                           |
| Editor body      | `neutral-50`, 16px padding: title input 43px tall, Inter 17px / 700; slug preview `/posts/<slug>` mono 12px `neutral-600`; the kit CodeMirror editor (no line numbers) fills the rest, then a one-line markdown hint (12px)                                                                                                                                                 |
| Public bar       | 36px: "PUBLIC SITE" as "EDITOR"; the page's path (`/` or `/posts/<slug>`) Inter 13px `neutral-600` on the right                                                                                                                                                                                                                                                             |
| Public page      | White, 24px padding, Newsreader. The publisher's own markup (`renderHomeRecentPostsHtml`, `renderPostPageBodyHtml`) at pane scale: section label 11px, Recent posts title 22px, date 12px; post title 30px, body 16px / 1.6                                                                                                                                                 |
| Highlight        | After Publish the new post's Home row fades from `primary-100` over 2.4s, once per publish                                                                                                                                                                                                                                                                                  |
| Post page/Home   | Two buttons under the page, 32px tall, 8px apart, 13px / 600, 1px `neutral-300`; the current one ink with white text                                                                                                                                                                                                                                                        |
| Caption          | Inter 13px / 1.4, `neutral-600`, on the body measure, 14px under the panes. Draft: "Draft: only the editor sees it. The public side still shows what’s live." Published: "Published. In the real system this rebuilds …"                                                                                                                                                    |
| At 760px or less | Panes stack, editor first, 16px apart; the note moves under the label and reads "Write above, publish, watch below. Nothing is saved." (CSS swaps the wording); the editor is 220px tall and the public pane grows with its page                                                                                                                                            |
| Preview image    | `posts-demo-preview.png` in this folder: the two panes cropped from the artboard at 2× (2144 × 888, the slot's 1072 × 444 ratio), for the Posts project's `previewImage`                                                                                                                                                                                                    |
| Not as drawn     | The status chip is the admin's `StatusBadge` (uppercase, grey Draft) rather than the artboard's yellow "Draft". The artboard shows Home with "Post page" dark; here the dark button is the current page and Home is first. Before the first Publish the Post page says "Nothing at /posts/<slug> yet. Publish to put it here." The Unpublished changes caption is not drawn |

## Notebook demo (B · Project Notebook (demo), measured)

`apps/web/src/demos/notebook/`. A mini Today in the kit's `DemoFrame` `split`
layout, built from the kit task pieces on a reducer: `TaskEmbedRow` for the
note's tasks, `TaskSyntaxInput` (with its @ date menu) for the input,
`StillOpenPanel` and `ComingUpPanel` in their `compact` form, and
`bucketTodayTasks` / `stillOpenSource` for what lands where. The input is
parsed by `parseTaskSyntax` from `@gagnechris/shared`, the parser the Notebook
app uses. "Today" is the visitor's local day when the demo loads (or is
reset); the sample is dated relative to it.

| Element          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note             | "Sample data, runs in your browser, nothing is saved" on the "TRY IT" line, as the Posts demo's                                                                                                                                                                                                                                                                                                                                                                                          |
| Box              | 992px wide (x 224–1216), centred in the slot; 1px `neutral-200` border, 16px radius, the slot's soft shadow                                                                                                                                                                                                                                                                                                                                                                              |
| Bar              | 62px, white, 1px `neutral-200` rule: "Work notebook" Inter 12px `neutral-600`, the day ("Friday, October 2") Inter 17px / 700; "Reset demo" (kit `Button`, 13px) on the right                                                                                                                                                                                                                                                                                                            |
| Body             | `neutral-50`, 20px padding; the note card and a 240px side column, 20px apart                                                                                                                                                                                                                                                                                                                                                                                                            |
| Note card        | White, 1px `neutral-200`, 12px radius, 20px / 24px padding: "Standup" 15px / 600, one 14px paragraph, then the embedded tasks (30px rows, the `High` pill)                                                                                                                                                                                                                                                                                                                               |
| Task input       | Under a dashed `neutral-200` rule: a dashed 16px box, the input (mono 13px, no border, placeholder "Type a task, then Enter. Try: Call Sam @mon !high") and a 36px primary Add button                                                                                                                                                                                                                                                                                                    |
| Hint             | 11.5px `neutral-600` under the input, a polite live region: "Tokens: @mon … @sun, @tomorrow, @someday, !high" until something happens, then what just happened, e.g. "Scheduled for Mon. It stays in this note and shows up under Coming up."                                                                                                                                                                                                                                            |
| Still open       | Compact panel: "Still open" 13px / 600 with "from earlier days" 11px on the right, a rule; each row the title (13px), its source ("Thu note · 1 day", 11px `neutral-600`) and a "+ Note" pill (30px, 11px / 700 `primary-800`, `neutral-200` border) that moves it into the note                                                                                                                                                                                                         |
| Coming up        | Compact panel, 16px below: one list, a 13px checkbox, the title and a short day ("Sat", "Mon", else "Oct 12") in 10.5px / 700 `primary-700` on the right                                                                                                                                                                                                                                                                                                                                 |
| Behaviour        | A typed task goes into the note; with a future date (within 14 days) it is also listed under Coming up. "+ Note" moves a Still open task into the note and focuses its checkbox. Checking a task anywhere checks the one task everywhere it shows; done tasks leave the panels                                                                                                                                                                                                           |
| At 760px or less | Phone · Project Notebook demo: the note reads "· nothing is saved" on the TRY IT line; the box fills the column with no shadow; the bar is 52px with the day at 16px and "Reset"; no kicker, note title or paragraph; tasks on the grey ground in 40px rows; a bordered 44px input with "Try: Call Sam @mon !high" and a 44px Add; then Still open · n / Coming up · n tabs (44px, 3px `primary-600` underline on the current one; arrow keys move between them) over the selected panel |
| Preview image    | `notebook-demo-preview.png` in this folder: the demo box cropped from the artboard at 2× with a margin (x 184–1256, y 450.5–894.5 on the 1440 artboard: 2144 × 888, the slot's 1072 × 444 ratio), for the Notebook project's `previewImage`                                                                                                                                                                                                                                              |
| Not as drawn     | Still open lists the oldest task first, as the Notebook app does (the artboard has the 1-day task first). The phone artboard's caption "On phones the side panels become tabs under the note." is an annotation, not drawn on the page. The hint line is kept on phones                                                                                                                                                                                                                  |

## Phone (measured)

Measured on the 393pt artboards and checked at a 390px viewport. The artboards
start with an empty status-bar area, so vertical positions are taken from the
centre of the header photo, not from the top. Positions are glyph top to glyph
top. Tolerances: positions ±2px, font sizes ±1px.

### Header and menu

| Element      | Value                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column       | 20px gutters (x 20–373 on the 393 artboard)                                                                                                                                         |
| Header row   | 16px top padding (the artboard's status bar is not measured), 44px row; 32px below it to the page                                                                                   |
| Photo, name  | 32px photo, 10px gap, name Newsreader 19px / 500                                                                                                                                    |
| Menu button  | 44×44 target; icon three 2px ink bars, 17px wide, 4px apart, its right edge 6px inside the column, centred on the photo                                                             |
| Open menu    | Full-screen white panel under the header, which stays at the top of the screen; the page underneath does not scroll; no animation                                                   |
| Menu items   | Posts / Projects / Resume / Contact, Newsreader 32px / 500, ink; 65px rows (1px `neutral-200` rule under each); first row 17px below the header row                                 |
| Chevron      | 8px, 1.5px `neutral-400` (#9ba5b7) stroke, 8px inside the column                                                                                                                    |
| Bottom links | LinkedIn, GitHub, RSS in `link`, then "Don’t feed the bears" in `neutral-600` on its own line; Inter 15px / 400, underlined 1px at 3px, 20px apart; last line 46px above the bottom |
| Not as drawn | The bottom links are 44px targets, so their lines are 44px apart (30px on the artboard)                                                                                             |

`SITE_PROJECTS_LIVE` (`packages/shared/src/site-config.ts`) takes Projects out of the menu and the header nav when it is off.

### Home

| Element            | Size                                  | From the element above                                     |
| ------------------ | ------------------------------------- | ---------------------------------------------------------- |
| Name               | Newsreader 46px / 500                 | 64px from the photo centre                                 |
| Title              | Newsreader italic 21px                | 55px                                                       |
| About              | Newsreader 19px / 1.55 (29.5px lines) | 44px                                                       |
| Links sentence     | Newsreader 17px / 1.55 (26.5px lines) | 45px from the last About line                              |
| RECENT POSTS label | Inter 13px / 600                      | 52.5px from the last links line; rule 22px below the label |
| Post title         | Newsreader 24px / 500                 | 21px below the rule                                        |
| Excerpt            | Newsreader 17px / 1.45                | 34px                                                       |
| Date               | Inter 13.5px                          | 28px from the last excerpt line; rule 30px below           |
| All posts link     | Hidden (not on the artboard)          | —                                                          |

### Projects

| Element     | Size                          | From the element above                       |
| ----------- | ----------------------------- | -------------------------------------------- |
| Title       | Newsreader 46px / 500         | 57px from the photo centre                   |
| Intro       | Newsreader italic 18px / 1.45 | 59.5px; list rule 16.5px below its last line |
| Preview     | Full column, 130px tall       | 20.5px below the rule                        |
| Stage label | Inter 12px / 600              | 10.5px below the preview                     |
| Name        | Newsreader 26px / 500         | 22px                                         |
| Pitch       | Newsreader 17px / 1.45        | 40px; rule 41px below its last line          |
| Stack line  | Hidden (not on the artboard)  | —                                            |

The phone artboard draws the Building label in #c08a1e (about 2.8:1 on white);
the label uses the desktop #7a5a12 and only the dot is amber.

### Posts

| Element           | Size                          | From the element above                             |
| ----------------- | ----------------------------- | -------------------------------------------------- |
| Title             | Newsreader 46px / 500         | 62.5px from the photo centre                       |
| Intro             | Newsreader italic 19px / 1.45 | 60px                                               |
| Subscribe via RSS | Inter 14px / 500              | 36px from the last intro line                      |
| Year label        | Inter 13px / 600              | 45px; rule 22px below the label                    |
| Entry title       | Newsreader 24px / 500         | 21px below the rule                                |
| Excerpt           | Newsreader 17px / 1.45        | 34px                                               |
| Date              | Inter 13px, under the excerpt | 27.5px from the last excerpt line; rule 30px below |

### Post

| Element    | Size                                  | From the element above          |
| ---------- | ------------------------------------- | ------------------------------- |
| Meta line  | Inter 13px                            | 58px from the photo centre      |
| Title      | Newsreader 42px / 500                 | 23.5px                          |
| Excerpt    | Newsreader italic 20px / 1.4          | 57px                            |
| Body       | Newsreader 19px / 1.65 (31.4px lines) | 52px from the last excerpt line |
| Paragraphs | 1em apart (50.5px line to line)       | —                               |

The Phone · Post artboard also draws a Text size / share bar at the bottom of
the screen; the site does not have it.

### Project

Measured on Phone · Project Notebook demo.

| Element          | Size                                                                                                            | From the element above            |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Back link        | Inter 14px / 500                                                                                                | 50.5px from the photo centre      |
| Name             | Newsreader 42px / 500                                                                                           | 31px below the stage label        |
| Pitch            | Newsreader italic 18px / 1.45                                                                                   | 54.5px                            |
| Try it label     | Inter 13px / 600                                                                                                | 41.5px from the pitch's last line |
| Slot             | Full column; the fallback mini-UI is 254px tall (the artboard's demo box), the image keeps the 1072 × 444 ratio | 20px below the label              |
| Label/value rows | Label above the value                                                                                           | —                                 |

The phone artboard leaves out the stage label; the page keeps it, as the
phone Projects list does, so the name sits one label lower than drawn.

## Resume (measured)

The phone artboard is 393 wide; values for 390px are taken from it.

| Element          | Value                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Column           | Full 720px column                                                                                                                                                                                                                                                                                                                                                                          |
| Title            | "Resume", Newsreader 60px / 500, line height 1.1, -0.01em; cap top 100px below the header row                                                                                                                                                                                                                                                                                              |
| Headline         | `content.headline` as stored, Newsreader italic 24px / 1.4, `inkSoft`, 17px below the title; omitted when unset                                                                                                                                                                                                                                                                            |
| Summary          | Newsreader 21px / 1.6, #2b3138, 28px below the headline                                                                                                                                                                                                                                                                                                                                    |
| Actions          | 28px below the summary, 16px apart. Download PDF: a link with `download`, white on ink, 44px tall, 154px wide, 18px side padding, 6px radius, Inter 14px / 600, 16px arrow icon 8px before the label. LinkedIn and Get in touch: Inter 14px / 500, `link`, 1px underline 3px below the baseline                                                                                            |
| Section labels   | EXPERIENCE, STRENGTHS AND SKILLS, EDUCATION: as the Posts year label (Inter 13px / 600, 0.12em, 1px ink rule 13px below); 56px above the first, 72px between                                                                                                                                                                                                                               |
| Role row         | 150px date column + 32px gap + role; first baselines aligned; 28px above, 32px below, 1px `neutral-200` rule after each role                                                                                                                                                                                                                                                               |
| Dates            | Inter 13px / 1.4, tabular, `neutral-600`; "Jul 2019 – Present" (short month, en dash); a role `note` sits on the next line                                                                                                                                                                                                                                                                 |
| Role             | Title Newsreader 25px / 500, ink; "at Company" italic 400 `inkSoft`                                                                                                                                                                                                                                                                                                                        |
| Bullets          | Newsreader 18px / 1.6, #2b3138, disc markers, 20px indent, 4px between, 12px below the title                                                                                                                                                                                                                                                                                               |
| Earlier roles    | `<details>`: summary row 24px above, 12px below; "Earlier roles, 1999–2012" Inter 14px / 600 `neutral-700`; Show details / Hide details Inter 13px / 500 ink in a 40px box, 1px `neutral-300`, 8px radius, on the right. Closed: one-line rows (date column + Newsreader 20px "Title _at Company_"), 40px tall, `neutral-200` rules. Open: the full role entries replace the one-line rows |
| Competencies     | One line joined with " · ", Newsreader 19px / 1.6, #2b3138, 20px below the label                                                                                                                                                                                                                                                                                                           |
| Technical skills | `Label: value` rows on the date column grid: label Inter 13px / 600 `neutral-700`, value Newsreader 18px / 1.5; 12px padding, `neutral-200` rules                                                                                                                                                                                                                                          |
| Education        | Date column holds `year` as stored; title (with `degreeDetail` after a comma) Newsreader 20px / 400; "Institution, Location" italic 17px `inkSoft`; 18px padding                                                                                                                                                                                                                           |
| At 390px         | Title 40px, headline 20px, summary 19px. Download PDF spans the column, 48px tall, 8px radius, Inter 15px. Dates stack 4px above the role; role title 22px, bullets 17px / 1.5; earlier rows, skill labels and education stack the same way                                                                                                                                                |
| Not drawn        | The phone artboard shows no summary, LinkedIn or Get in touch; the page keeps them below the headline and button. Unpublished: title, "Resume available on request." as the summary, LinkedIn and Get in touch                                                                                                                                                                             |

## Resume PDF

No artboard; the print layout follows the Resume page. Drawn by
`services/publisher/src/resume-pdf.ts` (layout) on the text engine in
`pdf-text.ts` (fonts, measuring, wrapping, page breaks), fonts in
`services/publisher/assets/fonts/`.
The page and the PDF render the same `resumeView(resume)`
(`packages/shared/src/resume-view.ts`): role headings, skill rows, education
lines and section labels, whitespace collapsed. A role with a blank company
shows the title alone, with no "at".

| Element        | Value                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page           | US Letter (612×792pt), 0.6in margins, at most two pages                                                                                                                                             |
| Header         | Name Newsreader Medium 24pt; current role (`content.headline`, else "Title at Company" of the role with no end) Newsreader italic 12pt `inkSoft`; contact line Inter 8.5pt `neutral-600` with links |
| Summary        | Newsreader 10.5pt / 14.5pt, #2b3138                                                                                                                                                                 |
| Section labels | EXPERIENCE, STRENGTHS AND SKILLS, EDUCATION: Inter Bold 8pt uppercase, 0.5pt tracking, 0.75pt ink rule below                                                                                        |
| Date column    | 100pt + 16pt gap; Inter 9pt tabular figures, `neutral-600`, "Jul 2019 – Present", on the role's first baseline                                                                                      |
| Role           | Title Newsreader Medium 12pt ink, "at Company" italic `inkSoft`; 0.5pt `neutral-200` rule between roles                                                                                             |
| Bullets        | Newsreader 10.5pt / 13.6pt, #2b3138, "•" markers, 10pt indent                                                                                                                                       |
| Fit            | If the resume runs past two pages, ended roles drop to one line (date + "Title at Company", 10.5pt), oldest first, until it fits                                                                    |
| Skills         | Competencies joined with " · "; `Label: value` rows with the label in the date column (Inter Bold 8pt `neutral-700`), value Newsreader 10.5pt                                                       |
| Education      | `year` as stored in the date column; title Newsreader 10.5pt; "Institution, Location" italic 9.5pt `inkSoft`                                                                                        |
| Fonts          | Newsreader 16pt static cut (Regular, Italic, Medium) and Inter (Regular, Bold), subset; characters Newsreader lacks use Inter, then `?`                                                             |
| Text           | Drawn in reading order (date, role, bullets), no ligatures, so copy-paste and ATS extraction get plain text                                                                                         |

## Contact (Phone · Contact, measured)

Measured on the 393px Phone · Contact artboard; desktop values (not drawn)
follow the Posts page. The values are the variables at the top of
`apps/web/src/pages/Contact.css`.

| Element             | Value                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Column              | Full 720px column                                                                                                                                                                                                                                       |
| Title               | "Contact", Newsreader 46px / 500, line height 1.1 (measured); 60px on desktop (not drawn)                                                                                                                                                               |
| Intro               | "Say hello. I read everything and reply to most." (placeholder copy) Newsreader italic 19px, `inkSoft`; 25px from the title baseline to the intro, 46px from the intro to the first label (measured); 24px with a 17px gap on desktop (not drawn)       |
| Label               | Inter 14px / 600, `neutral-700`, always visible, 6px above the field (measured)                                                                                                                                                                         |
| Field               | 48px tall, 1px `neutral-500` border (deviation: the artboard's `neutral-300` is about 1.5:1 on white; WCAG 1.4.11 needs 3:1, `neutral-500` is about 5:1), 10px radius, Inter 16px, 14px side padding, placeholder #757575; message box 120px (measured) |
| Placeholders        | "Your name", "you@example.com", "What’s on your mind?" (measured)                                                                                                                                                                                       |
| Field spacing       | 85px from one label to the next (measured)                                                                                                                                                                                                              |
| Button              | "Send message", full width, 50px tall, 10px radius, Inter 16px / 600, white on `link`, 14px below the message box (measured); auto width with 24px side padding on desktop, `primary-800` on hover (not drawn)                                          |
| Focus (not drawn)   | Border and 2px outline in `link`, 1px offset                                                                                                                                                                                                            |
| Error (not drawn)   | `color.error` #b42318 (6.6:1 on white): field border 2px, message Inter 14px / 500 below the field, linked with `aria-describedby`                                                                                                                      |
| Status (not drawn)  | One `role="alert"` line above the button: "Please fix the N highlighted fields." or the send error (429 included); 1px error border, #fef3f2                                                                                                            |
| Success (not drawn) | Replaces the form: Newsreader 32px / 500 heading (26px on phones, focused), Newsreader 19px / 1.6 line in #2b3138, Home and bears links                                                                                                                 |

## 404 (Phone · 404, measured)

Measured on the 393px Phone · 404 artboard; desktop sizes (not drawn) follow
the Posts page. The values are the variables at the top of
`apps/web/src/pages/NotFound.css`.

| Element  | Value                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label    | "404", Inter 13px / 600, tracked 0.12em, `neutral-600`; 20px from its cap top to the title's (measured)                                                                                                                            |
| Title    | "Page not found", Newsreader 44px / 500, line height 1.1 (measured); 60px on desktop (not drawn)                                                                                                                                   |
| Sentence | "This page wandered off. Unlike Vermont’s bears, it wasn’t lured by snacks." Newsreader 19px / 1.5, #2b3138 (measured); 21px on desktop (not drawn)                                                                                |
| Links    | Home, Posts, Projects, Resume as rows: 1px ink rule above, 1px `neutral-200` rule under each, 56px rows, Newsreader 24px ink, grey (`neutral-400`) chevron on the right; 48px from the sentence's last line to the rule (measured) |
| Bears    | "Don’t feed the bears while you’re here.", Inter 15px ink, the link in `link` underlined; 23px below the last rule (measured)                                                                                                      |

The meta description stays "That URL does not match a page on this site."
The CloudFront fallback page has the same markup and inlines the rules of
`index.css`, `public.css` and `NotFound.css` that match it.

## Don’t feed the bears

The games and their cards keep their own art. The page heading follows Posts:
kicker Inter 13px / 600, tracked 0.12em, `link`; title Newsreader 60px / 500;
lede Newsreader italic 24px / 1.4, `inkSoft`; 48px to the cards. Card titles
are Newsreader 28px / 500. The notes below the cards are Newsreader 19px / 1.6
in #2b3138, and the tips heading Newsreader 32px / 500. On the game pages, the
back link is Inter 14px / 500 in `link`, underlined, and the title Newsreader
40px / 500 (32px on phones).

### Bears landing on phones

Phone · Bears landing, measured at 393px from the centre of the header photo.

| Element   | Value                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Heading   | Kicker Inter 12px / 600, tracked 0.1em, cap top 48.5px below the photo centre (8px higher than the other phone pages, as drawn); title Newsreader 40px / 1.05 on two lines ("Don’t Feed the / Bears"), 2px below the kicker. No lede |
| Cards     | 14px apart, the first 25px below the title; 1px `neutral-200` border, 16px radius; art 110px tall                                                                                                                                    |
| Card body | 13px top and 16px side and bottom padding; kicker Inter 12px; title Newsreader 26px / 500; one sentence in Newsreader 16px / 1.45, `inkSoft`, 5px below; the 44px button 12px below that. No details line                            |
| Card copy | Camp Rules: "Put food away and keep bears out until dark." Stay Wild: "Fatten up on berries and reach the den before snow." Desktop shows the same sentences                                                                         |
| Below     | The Vermont Fish & Wildlife note and the tips, at their phone sizes (not drawn)                                                                                                                                                      |

### Camp Rules on phones

Phone · Camp Rules (portrait) and Phone · Camp Rules end, at `max-width: 480px`.
Wider viewports keep the desktop game.

| Element      | Value                                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily label  | "Daily camp · Oct 4" ("Random camp" for a random one), Inter 14px `neutral-600`, on the title's baseline at the right                                                                                                         |
| HUD          | Four equal columns: Time, Snacks ("1/3"), Saves, Score (the labels desktop uses too); labels Inter 12px / 600, values 22px / 700; 12px padding                                                                                |
| Field        | 2:3, taller than wide; items and bears are at least 72×72 targets                                                                                                                                                             |
| End screen   | Replaces the HUD and field: kicker Inter 13px / 600, title Newsreader 34px / 500, paws with "60s · 3 saves · score 675" in Inter 15px `neutral-600`, the tip (heading Newsreader 22px) with its underlined source link        |
| End actions  | Play again full width; Share result and the other game side by side, 50px tall, 12px radius                                                                                                                                   |
| Share result | Touch screens with Web Share open the share sheet with "Camp Rules · Oct 4 · held 60s, 3 saves" and the game URL; closing the sheet does nothing. Elsewhere, and if sharing fails, the button is Copy result as on desktop    |
| Not as drawn | The back link, Sound and Skip to the bear tips stay above the HUD; the noise line stays under the HUD stats; the other game keeps "Now play as the bear"; Random camp and Back to Don’t Feed the Bears stay under the actions |
| Not built    | The artboard's haptic on save and on share in the iOS app: the app does not embed the site                                                                                                                                    |

## Colours

| Token           | Value   | Use                                                                |
| --------------- | ------- | ------------------------------------------------------------------ |
| `color.ink`     | #16191d | Name, titles, headings, current nav link, section labels and rules |
| `color.inkSoft` | #4a515a | Excerpts, subtitles, project descriptions (measured)               |
| `color.link`    | #235a58 | Links and accents (`primary-700`)                                  |
| `color.error`   | #b42318 | Form errors (not drawn)                                            |
| `neutral-700`   | #384259 | Nav links (measured)                                               |
| `neutral-600`   | #4d5871 | Dates, meta, footer (measured)                                     |
| —               | #2b3138 | Home About lede and Resume summary prose (measured, not a token)   |
| —               | #22272d | Post body prose (measured, not a token)                            |
| `primary-600`   | #2d7471 | Live status dot (measured); label text in `link`                   |
| —               | #c28d24 | Building status dot (measured); label text #7a5a12                 |

`color.inkSoft` is #4a515a because that is what the artboards use for
secondary text; #2b3138 is the prose colour.

## Fonts

Both families are self-hosted from `apps/web/public/fonts/` under the SIL Open
Font License (licences alongside the files). Each file name ends in the first 8
hex characters of its SHA-256 (`newsreader-roman.c4b10fbd.woff2`), so the URL
changes with the content and the deploy serves fonts as immutable. After
replacing a font, rename it (`shasum -a 256 <file> | cut -c1-8`) and update
`index.html` and `src/public.css`.

| File                        | Source                                                                                                                                                                                    | Axes kept                 | Size  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----- |
| `newsreader-roman.*.woff2`  | Newsreader 1.003, [`google/fonts` `ofl/newsreader/Newsreader[opsz,wght].ttf`](https://github.com/google/fonts/tree/991ce1de6075188e6b8977a5aa9fcd3610a4e946/ofl/newsreader) at `991ce1de` | opsz 6–72, wght 400–500   | 87 KB |
| `newsreader-italic.*.woff2` | Same commit, `Newsreader-Italic[opsz,wght].ttf`                                                                                                                                           | opsz 6–72, wght 400–500   | 97 KB |
| `inter-latin.*.woff2`       | Inter 4.1, [`rsms/inter` release v4.1](https://github.com/rsms/inter/releases/tag/v4.1) (`Inter-4.1.zip`, `InterVariable.ttf`)                                                            | wght 400–700 (opsz at 14) | 34 KB |

All three are subset to the Latin range below with fontTools 4 (`fonttools`
plus `brotli`):

```sh
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
fonttools varLib.instancer 'Newsreader[opsz,wght].ttf' wght=400:500 -o nr-roman.ttf
fonttools varLib.instancer 'Newsreader-Italic[opsz,wght].ttf' wght=400:500 -o nr-italic.ttf
fonttools varLib.instancer InterVariable.ttf wght=400:700 opsz=14 -o inter.ttf
for f in nr-roman nr-italic inter; do
  pyftsubset "$f.ttf" --unicodes="$LATIN" --layout-features+=tnum,case --flavor=woff2 --output-file="$f.woff2"
done
```

The fallback `@font-face` rules in `apps/web/src/public.css` (Georgia for
Newsreader, Arial for Inter) use `size-adjust` and ascent/descent overrides
computed from these files, so the swap barely moves text.
