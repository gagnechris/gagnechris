import { useGetApiClient } from '@gagnechris/app-core';
import {
  onlineManager,
  useIsRestoring,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { hasLocalEdits } from '../outbox/session';
import { pullSyncChanges, UpgradeRequiredError } from './syncFeed';
import { setUpgradeRequired, upgradeRequired } from './upgradeRequired';

/**
 * Pulls the change feed once the persisted cache is restored, then whenever
 * the connection returns or the app comes to the foreground. A failed pull
 * keeps its watermark and tries again on the next signal.
 */
export const useSyncFeed = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();

  useEffect(() => {
    if (isRestoring) return;
    let running: Promise<void> | null = null;
    let stopped = false;
    const pull = () => {
      if (stopped || running || upgradeRequired() !== null) return;
      if (!onlineManager.isOnline()) return;
      running = pullSyncChanges(getClient(), queryClient, hasLocalEdits)
        .catch((error: unknown) => {
          if (error instanceof UpgradeRequiredError) {
            setUpgradeRequired(error.minClientVersion);
          }
        })
        .finally(() => {
          running = null;
        });
    };
    pull();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) pull();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') pull();
    });
    return () => {
      stopped = true;
      offOnline();
      appState.remove();
    };
  }, [getClient, isRestoring, queryClient]);
};
