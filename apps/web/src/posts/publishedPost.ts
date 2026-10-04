import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';
import { publishedPostPageUrl } from './publishedPosts';

export type PostView = {
  slug: string;
  title: string;
  /** ISO date or `YYYY-MM-DD`, whichever the prerender carries. */
  date: string;
  contentHtml: string;
};

export function postViewFromDocument(root: ParentNode): PostView | null {
  const article = root.querySelector('article.blog-post-prerender');
  const body = article?.querySelector('.blog-post-body');
  if (!article || !body) return null;

  const time = article.querySelector('time');
  return {
    slug: article.getAttribute('data-slug') ?? '',
    title: article.querySelector('h1')?.textContent?.trim() || 'Untitled',
    date: time?.getAttribute('datetime') || time?.textContent?.trim() || '',
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
