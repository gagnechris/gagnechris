import type { RetrySignals } from '@gagnechris/app-core';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

// `isConnected` is null until NetInfo's first check; only a definite false is
// offline, so launch doesn't pause queries while it looks.
const isOnline = (state: NetInfoState) => state.isConnected !== false;

/** NetInfo drives TanStack's online state and AppState its focus state. */
export const startConnectivity = () => {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnline(state))),
  );
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (state) =>
      setFocused(state === 'active'),
    );
    return () => subscription.remove();
  });
  return () => {
    onlineManager.setEventListener(() => undefined);
    focusManager.setEventListener(() => undefined);
  };
};

/** Retries a held save when the connection returns or the app comes back. */
export const nativeRetrySignals: RetrySignals = (retry) => {
  const offOnline = onlineManager.subscribe((online) => {
    if (online) retry();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') retry();
  });
  return () => {
    offOnline();
    appState.remove();
  };
};

const subscribeOnline = (listener: () => void) =>
  onlineManager.subscribe(listener);
const getOnline = () => onlineManager.isOnline();

export const useIsOnline = () =>
  useSyncExternalStore(subscribeOnline, getOnline, getOnline);
