import {
  EMPTY_SLUG_FALLBACK,
  PROJECT_ORDER_MAX,
  PROJECT_STACK_ITEM_MAX_LENGTH,
  PROJECT_STACK_MAX,
  ProjectHrefSchema,
  ProjectLinkSchema,
  type ProjectDemo,
  type ProjectStage,
} from '@gagnechris/shared';
import type { Project, UpdateProjectRequest } from '@gagnechris/app-core';
import { newRepeaterId } from '../workspace/ui/repeaterId';

export type ProjectLinkDraft = { id: string; label: string; url: string };

export type ProjectDraftFields = {
  name: string;
  slug: string;
  pitch: string;
  stage: ProjectStage;
  stageNote: string;
  previewImage: string;
  bodyMarkdown: string;
  stack: string[];
  links: ProjectLinkDraft[];
  demo: ProjectDemo | '';
  orderText: string;
  href: string;
};

export const NEW_PROJECT_NAME = 'Untitled project';

/** New projects get a throwaway slug so two of them can't collide on create. */
export const newProjectSlug = (): string =>
  `untitled-project-${Math.random().toString(36).slice(2, 8)}`;

export const isPlaceholderSlug = (slug: string): boolean =>
  /^untitled-project(?:-[a-z0-9]+)?$/.test(slug) ||
  slug === EMPTY_SLUG_FALLBACK;

export const emptyProjectLink = (): ProjectLinkDraft => ({
  id: newRepeaterId(),
  label: '',
  url: '',
});

export const emptyProjectDraft = (): ProjectDraftFields => ({
  name: '',
  slug: '',
  pitch: '',
  stage: 'idea',
  stageNote: '',
  previewImage: '',
  bodyMarkdown: '',
  stack: [],
  links: [],
  demo: '',
  orderText: '0',
  href: '',
});

export const projectDraftFromProject = (
  project: Project,
): ProjectDraftFields => ({
  name: project.name,
  slug: project.slug,
  pitch: project.pitch,
  stage: project.stage,
  stageNote: project.stageNote,
  previewImage: project.previewImage ?? '',
  bodyMarkdown: project.bodyMarkdown,
  stack: [...project.stack],
  links: project.links.map((link) => ({ id: newRepeaterId(), ...link })),
  demo: project.demo ?? '',
  orderText: String(project.order),
  href: project.href ?? '',
});

const isBlankLink = (link: ProjectLinkDraft) =>
  link.label.trim() === '' && link.url.trim() === '';

export type ProjectLinkErrors = { label?: string; url?: string };

/** Same rules as the API's `ProjectLinkSchema`; a fully blank row is ignored. */
export const projectLinkErrors = (
  link: ProjectLinkDraft,
): ProjectLinkErrors => {
  if (isBlankLink(link)) return {};
  const parsed = ProjectLinkSchema.safeParse({
    label: link.label,
    url: link.url.trim(),
  });
  if (parsed.success) return {};
  const errors: ProjectLinkErrors = {};
  for (const issue of parsed.error.issues) {
    if (issue.path[0] === 'label' && !errors.label) {
      errors.label = link.label.trim() ? issue.message : 'Add a label';
    } else if (issue.path[0] === 'url' && !errors.url) {
      errors.url = link.url.trim() ? issue.message : 'Add a URL';
    }
  }
  return errors;
};

export const projectHrefError = (href: string): string | undefined => {
  const value = href.trim();
  if (!value) return undefined;
  const parsed = ProjectHrefSchema.safeParse(value);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
};

export const projectOrderError = (text: string): string | undefined => {
  const value = Number(text.trim());
  return text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= PROJECT_ORDER_MAX
    ? undefined
    : `A whole number from 0 to ${PROJECT_ORDER_MAX}`;
};

export const hasProjectDraftErrors = (draft: ProjectDraftFields): boolean =>
  projectHrefError(draft.href) !== undefined ||
  projectOrderError(draft.orderText) !== undefined ||
  draft.links.some((link) => {
    const errors = projectLinkErrors(link);
    return errors.label !== undefined || errors.url !== undefined;
  });

/** Adds chips from typed text (comma-separated), skipping blanks and duplicates. */
export const addStackItems = (stack: string[], text: string): string[] => {
  const next = [...stack];
  for (const raw of text.split(',')) {
    const item = raw.trim().slice(0, PROJECT_STACK_ITEM_MAX_LENGTH);
    if (!item || next.length >= PROJECT_STACK_MAX) continue;
    if (next.some((s) => s.toLowerCase() === item.toLowerCase())) continue;
    next.push(item);
  }
  return next;
};

/**
 * An invalid field sends the project's saved value instead, so autosave never
 * stores something the API would reject and the typed text stays on screen.
 */
export const projectPayload = (
  draft: ProjectDraftFields,
  saved: Project,
): Omit<UpdateProjectRequest, 'version'> => {
  const linksInvalid = draft.links.some((link) => {
    const errors = projectLinkErrors(link);
    return errors.label !== undefined || errors.url !== undefined;
  });
  const href = draft.href.trim();
  return {
    name: draft.name.trim() || NEW_PROJECT_NAME,
    slug: draft.slug.trim() || saved.slug,
    pitch: draft.pitch,
    stage: draft.stage,
    stageNote: draft.stageNote,
    previewImage: draft.previewImage.trim() || null,
    bodyMarkdown: draft.bodyMarkdown,
    stack: draft.stack,
    links: linksInvalid
      ? saved.links
      : draft.links
          .filter((link) => !isBlankLink(link))
          .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
    demo: draft.demo || null,
    order: projectOrderError(draft.orderText)
      ? saved.order
      : Number(draft.orderText.trim()),
    href: projectHrefError(href) ? saved.href : href || null,
  };
};
