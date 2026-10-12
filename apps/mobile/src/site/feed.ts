import {
  SITE_HOME_JSON_PATH,
  SITE_POSTS_JSON_PATH,
  SITE_RESUME_JSON_PATH,
  sitePostJsonPath,
  type SiteHomeJson,
  type SitePostJson,
  type SitePostListItem,
  type SitePostsJson,
  type SiteResumeJson,
} from '@gagnechris/shared';
import { useQuery } from '@tanstack/react-query';
import { siteOrigin } from '../config';

export class SiteNotFound extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${siteOrigin}${path}`, {
    headers: { Accept: 'application/json' },
  });
  // S3 answers a missing key with 403 when the caller can't list the bucket.
  if (response.status === 404 || response.status === 403) {
    throw new SiteNotFound(path);
  }
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

const siteKeys = {
  home: ['site', 'home'] as const,
  posts: ['site', 'posts'] as const,
  post: (slug: string) => ['site', 'post', slug] as const,
  resume: ['site', 'resume'] as const,
};

// Published pages change rarely; a pull to refresh refetches.
const STALE_MS = 5 * 60 * 1000;

export const useSiteHome = () =>
  useQuery({
    queryKey: siteKeys.home,
    queryFn: () => getJson<SiteHomeJson>(SITE_HOME_JSON_PATH),
    staleTime: STALE_MS,
  });

export const useSitePosts = () =>
  useQuery({
    queryKey: siteKeys.posts,
    queryFn: async (): Promise<SitePostListItem[]> => {
      const data = await getJson<Partial<SitePostsJson>>(SITE_POSTS_JSON_PATH);
      return (Array.isArray(data.items) ? data.items : []).filter(
        (item) => typeof item?.slug === 'string' && item.slug !== '',
      );
    },
    staleTime: STALE_MS,
  });

export const useSitePost = (slug: string) =>
  useQuery({
    queryKey: siteKeys.post(slug),
    queryFn: () => getJson<SitePostJson>(sitePostJsonPath(slug)),
    staleTime: STALE_MS,
    retry: (count, error) => !(error instanceof SiteNotFound) && count < 2,
  });

export const useSiteResume = () =>
  useQuery({
    queryKey: siteKeys.resume,
    queryFn: () => getJson<SiteResumeJson>(SITE_RESUME_JSON_PATH),
    staleTime: STALE_MS,
  });

export const siteUrlFor = (path: string): string => `${siteOrigin}${path}`;
