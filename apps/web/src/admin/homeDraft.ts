import { SITE_AUTHOR_NAME } from '@gagnechris/shared';
import { mergeEditorSeo, type Home } from '@gagnechris/app-core';

export type HomeDraftFields = {
  name: string;
  title: string;
  about: string;
  seoTitle: string;
  seoDescription: string;
};

export const emptyHomeDraft = (): HomeDraftFields => ({
  name: '',
  title: '',
  about: '',
  seoTitle: '',
  seoDescription: '',
});

export const homeDraftFromHome = (home: Home): HomeDraftFields => ({
  name: home.name,
  title: home.title,
  about: home.about,
  seoTitle: home.seo?.title ?? '',
  seoDescription: home.seo?.description ?? '',
});

export const homePayload = (
  draft: HomeDraftFields,
  saved: Home,
): Pick<Home, 'name' | 'title' | 'about' | 'seo'> => ({
  name: draft.name.trim() || SITE_AUTHOR_NAME,
  title: draft.title.trim(),
  about: draft.about,
  seo: mergeEditorSeo(saved.seo, draft),
});
