# Component inventory

Every reusable UI piece in the web apps and iOS, and where one-off elements
stand in for a component. New UI is built from the components listed here. A
missing component is added here and to the library before a feature uses it.

Tokens (`packages/tokens`) are shared by every app. Web CSS reads them as
`var(--…)`; iOS imports them from `@gagnechris/tokens`.

## Primitives

Small, app-agnostic building blocks. Shared web primitives live in
`packages/ui` (`@gagnechris/ui`, styles in `@gagnechris/ui/styles.css`); a few
more sit in `apps/web/src/workspace/ui`. iOS primitives live in
`apps/mobile/src/ui`.

| Component        | Web                                                                                                              | Used by         | iOS counterpart                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| Button           | `@gagnechris/ui` `Button` (`default`, `primary`, `danger`, `ghost`, `link`; `sm`, `md`, `lg`; `loading`; `href`) | Admin, Notebook | `ui/Button.tsx` (`primary`, `secondary`)                          |
| IconButton       | `@gagnechris/ui` `IconButton` (`ghost`, `outline`, `danger`; `sm`, `md`, `lg`; `pressed`, `count`)               | Admin           | none (screens use `Pressable` + `Icon`)                           |
| Field            | `@gagnechris/ui` `Field` (label, hint, `error`)                                                                  | Admin, Notebook | none; screens use `TextInput` directly                            |
| Text inputs      | `@gagnechris/ui` `TextInput` (`prefix`), `TextArea` (grows to 12 lines), `Select`, `DateInput`, `SearchInput`    | Admin, Notebook | `ui/SearchField.tsx` for search                                   |
| FileInput        | `@gagnechris/ui` `FileInput` (drop zone, upload progress)                                                        | Admin           | none                                                              |
| Combobox         | `@gagnechris/ui` `Combobox`                                                                                      | none yet        | none                                                              |
| Checkbox         | `@gagnechris/ui` `Checkbox` (`square` with a mixed state; `round` for tasks, with `dropped`)                     | Admin           | check inside `ui/TaskRow.tsx`                                     |
| RadioCardGroup   | `@gagnechris/ui` `RadioCardGroup`                                                                                | Admin           | none                                                              |
| Chip             | `@gagnechris/ui` `Chip` (`neutral`, `selected`, `warning`, `danger`), `ChipSelect`                               | none yet        | `ui/AreaChip.tsx`                                                 |
| Tabs             | `@gagnechris/ui` `Tabs`                                                                                          | none yet        | `ui/SpaceTabs.tsx`                                                |
| Menu             | `@gagnechris/ui` `Menu`, `MenuItem`, `MenuRadioGroup`, `MenuGroup`, `MenuSeparator`                              | Admin           | `ActionSheetIOS` (`ui/AreaChip.tsx`, `notebook/taskActionSheets`) |
| Dialog, Drawer   | `@gagnechris/ui` `Dialog` (`sm`, `md`, `lg`), `Drawer`; both open as a BottomSheet under 768px                   | Admin           | modal screens in `apps/mobile/app/`                               |
| Scrim            | `@gagnechris/ui` `Scrim`                                                                                         | Admin           | n/a                                                               |
| StatusBadge      | `@gagnechris/ui` `StatusBadge` (`draft`, `published`, `unpublished`, `deleted`)                                  | Admin           | none                                                              |
| BottomSheet      | `@gagnechris/ui` `BottomSheet`                                                                                   | Admin           | none                                                              |
| Card             | `@gagnechris/ui` `Card` (`boxed`, `flat`; `compact`, `selected`, interactive with `href` or `onClick`)           | none yet        | `Card` in `site/ui.tsx`, `ui/AccountCard.tsx`                     |
| ListRow          | `@gagnechris/ui` `List`, `ListRow`                                                                               | Admin           | `ui/Row.tsx`                                                      |
| Toolbar          | `@gagnechris/ui` `Toolbar`, `ToolbarSeparator`                                                                   | none yet        | keyboard toolbar in `ui/LiveMarkdownInput.tsx`                    |
| DragHandle       | `@gagnechris/ui` `DragHandle`                                                                                    | Admin           | `ui/DragGrip.tsx`                                                 |
| EmptyState       | `@gagnechris/ui` `EmptyState`                                                                                    | none yet        | `ui/EmptyState.tsx`                                               |
| Chips input      | `@gagnechris/ui` `ChipsInput` (a Chip per item)                                                                  | Admin           | none                                                              |
| Confirm dialog   | `@gagnechris/ui` `ConfirmDialog`, mounted by `workspace/ui/ConfirmDialogHost.tsx`                                | Admin, Notebook | `ui/confirm.ts` (native alert)                                    |
| SegmentedRadio   | `@gagnechris/ui` `SegmentedRadio`                                                                                | Admin, Notebook | `ui/SegmentedControl.tsx`                                         |
| Search palette   | `workspace/ui/SearchPalette.tsx`                                                                                 | Admin, Notebook | `ui/SearchField.tsx` (field only)                                 |
| Icon             | `workspace/ui/ShellIcon.tsx` (shell icons only; other icons are inline SVG)                                      | Admin, Notebook | `ui/Icon.tsx`                                                     |
| Panel edge       | `workspace/ui/PanelEdge.tsx`                                                                                     | Notebook        | web only                                                          |
| Resize handle    | `workspace/ui/ResizeHandle.tsx`                                                                                  | Notebook        | web only                                                          |
| Save indicator   | `workspace/ui/SaveIndicator.tsx`                                                                                 | Notebook        | none                                                              |
| Editor actions   | `workspace/ui/EditorActionBar.tsx`                                                                               | Admin           | screen header buttons                                             |
| Repeater         | `workspace/ui/Repeater.tsx`                                                                                      | Admin           | none                                                              |
| Row actions menu | `admin/PostRowActions.tsx` (`Menu` from an `IconButton`)                                                         | Admin           | `ui/SwipeRow.tsx`                                                 |
| Table, list      | `.kit-table`, `.kit-list` CSS only                                                                               | Admin           | `ui/Row.tsx`, `ui/Section.tsx`                                    |
| Hooks            | `@gagnechris/ui` `useModalDialog`, `useDismiss`, `useTabs`; `kit/useMediaQuery.ts`, `kit/useDebouncedValue.ts`   | Admin, Notebook | n/a                                                               |

