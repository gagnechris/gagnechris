import type { ShellNavSection } from './WorkspaceShell';

export function visibleNavSections(
  sections: readonly ShellNavSection[],
  groups: readonly string[],
): ShellNavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.group || groups.includes(item.group),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export type NavPage = { to: string; title: string };

/** Every screen the nav reaches for these groups, for the search palette. */
export function navPages(
  sections: readonly ShellNavSection[],
  groups: readonly string[],
): NavPage[] {
  return visibleNavSections(sections, groups).flatMap((section) =>
    section.items.flatMap((item) => [
      { to: item.to, title: item.label },
      ...(item.childPages ?? []).map((child) => ({
        to: child.to,
        title: child.label,
      })),
    ]),
  );
}
