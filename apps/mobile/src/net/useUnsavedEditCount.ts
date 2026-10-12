import {
  pendingFlushCount,
  subscribePendingFlushes,
} from '@gagnechris/app-core';
import { useSyncExternalStore } from 'react';
import { useOutboxUnattendedCount } from '../outbox/useOutbox';

/**
 * Edits not on the server yet: queued in the outbox with no editor waiting
 * on them, or held by a closed editor.
 */
export const useUnsavedEditCount = () =>
  useSyncExternalStore(
    subscribePendingFlushes,
    pendingFlushCount,
    pendingFlushCount,
  ) + useOutboxUnattendedCount();