`tone="editorial"` on Button, IconButton, Field, TextInput and Card gives the
public site's look (see Editorial variants below).

iOS primitives with no web component: `ui/Screen.tsx`, `ui/DragScroll.tsx`,
`ui/AccountCard.tsx`, `ui/YourApps.tsx`.

The public site uses none of the primitives above yet.

## Feature components

Components tied to one feature. They stay with the feature but belong in the
catalog.

| Component                 | Web                                                                                      | iOS counterpart                                |
| ------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Task row                  | `kit/tasks/TaskRow.tsx`, `kit/tasks/TaskRowActions.tsx`                                  | `ui/TaskRow.tsx`, `ui/SwipeRow.tsx`            |
| Task embed row            | `kit/tasks/TaskEmbedRow.tsx`                                                             | `ui/TaskEmbedRow.tsx`                          |
| Task parent label         | `kit/tasks/TaskParentLabel.tsx`                                                          | `ui/TaskParentLabel.tsx`                       |
| Task date button and menu | `kit/tasks/TaskDateButton.tsx`, `kit/tasks/TaskDateMenu.tsx`, `kit/tasks/SnoozeMenu.tsx` | native date picker in `notebook/`              |
| Task due pill             | `kit/tasks/TaskDuePill.tsx`                                                              | inside `ui/TaskRow.tsx`                        |
| Task syntax input         | `kit/tasks/TaskSyntaxInput.tsx`, `kit/tasks/TaskSyntaxCheatSheet.tsx`                    | none                                           |
| Today panels and sheet    | `kit/tasks/TodayPanels.tsx`, `kit/tasks/TodaySheet.tsx` (includes `CarryFooter`)         | `notebook/` Today screen                       |
| Markdown editor           | `kit/markdown/MarkdownEditor.tsx`, `kit/markdown/MarkdownBodyEditor.tsx`                 | `ui/LiveMarkdownInput.tsx`                     |
| Editor accessory bar      | `kit/markdown/EditorAccessoryBar.tsx`                                                    | keyboard toolbar in `ui/LiveMarkdownInput.tsx` |
| Markdown preview          | `kit/markdown/MarkdownPreview.tsx`, `kit/markdown/LazyMarkdownPreview.tsx`               | `markdown/`                                    |
| Note row                  | `.kit-list__item` in `notebook/NotebookNotesPage.tsx`                                    | `ui/NoteRow.tsx`, `ui/Excerpt.tsx`             |
| Demo frame                | `kit/demo/DemoFrame.tsx`                                                                 | web only                                       |

