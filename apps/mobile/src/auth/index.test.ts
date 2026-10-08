import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: vi.fn() }));
vi.mock('expo-auth-session', () => ({}));

describe('app auth wiring', () => {
  it('keeps tokens readable after first unlock, on this device only (ADR 0004)', async () => {
    const { KEYCHAIN_OPTIONS } = await import('./index');
    expect(KEYCHAIN_OPTIONS).toEqual({
      keychainAccessible: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    });
  });
});
