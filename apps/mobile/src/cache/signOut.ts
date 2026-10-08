import { clearPendingFlushes, pendingFlushCount } from '@gagnechris/app-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activeCacheSession } from './session';

export const unsavedEditCount = pendingFlushCount;

/** The sign-out confirmation's message, when edits would be lost. */
export const signOutWarning = (count = unsavedEditCount()) =>
  count === 0
    ? undefined
    : `${count} unsaved ${count === 1 ? 'edit' : 'edits'} will be lost.`;

/**
 * Wipes every local copy of the user's data. Order matters: the persister
 * stops first so a throttled write can't put the cache back after the clear.
 * Token revocation and Keychain deletion follow, owned by sign-in.
 */
export const wipeLocalData = async () => {
  const session = activeCacheSession();
  await session?.stop();
  session?.queryClient.clear();
  clearPendingFlushes();
  // Everything in AsyncStorage is per-user (cache, area preference, install
  // marker, which sign-in rewrites); new on-disk data must join the sign-out test.
  await AsyncStorage.clear();
};
