import { clearPendingFlushes, pendingFlushCount } from '@gagnechris/app-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activeCacheSession } from './session';

/** For the "N unsaved edits will be lost" prompt before sign-out. */
export const unsavedEditCount = pendingFlushCount;

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
  // Nothing else lives in AsyncStorage; anything stored on disk later joins
  // this list and the sign-out test.
  await AsyncStorage.clear();
};
