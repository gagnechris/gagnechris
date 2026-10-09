import type { ApiClient } from '@gagnechris/api-client';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { openOutboxDb } from './nativeDb';
import type { OutboxDb } from './store';
import {
  drainOutbox,
  outboxFailedCount,
  outboxPendingCount,
  startOutbox,
  stopOutbox,
  subscribeOutbox,
} from './session';

/** Opens the outbox for the signed-in user and sends it whenever the phone can. */
export const useOutboxSession = (
  client: ApiClient,
  db: () => Promise<OutboxDb> = openOutboxDb,
) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    void startOutbox({ db, client, queryClient });
    const offOnline = onlineManager.subscribe((online) => {
      if (online) void drainOutbox();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainOutbox();
    });
    return () => {
      offOnline();
      appState.remove();
      void stopOutbox();
    };
  }, [client, db, queryClient]);
};

export const useOutboxFailedCount = () =>
  useSyncExternalStore(subscribeOutbox, outboxFailedCount, outboxFailedCount);

export const useOutboxPendingCount = () =>
  useSyncExternalStore(subscribeOutbox, outboxPendingCount, outboxPendingCount);