## Public page components

`packages/public-ui` holds the public page bodies, rendered by the publisher
and hydrated in the browser. Their styles are per page in `apps/web/src/pages`,
`apps/web/src/projects`, `apps/web/src/home` and `apps/web/src/public.css`.

| Component                | Source                                                                        | Styles                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Site header, nav, footer | `public-ui/src/chrome/SiteChrome.tsx`, `apps/web/src/components/SiteMenu.tsx` | `public.css` (`.site-header`, `.site-nav`, `.site-menu`, `.site-footer`) |
| Project card, preview    | `public-ui/src/projects/ProjectCard.tsx`, `ProjectPreview.tsx`                | `projects/ProjectCard.css`, `ProjectPreview.css`                         |
| Post list row            | `public-ui/src/posts/PostsIndexBody.tsx`, `home/HomeBody.tsx`                 | `pages/PostsIndex.css`, `home/homeSections.css`                          |
| Post page, reading bar   | `public-ui/src/posts/PostPageBody.tsx`, `apps/web/src/pages/ReadingBar.tsx`   | `pages/PostPage.css`                                                     |
| Resume                   | `public-ui/src/resume/ResumePageBody.tsx`                                     | `pages/Resume.css`                                                       |
| Contact form             | `public-ui/src/pages/ContactPageBody.tsx`, `apps/web/src/pages/Contact.tsx`   | `pages/Contact.css`                                                      |
| Not found                | `public-ui/src/pages/NotFoundBody.tsx`                                        | `public.css`                                                             |

iOS renders the public site natively with its own components in
`apps/mobile/src/site/ui.tsx` (`PostPreview`, `Card`, `LoadError`) and
`apps/mobile/app/site/`.

## One-off elements

Plain `button`, `input`, `select` and `textarea` elements in app code, and the
component each should use. Paths are under `apps/web/src`. The Bears games
(`games/bears/`) keep their own controls and are excluded.

"Styled as" means the element borrows a component's CSS class without using the
component.

### Notebook

