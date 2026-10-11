import { openBrowserAsync } from 'expo-web-browser';
import { ActionSheetIOS, Share } from 'react-native';

type Options = {
  /** The public URL while published, else null. */
  liveUrl: string | null;
  hasUnpublishedChanges: boolean;
  onDiscard: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
};

/** The ⋯ menu of a post or project editor. */
export function showPublishableMenu({
  liveUrl,
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
    if (hasUnpublishedChanges) {
      items.push({ label: 'Discard unpublished changes', run: onDiscard });
    }
    items.push({ label: 'Unpublish', run: onUnpublish });
  }
  items.push({ label: 'Delete', run: onDelete, destructive: true });
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options: [...items.map((item) => item.label), 'Cancel'],
      destructiveButtonIndex: items.length - 1,
      cancelButtonIndex: items.length,
    },
    (index) => items[index]?.run(),
  );
}
