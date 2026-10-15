import { useState } from 'react';
import {
  errorMessage,
  postResource,
  type PostSummary,
} from '@gagnechris/app-core';
import { IconButton, Menu, MenuItem } from '@gagnechris/ui';
import ShellIcon from '../workspace/ui/ShellIcon';

type Props = {
  post: PostSummary;
  onError: (message: string | null) => void;
};

/** A post row's "…" menu: Publish or Unpublish without opening the editor. */
export function PostRowActions({ post, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const { publish, unpublish } = postResource.useLifecycleMutators({
    id: post.id,
  });

  const run = async (
    action: typeof publish,
    fallback: string,
  ): Promise<void> => {
    setBusy(true);
    onError(null);
    const result = await action({ version: post.version });
    setBusy(false);
    if (result.error) onError(errorMessage(result.error, fallback));
  };

  const canPublish = post.status === 'draft' || post.hasUnpublishedChanges;

  return (
    <Menu
      label={`Actions for ${post.title}`}
      align="end"
      width={176}
      trigger={(props) => (
        <IconButton
          {...props}
          label={`Actions for ${post.title}`}
          disabled={busy}
        >
          <ShellIcon name="more" />
        </IconButton>
      )}
    >
      {canPublish ? (
        <MenuItem onSelect={() => void run(publish, 'Could not publish.')}>
          {post.hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
        </MenuItem>
      ) : null}
      {post.status === 'published' ? (
        <MenuItem onSelect={() => void run(unpublish, 'Could not unpublish.')}>
          Unpublish
        </MenuItem>
      ) : null}
    </Menu>
  );
}
