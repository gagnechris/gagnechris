import { openBrowserAsync } from 'expo-web-browser';
import { ActionSheetIOS, Share } from 'react-native';
import { PUBLIC_SITE_ORIGIN } from '../markdown/links';

/** A live path or `href` as a URL to open: site paths on the public site, others as they are. */
export const liveUrl = (path: string | null | undefined): string | null =>
  !path ? null : path.startsWith('/') ? `${PUBLIC_SITE_ORIGIN}${path}` : path;

type Options = {
  /** The public URL while published, else null; a published project with no page has none. */
  liveUrl: string | null;
  /** Shows Unpublish and Discard; defaults to having a live URL. */
  published?: boolean;
  hasUnpublishedChanges: boolean;
  onDiscard: () => void;
  onUnpublish: () => void;
  /** Omitted for a page that can't be deleted. */
  onDelete?: () => void;
};

/** The ⋯ menu of a publishable editor. */
export function showPublishableMenu({
  liveUrl,
  published = liveUrl !== null,
  hasUnpublishedChanges,
  onDiscard,
  onUnpublish,
  onDelete,
}: Options) {
  const items: { label: string; run: () => void; destructive?: boolean }[] = [];
  if (liveUrl) {
    items.push(
      { label: 'View on site', run: () => void openBrowserAsync(liveUrl) },
      { label: 'Share link', run: () => void Share.share({ url: liveUrl }) },
    );
  }
  if (published) {
    if (hasUnpublishedChanges) {
      items.push({ label: 'Discard unpublished changes', run: onDiscard });
    }
    items.push({ label: 'Unpublish', run: onUnpublish });
  }
  if (onDelete) {
    items.push({ label: 'Delete', run: onDelete, destructive: true });
  }
  if (items.length === 0) return;
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: [...items.map((item) => item.label), 'Cancel'],
      destructiveButtonIndex: onDelete ? items.length - 1 : undefined,
      cancelButtonIndex: items.length,
    },
    (index) => items[index]?.run(),
  );
}
