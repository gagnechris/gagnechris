import { useCallback, useId, useRef, useState } from 'react';
import {
  errorMessage,
  postResource,
  type PostSummary,
} from '@gagnechris/app-core';
import { useDismiss } from '../kit/useDismiss';

type Props = {
  post: PostSummary;
  onError: (message: string | null) => void;
};

/** A post row's "…" menu: Publish or Unpublish without opening the editor. */
export function PostRowActions({ post, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, container);
  const { publish, unpublish } = postResource.useLifecycleMutators({
    id: post.id,
  });

  const run = async (
    action: typeof publish,
    fallback: string,
  ): Promise<void> => {
    setOpen(false);
    setBusy(true);
    onError(null);
    const result = await action({ version: post.version });
    setBusy(false);
    if (result.error) onError(errorMessage(result.error, fallback));
  };

  const canPublish = post.status === 'draft' || post.hasUnpublishedChanges;

  return (
    <div className="kit-row-actions" ref={container}>
      <button
        type="button"
        className="kit-row-actions__toggle"
        aria-label={`Actions for ${post.title}`}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">…</span>
      </button>
      {open ? (
        <div id={menuId} className="kit-row-actions__menu">
          {canPublish ? (
            <button
              type="button"
              onClick={() => void run(publish, 'Could not publish.')}
            >
              {post.hasUnpublishedChanges ? 'Publish changes' : 'Publish'}
            </button>
          ) : null}
          {post.status === 'published' ? (
            <button
              type="button"
              onClick={() => void run(unpublish, 'Could not unpublish.')}
            >
              Unpublish
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
