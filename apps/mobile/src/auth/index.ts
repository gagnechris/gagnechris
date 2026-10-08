import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { maybeCompleteAuthSession } from 'expo-web-browser';
import { authMode, cognitoConfig, localAuthGroups } from '../config';
import type { AuthBackend } from '../session';
import { createAuthBackend } from './backend';
import { cognitoIssuer } from './cognito';
import { localIssuer } from './local';
import { createTokenStore } from './tokenStore';

// Readable after first unlock so a refresh can run (and write the rotated
// token) while the phone is locked; THIS_DEVICE_ONLY keeps it out of backups.
export const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

maybeCompleteAuthSession();

export function createAppAuth(): AuthBackend {
  return createAuthBackend({
    issuer:
      authMode === 'local'
        ? localIssuer(localAuthGroups)
        : cognitoIssuer(cognitoConfig),
    tokens: createTokenStore(SecureStore, KEYCHAIN_OPTIONS),
    storage: AsyncStorage,
  });
}
