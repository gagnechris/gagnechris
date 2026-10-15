# Component inventory

Every reusable UI piece in the web apps and iOS, where one-off elements stand in
for a component, and which primitives don't exist yet. New UI is built from the
components listed here. A missing component is added here and to the library
before a feature uses it.

Tokens (`packages/tokens`) are shared by every app. Web CSS reads them as
`var(--…)`; iOS imports them from `@gagnechris/tokens`.

## Primitives

Small, app-agnostic building blocks. Shared web primitives live in
`packages/ui` (`@gagnechris/ui`, styles in `@gagnechris/ui/styles.css`); a few
more sit in `apps/web/src/workspace/ui`. iOS primitives live in
`apps/mobile/src/ui`.

| Component        | Web                                                                                                            | Used by         | iOS counterpart                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------- |
| Button           | `@gagnechris/ui` `Button` (`default`, `primary`, `danger`; renders a link when given `href`)                   | Admin, Notebook | `ui/Button.tsx` (`primary`, `secondary`) |
| Field            | `@gagnechris/ui` `Field`, `TextInput`, `TextArea`, `Select` (`.kit-input`)                                     | Admin, Notebook | none; screens use `TextInput` directly   |
| StatusBadge      | `@gagnechris/ui` `StatusBadge` (`draft`, `published`, `unpublished`, `deleted`)                                | Admin           | none                                     |
| BottomSheet      | `@gagnechris/ui` `BottomSheet`                                                                                 | Admin           | none                                     |
| Chips input      | `admin/editor/ChipsInput.tsx` (`.kit-chips`)                                                                   | Admin           | none                                     |
| Confirm dialog   | `@gagnechris/ui` `ConfirmDialog`, mounted by `workspace/ui/ConfirmDialogHost.tsx`                              | Admin, Notebook | `ui/confirm.ts` (native alert)           |
| SegmentedRadio   | `@gagnechris/ui` `SegmentedRadio`                                                                              | Admin, Notebook | `ui/SegmentedControl.tsx`                |
| Search palette   | `workspace/ui/SearchPalette.tsx`                                                                               | Admin, Notebook | `ui/SearchField.tsx` (field only)        |
| Icon             | `workspace/ui/ShellIcon.tsx` (shell icons only; other icons are inline SVG)                                    | Admin, Notebook | `ui/Icon.tsx`                            |
| Panel edge       | `workspace/ui/PanelEdge.tsx`                                                                                   | Notebook        | web only                                 |
| Resize handle    | `workspace/ui/ResizeHandle.tsx`                                                                                | Notebook        | web only                                 |
| Save indicator   | `workspace/ui/SaveIndicator.tsx`                                                                               | Notebook        | none                                     |
| Editor actions   | `workspace/ui/EditorActionBar.tsx`                                                                             | Admin           | screen header buttons                    |
| Repeater         | `workspace/ui/Repeater.tsx`                                                                                    | Admin           | none                                     |
| Row actions menu | `.kit-row-actions` CSS only, used in `admin/PostRowActions.tsx`                                                | Admin           | `ui/SwipeRow.tsx`                        |
| Table, list      | `.kit-table`, `.kit-list` CSS only                                                                             | Admin           | `ui/Row.tsx`, `ui/Section.tsx`           |
| Hooks            | `@gagnechris/ui` `useModalDialog`, `useDismiss`, `useTabs`; `kit/useMediaQuery.ts`, `kit/useDebouncedValue.ts` | Admin, Notebook | n/a                                      |

iOS primitives with no web component: `ui/Screen.tsx`, `ui/EmptyState.tsx`,
`ui/AreaChip.tsx`, `ui/SpaceTabs.tsx`, `ui/DragGrip.tsx`, `ui/DragScroll.tsx`,
`ui/AccountCard.tsx`, `ui/YourApps.tsx`.

The public site uses none of the primitives above.

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