| File                                     | Elements                          | Styled as                                          | Target                                                    |
| ---------------------------------------- | --------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `notebook/NotebookTodayPage.tsx`         | 5 buttons, 1 select               | `.kit-btn`, `.kit-input`, `.notebook-today__strip` | IconButton (prev, next, today, search), Select, PanelEdge |
| `notebook/NotebookTasksPage.tsx`         | 3 buttons, 4 selects              | `.kit-btn`, `.kit-input`                           | Button, Select                                            |
| `notebook/NotebookNotesPage.tsx`         | 4 buttons, 2 inputs               | `.kit-btn`, `.kit-input`, `.note-menu__item`       | Button, SearchInput, DateInput, MenuItem                  |
| `notebook/NotebookNoteTemplatesPage.tsx` | 4 buttons                         | `.kit-btn`, `.note-templates__item`                | Button, list row                                          |
| `notebook/NotebookTemplatesPage.tsx`     | 2 buttons                         | `.kit-btn`                                         | Button                                                    |
| `notebook/NotebookAreasPage.tsx`         | 4 buttons                         | `.kit-btn`                                         | IconButton (move up, move down, remove), Button           |
| `notebook/NotebookTaskPage.tsx`          | 3 buttons, 1 checkbox             | `.kit-btn`                                         | Button, Checkbox                                          |
| `notebook/NotebookUpcomingPage.tsx`      | 2 buttons                         | `.kit-btn`                                         | Button                                                    |
| `notebook/NotebookCalendar.tsx`          | 2 buttons                         | `.kit-btn`                                         | IconButton                                                |
| `notebook/NotebookNotePage.tsx`          | 1 checkbox                        | none                                               | Checkbox                                                  |
| `notebook/NoteMenu.tsx`                  | 5 buttons, 2 radios               | `.kit-btn`, `.note-menu__item`                     | Menu, MenuItem, MenuRadioGroup                            |
| `notebook/TaskMoveMenu.tsx`              | 4 buttons, 1 date input           | `.task-move-menu__item`, `.kit-input`, `.kit-btn`  | Menu, MenuItem, DateInput                                 |
| `notebook/TaskDetailsPanel.tsx`          | 2 buttons, 1 input, 2 selects     | `.task-details__chip`                              | Chip, ChipSelect                                          |
| `notebook/TodayEditor.tsx`               | 1 button                          | `.notebook-today__template-action`                 | Button (link variant)                                     |
| `notebook/LinkedNotePicker.tsx`          | 1 combobox input                  | `.kit-input`                                       | Combobox                                                  |
| `notebook/NoteTemplatePicker.tsx`        | 1 combobox input                  | `.kit-input`                                       | Combobox                                                  |
| `kit/tasks/TaskEmbedRow.tsx`             | 7 buttons, 1 checkbox, 1 textarea | `.kit-btn`, `.task-embed__*`                       | IconButton, Checkbox, Button                              |
| `kit/tasks/TodaySheet.tsx`               | 6 buttons                         | `.today-sheet__*`                                  | Tabs, IconButton, Chip                                    |
| `kit/tasks/TodayPanels.tsx`              | 2 buttons                         | `.today-row__add`, `.today-row__icon-btn`          | IconButton                                                |
| `kit/tasks/TaskRowActions.tsx`           | 2 buttons                         | `.today-row__icon-btn`                             | IconButton                                                |
| `kit/tasks/TaskRow.tsx`                  | 1 checkbox                        | `.task-check`                                      | Checkbox                                                  |
| `kit/tasks/TaskDateButton.tsx`           | 1 combobox button                 | caller's class                                     | Chip                                                      |
| `kit/tasks/TaskDateMenu.tsx`             | 1 button, 1 date input            | `.kit-btn`, `.kit-input`                           | Button, DateInput                                         |
| `kit/tasks/TaskSyntaxInput.tsx`          | 1 combobox input                  | `.kit-input`                                       | Combobox                                                  |
| `kit/markdown/EditorAccessoryBar.tsx`    | 6 buttons                         | `.editor-accessory__btn`                           | Toolbar, IconButton                                       |
| `kit/markdown/MarkdownBodyEditor.tsx`    | 2 buttons, 1 file input           | `.markdown-toolbar__btn`                           | Toolbar, IconButton, FileInput                            |

### Workspace shell (Admin and Notebook)

| File                                 | Elements                              | Styled as                                                                    | Target                                    |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `workspace/WorkspaceShell.tsx`       | 5 buttons                             | `.workspace-icon-button`, `.workspace-search-button`, `.workspace-nav__item` | IconButton, nav item, Scrim               |
| `workspace/ui/SearchPalette.tsx`     | 2 buttons, 1 search input, 1 checkbox | `.kit-input`, `.workspace-search__*`                                         | Dialog, Combobox, Checkbox, Scrim         |
| `workspace/ui/EditorActionBar.tsx`   | 1 button                              | `.workspace-actions__toggle`                                                 | Menu trigger (IconButton)                 |
| `workspace/ui/PanelEdge.tsx`         | 1 button                              | `.workspace-edge-button`                                                     | stays (feature control)                   |
| `packages/ui/src/SegmentedRadio.tsx` | 1 button per option                   | `.workspace-segmented__option`                                               | stays (is the SegmentedControl primitive) |
| `workspace/auth/RequireAuth.tsx`     | 1 button                              | none                                                                         | Button                                    |
| `workspace/auth/NoAccessScreen.tsx`  | 2 buttons                             | none                                                                         | Button                                    |

### Admin

None: Admin screens use the `@gagnechris/ui` components.

### Public site

| File                   | Elements                       | Styled as                                                 | Target                                         |
| ---------------------- | ------------------------------ | --------------------------------------------------------- | ---------------------------------------------- |
| `pages/Contact.tsx`    | 1 button, 2 inputs, 1 textarea | `.contact-form__*`                                        | Button (editorial), Field, TextInput, Textarea |
| `pages/ReadingBar.tsx` | 3 buttons                      | `.reading-bar__button`                                    | IconButton (editorial)                         |
| `pages/Resume.tsx`     | 2 buttons                      | `.resume-load-error__retry`, `.resume-bear-note__dismiss` | Button, IconButton                             |

