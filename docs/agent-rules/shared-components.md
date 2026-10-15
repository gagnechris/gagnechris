# Shared components

Web UI is built from `@gagnechris/ui` (`packages/ui`).

- Look up the component in the inventory, [`docs/design/components.md`](../design/components.md), and in the catalog at [components.gagnechris.com](https://components.gagnechris.com) (`npm run storybook` locally) before writing any control.
- Use the component as it is. Pass `tone="editorial"` on public pages. Don't restyle it with a page class when a prop or variant covers the case.
- When no component fits, add one to `packages/ui` first: the component, its test and a story in `apps/storybook/src/ui`, then use it. Each component file starts with `/** @jsxRuntime automatic */`, because the publisher renders them.
- Update the inventory in the same PR: the "Used by" column, and the spec when you add a component or variant.
- ESLint bans plain `button`, `input`, `select` and `textarea` elements in `apps/web/src` and `packages/public-ui` (the Bears games are exempt). A control that really can't be a component, such as one drawn inside a CodeMirror widget, takes an `eslint-disable-next-line no-restricted-syntax -- <reason>` comment and a row in the inventory's "One-off elements" section.
- iOS components in `apps/mobile/src/ui` use the web component's name and variants where one exists.
