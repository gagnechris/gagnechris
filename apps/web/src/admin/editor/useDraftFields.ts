import { useState } from 'react';
import { EMPTY_SLUG_FALLBACK, slugify } from '@gagnechris/shared';
import { isPlaceholderSlug } from '../placeholderSlug';

type FieldValue<T> = T | ((prev: T) => T);

export type SetDraftField<TDraft> = <K extends keyof TDraft>(
  key: K,
  value: FieldValue<TDraft[K]>,
) => void;

type SlugSource<TDraft> = TDraft extends { slug: string }
  ? Exclude<keyof TDraft, 'slug'>
  : never;

type Editor<TDraft> = {
  updateDraft: (update: (prev: TDraft) => TDraft) => void;
  /** The entity the draft was last hydrated from. */
  hydrated: object | null;
};

const hydratedSlug = (entity: object): string =>
  'slug' in entity && typeof entity.slug === 'string' ? entity.slug : '';

/**
 * With `slugFrom`, the slug follows that field until it is edited by hand; a
 * loaded entity whose slug is still a placeholder keeps following.
 */
export function useDraftFields<TDraft extends object>(
  editor: Editor<TDraft>,
  { slugFrom }: { slugFrom?: SlugSource<TDraft> } = {},
) {
  const { updateDraft, hydrated } = editor;
  const [manualOverride, setManualOverride] = useState<{
    entity: object | null;
    manual: boolean;
  } | null>(null);

  const slugManual =
    manualOverride && manualOverride.entity === hydrated
      ? manualOverride.manual
      : hydrated !== null && !isPlaceholderSlug(hydratedSlug(hydrated));

  const setSlugManual = (manual: boolean) =>
    setManualOverride({ entity: hydrated, manual });

  const setField: SetDraftField<TDraft> = (key, value) => {
    updateDraft((prev) => {
      const resolved =
        typeof value === 'function'
          ? (value as (field: TDraft[typeof key]) => TDraft[typeof key])(
              prev[key],
            )
          : value;
      const next = { ...prev, [key]: resolved };
      if (
        slugFrom !== undefined &&
        key === (slugFrom as keyof TDraft) &&
        !slugManual
      ) {
        return {
          ...next,
          slug: slugify(String(resolved)) || EMPTY_SLUG_FALLBACK,
        } as TDraft;
      }
      return next;
    });
  };

  return { setField, slugManual, setSlugManual };
}