### Demos

`demos/posts/index.tsx` and `demos/notebook/index.tsx` each have one view or tab
button (`.posts-demo__view`, `.notebook-demo__tab`). Target: Tabs.

## Duplicate styles

The same control is styled several ways:

- **Buttons:** `.kit-btn`, `.bottom-sheet__button`, `.contact-form__submit`,
  `.resume-load-error__retry`.
- **Icon buttons:** `.workspace-icon-button`,
  `.today-row__icon-btn`, `.markdown-toolbar__btn`, `.editor-accessory__btn`,
  `.reading-bar__button`, `.task-embed__chevron`, `.today-sheet__close`.
- **Menus:** `.note-menu`, `.task-move-menu`, `.workspace-actions`, `.workspace-more`, `.site-menu`.
- **Chips and pills:** `.task-details__chip`, `.today-row__chip`,
  `.today-sheet__pill`, `.task-embed__pill`, `.notebook-upcoming__chip`,
  `.users-chip`.
- **Checkboxes:** `.task-check`, `.task-embed__check`,
  `.workspace-search__check`, and unstyled checkboxes in `NotebookTaskPage` and
  `NotebookNotePage`.
- **Scrims:** `.workspace-search__backdrop`,
  `.workspace-more__backdrop`.
- **Cards:** `.admin-form-card`, `.admin-project-card`, `.notebook-card`,
  `.no-access__card`, `.users-level-card`, `.project-card`.
- **Button sizes and variants on iOS:** `primary` and `secondary`, while web
  uses `default`, `primary` and `danger`.

## One look across Admin and Notebook

Where the apps style the same control differently, this is the look the library
uses:

- **Button:** `.kit-btn` wins, in `sm`, `md` and `lg` sizes with a `link`
  variant. A disabled button is 55% opacity in every variant, including primary.
- **Icon buttons:** one IconButton, ghost by default, 8px corners.
- **Focus:** a 2px `--primary-600` outline with a 2px offset on keyboard focus
  only, for every control. Inputs add a 3px `--primary-100` ring and a
  `--primary-600` border instead.
- **Checkboxes:** square for settings and fields; round only for tasks.
- **Chips:** 26px pills in four tones (neutral, selected, warning, danger).
- **Menus and scrims:** one Menu surface and one Scrim colour.
- **Cards:** one boxed Card with 8px corners and `--shadow-sm`.
- **iOS:** Button variants `primary` and `secondary` map to web `primary` and
  `default`.

The public site keeps its editorial look through `tone="editorial"` (below).

## Specs