| File                                   | Elements                        | Styled as                                                | Target                                    |
| -------------------------------------- | ------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| `admin/settings/EditUserDrawer.tsx`    | 5 buttons                       | `.users-btn`, `.users-icon-btn`, `.bottom-sheet__button` | Drawer, Button, IconButton                |
| `admin/settings/InviteUserDialog.tsx`  | 4 buttons, 2 inputs             | `.users-btn`, `.users-icon-btn`, `.bottom-sheet__button` | Dialog, Button, IconButton, TextInput     |
| `admin/settings/AdminUsersPage.tsx`    | 3 buttons                       | `.users-btn`, `.users-link-btn`                          | Button (sizes, link variant)              |
| `admin/settings/AccessLevelRadios.tsx` | 1 button per option             | `.users-radio`                                           | RadioCard group                           |
| `admin/settings/UsersOverlay.tsx`      | 1 button                        | `.users-scrim`                                           | Scrim                                     |
| `admin/PostRowActions.tsx`             | 3 buttons                       | `.kit-row-actions__*`                                    | Menu, MenuItem                            |
| `admin/PostEditorSections.tsx`         | 1 input, 1 checkbox, 1 textarea | `.admin-prefixed__input`, `.admin-title-input`           | TextInput (prefix), Checkbox, title input |
| `admin/ResumeEditorForm.tsx`           | 1 button, 1 checkbox            | `.admin-subscreen-back`                                  | Button (back), Checkbox                   |
| `admin/ResumeRoleList.tsx`             | 2 buttons                       | `.admin-row`, `.admin-row-handle`                        | list row, DragHandle                      |
| `admin/ProjectEditorFields.tsx`        | 1 button                        | `.admin-sheet-open`                                      | Button                                    |
| `admin/editor/ChipsInput.tsx`          | 1 button, 1 input               | `.kit-chips`                                             | stays (is the Chips input primitive)      |
| `admin/editor/ImageUploadField.tsx`    | 1 file input                    | `.kit-visually-hidden`                                   | FileInput                                 |

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

- **Buttons:** `.kit-btn`, `.users-btn`, `.bottom-sheet__button`,
  `.contact-form__submit`, `.resume-load-error__retry`. Admin settings
  (`admin/settings/users.css`) has its own full button set with `small`, `tall`
  and link variants that `.kit-btn` lacks.
- **Icon buttons:** `.workspace-icon-button`, `.users-icon-btn`,
  `.today-row__icon-btn`, `.markdown-toolbar__btn`, `.editor-accessory__btn`,
  `.reading-bar__button`, `.task-embed__chevron`, `.today-sheet__close`.
- **Menus:** `.note-menu`, `.task-move-menu`, `.kit-row-actions`,
  `.workspace-actions`, `.workspace-more`, `.site-menu`.
- **Chips and pills:** `.kit-chip`, `.task-details__chip`, `.today-row__chip`,
  `.today-sheet__pill`, `.task-embed__pill`, `.notebook-upcoming__chip`,
  `.users-chip`.
- **Checkboxes:** `.task-check`, `.task-embed__check`,
  `.workspace-search__check`, and unstyled checkboxes in `NotebookTaskPage`,
  `NotebookNotePage`, `PostEditorSections` and `ResumeEditorForm`.
- **Scrims:** `.users-scrim`, `.workspace-search__backdrop`,
  `.workspace-more__backdrop`.
- **Cards:** `.admin-form-card`, `.admin-project-card`, `.notebook-card`,
  `.no-access__card`, `.users-level-card`, `.project-card`.
- **Button sizes and variants on iOS:** `primary` and `secondary`, while web
  uses `default`, `primary` and `danger`.

## Missing primitives

These need a design before they are built:

| Primitive                                    | Replaces                                                                           | iOS counterpart                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| IconButton                                   | every icon button family above                                                     | none (screens use `Pressable` + `Icon`)                           |
| TextInput, DateInput, SearchInput, FileInput | `.kit-input` on plain inputs                                                       | `ui/SearchField.tsx` for search                                   |
| Checkbox                                     | every checkbox style above                                                         | check inside `ui/TaskRow.tsx`                                     |
| Select                                       | plain selects with `.kit-input` and `.task-details__chip`                          | none                                                              |
| Combobox                                     | `LinkedNotePicker`, `NoteTemplatePicker`, `TaskSyntaxInput`, `SearchPalette` input | none                                                              |
| Menu, MenuItem, MenuRadioGroup               | every menu above                                                                   | `ActionSheetIOS` (`ui/AreaChip.tsx`, `notebook/taskActionSheets`) |
| Dialog, Drawer                               | `InviteUserDialog`, `EditUserDrawer`, `SearchPalette` shell                        | modal screens in `apps/mobile/app/`                               |
| Scrim                                        | every scrim above                                                                  | n/a                                                               |
| Tabs                                         | `TodaySheet` tabs, demo tabs                                                       | `ui/SpaceTabs.tsx`                                                |
| Chip                                         | every chip and pill above                                                          | `ui/AreaChip.tsx`                                                 |
| Card                                         | every card above                                                                   | `Card` in `site/ui.tsx`, `ui/AccountCard.tsx`                     |
| RadioCard group                              | `AccessLevelRadios`                                                                | none                                                              |
| Toolbar                                      | `EditorAccessoryBar`, markdown toolbar                                             | keyboard toolbar                                                  |
| EmptyState                                   | per-page empty messages                                                            | `ui/EmptyState.tsx`                                               |
| Public variants of Button, IconButton, Field | contact form, reading bar, resume retry                                            | n/a                                                               |
