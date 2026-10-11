import {
  APEX_DOMAIN,
  isSafeLinkHref,
  isSitePath,
  POST_LINK_SCHEMES,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { openBrowserAsync } from 'expo-web-browser';
import { Linking } from 'react-native';

/** Root-relative note links and images resolve against the Notebook host, as on the web. */
export const NOTEBOOK_ORIGIN = `https://notebook.${APEX_DOMAIN}`;

/** Post links and images resolve against the public site, where they are published. */
export const PUBLIC_SITE_ORIGIN = `https://${APEX_DOMAIN}`;

export const resolveMarkdownUrl = (
  href: string,
  origin: string = NOTEBOOK_ORIGIN,
): string | null => {
  if (!isSafeLinkHref(href, POST_LINK_SCHEMES)) return null;
  return isSitePath(href) ? `${origin}${href}` : href;
};

/** Web pages open in SFSafariViewController; `mailto:` and `tel:` go to the system. */
export const openMarkdownLink = async (
  href: string,
  origin: string = NOTEBOOK_ORIGIN,
): Promise<void> => {
  const url = resolveMarkdownUrl(href, origin);
  if (!url) return;
  try {
    if (/^https?:/i.test(url)) {
      await openBrowserAsync(url, {
        controlsColor: tokens.primary[700],
        dismissButtonStyle: 'done',
      });
    } else {
      await Linking.openURL(url);
    }
  } catch {
    // Already presenting, or no app handles the scheme.
  }
};
