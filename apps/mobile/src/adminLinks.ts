const ADMIN_LINK = /^https:\/\/admin\.gagnechris\.com(\/[^?#]*)?(?:[?#]|$)/i;

const ROUTES: [RegExp, (id: string) => string][] = [
  [/^\/posts\/([^/]+)$/, (id) => `/admin/posts/${id}`],
  [/^\/projects\/([^/]+)$/, (id) => `/admin/projects/${id}`],
  [/^\/projects$/, () => '/admin/projects'],
  [/^\/home$/, () => '/admin/pages/home'],
  [/^\/resume$/, () => '/admin/pages/resume'],
  [/^\/settings\/users$/, () => '/admin/users'],
];

/**
 * The app route for an admin.gagnechris.com link, or null for any other URL.
 * Paths the app has no screen for open the Posts list.
 */
export function adminLinkRoute(url: string): string | null {
  const match = ADMIN_LINK.exec(url);
  if (!match) return null;
  const path = (match[1] ?? '/').replace(/\/+$/, '');
  for (const [pattern, route] of ROUTES) {
    const found = pattern.exec(path);
    if (found) return route(found[1] ?? '');
  }
  return '/admin/posts';
}
