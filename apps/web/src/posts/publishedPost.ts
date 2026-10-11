import { pageTitle } from '@gagnechris/shared';
import type { PostArticleView } from '@gagnechris/shared/render';
import {
  fetchPrerender,
  fromPrerender,
  prerenderedTitle,
} from '../prerender/documentPrerender';
import { publishedPostPageUrl } from './publishedPosts';

export type PostView = PostArticleView & { headTitle: string };

export function postViewFromDocument(root: ParentNode): PostView | null {
  const article = root.querySelector('article.blog-post-prerender');
  const body = article?.querySelector('.blog-post-body');
  if (!article || !body) return null;

  const title = article.querySelector('h1')?.textContent?.trim() || 'Untitled';
  const time = article.querySelector('time');
  return {
    slug: article.getAttribute('data-slug') ?? '',
    title,
    headTitle: prerenderedTitle(root) ?? pageTitle(title),
    date: time?.getAttribute('datetime') || time?.textContent?.trim() || '',
    excerpt: article.querySelector('.post-excerpt')?.textContent?.trim() ?? '',
    minutes: Number(
      article.querySelector('[data-minutes]')?.getAttribute('data-minutes'),
    ),
    partOf: [
      ...article.querySelectorAll('.post-part-of .post-part-of__project'),
    ].map((el) => ({
      name: el.textContent ?? '',
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
    })),
    contentHtml: body.innerHTML,
  };
}

/** Only the slug the visitor cold-loaded; later navigations fetch. */
export const documentPostView = (slug: string): PostView | null => {
  const view = fromPrerender(postViewFromDocument);
  return view?.slug === slug ? view : null;
};

export const loadPublishedPost = (slug: string): Promise<PostView | null> =>
  fetchPrerender(publishedPostPageUrl(slug), postViewFromDocument);
