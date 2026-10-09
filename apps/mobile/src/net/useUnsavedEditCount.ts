import {
  pendingFlushCount,
  subscribePendingFlushes,
} from '@gagnechris/app-core';
import { useSyncExternalStore } from 'react';
import { useOutboxPendingCount } from '../outbox/useOutbox';

/** Edits not on the server yet: queued in the outbox, or held by a closed editor. */
export const useUnsavedEditCount = () =>
  useSyncExternalStore(
    subscribePendingFlushes,
    pendingFlushCount,
    pendingFlushCount,
  ) + useOutboxPendingCount();