Values are tokens from `packages/tokens`. Every control is at least 44px tall
under 768px, and text inputs use 16px text there. Every variant and state is
drawn on the
[Component library specs](https://claude.ai/artifact/HxZthqfahxDTYwK8gNECtf)
design canvas, and each component has a story in the Storybook catalog
(`apps/storybook`).

### Button

- Variants: `default` (white, `--neutral-300` border, `--neutral-800` text,
  hover `--neutral-100`), `primary` (`--primary-600`, hover `--primary-700`,
  white text), `danger` (`--color-danger` text, `--color-danger-border`, hover
  `--color-danger-bg`), `ghost` (no border, `--neutral-700`, hover
  `--neutral-100`), `link` (`--color-link`, underlined, no box).
- Sizes: `sm` 32px with 13px text and 12px padding; `md` 36px with 14px text
  and 16px padding (default); `lg` 44px with 16px text and 20px padding.
- Shape: `--radius-md`, 1px border, 600 weight, 8px gap for an icon.
- States: hover as above, focus ring, disabled at 55% opacity with a
  not-allowed cursor, `loading` (a 14px spinner before the label,
  `aria-busy`, width kept, still focusable).
- Renders an `a` when given `href`.

### IconButton

- Variants: `ghost` (default: transparent, `--neutral-600` icon, hover
  `--neutral-100` and `--neutral-900`), `outline` (white with a
  `--neutral-300` border), `danger` (`--color-danger` icon, hover
  `--color-danger-bg`).
- Sizes: `sm` 28px with a 16px icon (task rows), `md` 36px with an 18px icon,
  `lg` 44px with a 20px icon (phone toolbars, the shell).
- `label` is required: it is the accessible name and shows as the tooltip. `pressed` sets
  `aria-pressed` with a `--primary-50` fill and `--primary-700` icon. An
  optional `count` shows as a `--primary-600` pill at the top right and is
  added to the accessible name.
- Icons come from ShellIcon (2px stroke, `currentColor`).

### TextInput, DateInput, SearchInput, TextArea, Select, FileInput

- One control box: 36px tall (`sm` 32, `lg` 44), `--radius-md`, 1px
  `--neutral-300` border, white fill, 14px text, 12px side padding.
- States: hover `--neutral-400` border; focus `--primary-600` border with a
  3px `--primary-100` ring; disabled `--neutral-100` fill and `--neutral-500`
  text; error `--color-error` border. Placeholder `--color-placeholder`.
- Field wraps it: label 14/600 `--neutral-600`, 6px gap, hint 13px
  `--neutral-500`. An error message (13/500 `--color-error`) replaces the hint
  and the control gets `aria-invalid` and `aria-describedby`.
- TextInput takes a `prefix` (for example `/posts/`) shown in `--neutral-500`
  behind a `--neutral-200` divider.
- DateInput is a native date input with a calendar icon at the end.
- SearchInput has a search icon at the start and a clear button once there is
  text; Escape clears, and on an empty box passes through so its container
  closes. It has no error state.
- TextArea grows with its text up to 12 lines (or its `rows`, if more), then
  scrolls; `autoGrow={false}` keeps a fixed, resizable box.
- Select is the native select with a chevron; only the box is styled.
- FileInput is a dashed `--neutral-400` drop zone with a `sm` Button and a hint;
  drag-over turns it `--primary-600` dashed on `--primary-50`; uploading shows
  the file name and a progress bar.

### Combobox

A TextInput with a listbox popup in the Menu surface. The input keeps focus,
arrows move the active option (`aria-activedescendant`), Enter picks, Escape
closes. Options are 14px with optional 12px meta on the right; the active one
is `--neutral-100`. Empty and loading rows use hint text; errors use
`--color-error`.

### Checkbox

- Shapes: `square` (18px, 4px corners) for settings and fields; `round` (20px
  circle) for tasks.
- 1.5px `--neutral-400` border on white, hover `--neutral-600`; checked
  `--primary-600` fill with a white check; focus ring; disabled at 55%.
- Square has a mixed state (white dash). Round has a dropped state
  (`--neutral-100` fill, `--neutral-500` dash); done and dropped tasks strike
  through their label in `--neutral-500`.
- A native input sits underneath; the whole label is the hit area.

### RadioCard group

Radios drawn as cards for choices that need a sentence each. Each card: 1px
`--neutral-300` border, `--radius-md`, 14px/16px padding, a 20px radio, a
14/600 title and a 13px `--neutral-600` description. Selected: `--primary-600`
border doubled inset and a `--primary-50` fill. Disabled at 55%. One tab stop;
arrows move the selection.

### Chip and ChipSelect

- 26px pill (`--radius-full`), 10px side padding, 13/500 text.
- Tones: `neutral` (`--neutral-100`, `--neutral-700`), `selected`
  (`--primary-50`, `--primary-300` border, `--primary-800`), `warning`
  (`--color-warning-bg`, `--color-warning`), `danger` (`--color-danger-bg`,
  `--color-danger-border`, `--color-danger`).
- Optional leading dot or icon and a remove button labelled "Remove {value}".
- ChipSelect is an outline chip (white, `--neutral-300` border) with a chevron
  that opens a Menu; an empty one reads as an "Add …" action in `--neutral-500`.

### Tabs

For switching views of one thing; filters stay SegmentedRadio. A
`--neutral-200` baseline; each tab is 14/600 with 10px/12px padding,
`--neutral-500`, hover `--neutral-800`; the selected tab is `--primary-800`
with a 2px `--primary-600` underline. Optional count pill (`--neutral-100`,
12/600). `role="tablist"`, arrows move, Home and End jump.

### Menu, MenuItem, MenuRadioGroup

- Surface: white, 1px `--neutral-200`, `--radius-md`, `--shadow-lg`, 4px
  padding, 240px default width.
- Items: 34px, 6px corners, 14px text, optional 16px icon and a right-aligned
  12px `--neutral-500` shortcut; active `--neutral-100`; `danger` items
  `--color-danger`; disabled `--neutral-400`.
- MenuRadioGroup marks the current item with a `--primary-600` check. Group
  labels are 12/600 `--neutral-500`; separators are 1px `--neutral-200`.
- Opened from a trigger with `aria-haspopup` and `aria-expanded`. Arrows move,
  typing jumps, Enter picks, Escape and an outside click close and return
  focus. Under 768px the same items open in a BottomSheet with 44px rows.

### Dialog, Drawer, Scrim

- Dialog: centred, 480px (`sm` 400, `lg` 640), `--radius-lg`, `--shadow-lg`,
  24px padding, 18/600 title, an optional close IconButton, and a footer with
  Cancel then the primary action at the right. Focus moves to the first field
  and is trapped; Escape and the scrim close. ConfirmDialog is a Dialog with a
  message and a danger action. Under 768px a Dialog opens as a BottomSheet.
- Drawer: from the right edge, 400px, full height, a header with title and
  close, a scrolling body and a footer with a `--neutral-200` top border. Under
  768px it opens as a BottomSheet.
- Scrim: `--neutral-900` at 40% behind every modal surface; it is a button
  labelled Close.

### Card

1px `--neutral-200` border, `--radius-md`, white, `--shadow-sm`, 20px padding
(16px `compact`). Variants: `interactive` (the whole card is one link or
button; hover `--neutral-300` border and `--shadow-md`), `selected`
(`--primary-600` border doubled inset), `flat` (no shadow, `--neutral-50`
fill, for nested groups).

### ListRow

52px minimum, 8px/12px padding, `--neutral-200` divider. Slots: leading
control (Checkbox, DragHandle or icon), title (15/600, a link to the item),
meta (13px `--neutral-500`), trailing badges and actions. Hover `--neutral-50`;
the current item `--primary-50` with `aria-current`. Trailing IconButtons show
on hover and focus on desktop and always on touch screens.

### Toolbar

A row of IconButtons in a white box with a `--neutral-200` border and
`--radius-md`, 4px padding, 2px gaps and optional 1px separators.
`role="toolbar"` with one tab stop; arrows move. The phone editor accessory
bar uses `lg` buttons above the keyboard.

### DragHandle

A six-dot grip, 24×32 (44px tall under 768px), `--neutral-400`, grab cursor,
labelled "Reorder {item}". Space picks up, arrows move, Space drops, and each
move is announced.

### EmptyState

A centred block for an empty list or page: a 32px ShellIcon in
`--neutral-400`, an 18/600 `--neutral-800` title, a 14px `--neutral-500`
sentence and an optional `md` Button. 48px vertical padding inside the list's
area; no card around it.

### Editorial variants (public site)

`tone="editorial"` on Button, IconButton, TextInput and Field matches the
current contact form, reading bar and resume retry, so the public pages look
the same on the library:

- Corners 10px, as a new `--radius-editorial` token.
- Field: 14/600 `--neutral-700` labels, 6px gap; TextInput 48px, 16px text,
  11px/14px padding, `--neutral-500` border, focus `--color-link` border and a
  2px `--color-link` outline, error `--color-error` border doubled inset with a
  14/500 message.
- Button: 50px, 24px padding, 16/600; primary `--color-link`, hover
  `--primary-800`; secondary white with a `--neutral-300` border; busy at 70%
  with a spinner.
- IconButton: 44px square, outline by default (`--neutral-300`), ghost for
  dismiss buttons; disabled icons `--neutral-400`.
- Card: the editorial card is an entry in a ruled list, not a box: a
  `--color-ink` rule above the list, `--neutral-200` rules between entries, a
  240px preview column, a 32px serif name that underlines on hover and Inter
  meta. Specs for the public pages themselves are in
  [public-redesign/README.md](./public-redesign/README.md).
