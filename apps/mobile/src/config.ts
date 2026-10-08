export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';

const DEFAULT_LOCAL_GROUPS = ['site-admin', 'notebook', 'user-admin'];

export function parseGroups(raw: string | undefined): readonly string[] {
  if (raw === undefined) return DEFAULT_LOCAL_GROUPS;
  return raw
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean);
}

/** Local fake auth: `EXPO_PUBLIC_LOCAL_AUTH_GROUPS=site-admin` signs in without Notebook. */
export const localAuthGroups = parseGroups(
  process.env.EXPO_PUBLIC_LOCAL_AUTH_GROUPS as string | undefined,
);
