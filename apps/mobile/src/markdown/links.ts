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

export const resolveMarkdownUrl = (href: string): string | null => {
  if (!isSafeLinkHref(href, POST_LINK_SCHEMES)) return null;
  return isSitePath(href) ? `${NOTEBOOK_ORIGIN}${href}` : href;
};

/** Web pages open in SFSafariViewController; `mailto:` and `tel:` go to the system. */
export const openMarkdownLink = async (href: string): Promise<void> => {
  const url = resolveMarkdownUrl(href);
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
