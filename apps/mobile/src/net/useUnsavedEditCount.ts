import {
  pendingFlushCount,
  subscribePendingFlushes,
} from '@gagnechris/app-core';
import { useSyncExternalStore } from 'react';

/** Edits whose editor closed before they reached the server. */
export const useUnsavedEditCount = () =>
  useSyncExternalStore(
    subscribePendingFlushes,
    pendingFlushCount,
    pendingFlushCount,
  );
