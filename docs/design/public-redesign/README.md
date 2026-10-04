# Public site redesign (B · Editorial)

Reference designs for the public site on `gagnechris.com`. The source is the
"Public Site Redesign" Claude design canvas, row B. Screenshots of each
artboard are attached to their Linear stories; they are not stored in this
repo. Row A is the rejected alternative.

| Artboard                | Size      | Shows                                                                                                                           | Story                                |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| All B artboards         | —         | Site header (photo, name, Posts / Projects / Resume / Contact) and footer (©, RSS, Don't feed the bears)                        | CHR-219 (Projects link: CHR-228)     |
| Home                    | 1440×1700 | Name, italic title, About lede, inline links sentence, Recent posts, What I'm building (two project cards)                      | CHR-220 (What I'm building: CHR-228) |
| Post                    | 1440×1435 | Meta line (date · reading time), title, italic excerpt, serif body with h2 and lists, author note after a dark rule             | CHR-221                              |
| Posts                   | 1440×1000 | Title, italic description, Subscribe via RSS, posts grouped under year labels with short dates on the right                     | CHR-222                              |
| Resume                  | 1440×3576 | Title, italic headline, Summary lede, Download PDF / LinkedIn / Get in touch, dated experience, earlier roles collapsed, skills | CHR-223                              |
| Projects                | 1440×1532 | Title, italic intro, project entries with preview, status label, name, pitch, stack line                                        | CHR-228                              |
| Project Posts (demo)    | 1440×2200 | Project page template with the Posts demo (editor and public page side by side) and Build log                                   | CHR-229 (template), CHR-231 (demo)   |
| Project Notebook (demo) | 1440×2300 | Project page template with the Notebook demo (mini Today) and Build log                                                         | CHR-229 (template), CHR-232 (demo)   |
| Phone · Contact         | 393×852   | Header with the menu button, Contact title, intro, labelled form, full-width button                                             | CHR-226                              |
| Phone · 404             | 393×852   | "404" label, Page not found, one sentence, Home / Posts / Projects / Resume rows (Projects: CHR-228), bears line                | CHR-226                              |
| Phone · Bears landing   | 393×852   | Kicker, title, game cards with shorter copy                                                                                     | CHR-226 (heading only)               |
| Phone · Menu open       | 393×852   | Full-screen menu: sections with chevrons, then LinkedIn, GitHub, RSS and Don't feed the bears                                   | —                                    |
| Phone · Home/Posts/Post | 393×852   | Phone header with the menu button; Home, Posts and Post (reading) at phone size                                                 | —                                    |

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
| Demo slot           | Up to about 1100px wide (CHR-229)                                                      |

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

Values from the stories unless marked measured.

| Use                                  | Face       | Size / weight / line height                     | Story   |
| ------------------------------------ | ---------- | ----------------------------------------------- | ------- |
| Home name                            | Newsreader | 68px / 500                                      | CHR-220 |
| Home title line                      | Newsreader | italic 26px, `link` colour (measured)           | CHR-220 |
| Home About lede                      | Newsreader | 23px / 1.6                                      | CHR-220 |
| Home links sentence                  | Newsreader | 20px / 1.6 (measured)                           | CHR-220 |
| Home Recent posts title              | Newsreader | 30px / 500 (measured)                           | CHR-220 |
| Home Recent posts excerpt            | Newsreader | 19px, `inkSoft` (measured)                      | CHR-220 |
| Home Recent posts date               | Inter      | 13.5px, `neutral-600` (measured)                | CHR-220 |
| Post, Posts and Project titles       | Newsreader | 60px / 500                                      | CHR-221 |
| Post excerpt subtitle                | Newsreader | italic 24px                                     | CHR-221 |
| Post body                            | Newsreader | 21px / 1.7, measure about 680px                 | CHR-221 |
| Post h2                              | Newsreader | 32px / 500                                      | CHR-221 |
| Post meta (date · N min read)        | Inter      | 13px                                            | CHR-221 |
| Resume role ("Title _at Company_")   | Newsreader | 25px / 500 / 1.3 (measured)                     | CHR-223 |
| Resume bullets                       | Newsreader | 18px / 1.6 (measured)                           | CHR-223 |
| Resume date column                   | Inter      | 13px, tabular figures, 150px column             | CHR-223 |
| Section labels (RECENT POSTS, years) | Inter      | about 13px / 600, uppercase, tracked (measured) | CHR-220 |
| Section label rule                   | —          | 1px ink, full column width (measured)           | CHR-220 |

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

Projects is listed only when `SITE_PROJECTS_LIVE` (`packages/shared/src/site-config.ts`) is on; the header nav reads the same list.

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

| Element  | Value                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Label    | "404", Inter 13px / 600, tracked 0.12em, `neutral-600`; 20px from its cap top to the title's (measured)                                                                                                                  |
| Title    | "Page not found", Newsreader 44px / 500, line height 1.1 (measured); 60px on desktop (not drawn)                                                                                                                         |
| Sentence | "This page wandered off. Unlike Vermont’s bears, it wasn’t lured by snacks." Newsreader 19px / 1.5, #2b3138 (measured); 21px on desktop (not drawn)                                                                      |
| Links    | Home, Posts, Resume as rows: 1px ink rule above, 1px `neutral-200` rule under each, 56px rows, Newsreader 24px ink, grey (`neutral-400`) chevron on the right; 48px from the sentence's last line to the rule (measured) |
| Bears    | "Don’t feed the bears while you’re here.", Inter 15px ink, the link in `link` underlined; 23px below the last rule (measured)                                                                                            |

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
40px / 500 (32px on phones). On phones (Phone · Bears landing, measured) the
kicker is Inter 12px / 600, tracked 0.1em, 2px above a 40px title, and the
lede is 20px (not drawn: the artboard has no lede).

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
`index.html` and `src/public.css`, then run `npm run not-found:generate`.

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
