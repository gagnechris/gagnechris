import { describe, expect, test } from 'vitest';
import type { ManagedUser } from '@gagnechris/shared';
import {
  ApiError,
  accessChange,
  formatAdded,
  hasApp,
  userErrorMessage,
} from '../src/index.js';

const sam = { name: 'Sam Rivera', email: 'sam@example.com' };

const user = (over: Partial<ManagedUser>): ManagedUser => ({
  id: 'u',
  email: 'sam@example.com',
  name: 'Sam Rivera',
  level: 'cms',
  status: 'active',
  createdAt: null,
  ...over,
});

describe('accessChange', () => {
  test('lists gains before losses and warns about the sign-out', () => {
    expect(accessChange(sam, 'cms', 'notebook')).toEqual({
      title: 'Public CMS → Notebook only',
      body: 'Sam gains Notebook. Sam loses Admin. Saving signs them out everywhere, so they can’t start a new session; a tab they already have open stops working within a minute.',
    });
  });

  test('only gains apply on the next open', () => {
    expect(accessChange(sam, 'notebook', 'full').body).toBe(
      'Sam gains Admin and Users. It applies the next time they open the app.',
    );
  });

  test('someone with no level gains everything the new one gives', () => {
    expect(accessChange(sam, null, 'cms')).toEqual({
      title: 'No access → Public CMS',
      body: 'Sam gains Admin. It applies the next time they open the app.',
    });
  });
});

describe('people', () => {
  test('disabled and removed people open no apps', () => {
    expect(hasApp(user({ level: 'full' }), 'Notebook')).toBe(true);
    expect(hasApp(user({ level: 'cms' }), 'Notebook')).toBe(false);
    expect(hasApp(user({ status: 'disabled' }), 'Admin')).toBe(false);
    expect(hasApp(user({ status: 'removed' }), 'Admin')).toBe(false);
  });

  test('formats the added date, with the year only when it differs', () => {
    const now = new Date(2026, 9, 6, 12);
    const at = (...ymd: [number, number, number]) =>
      new Date(...ymd, 12).toISOString();
    expect(formatAdded(at(2026, 9, 1), now)).toBe('Oct 1');
    expect(formatAdded(at(2025, 8, 12), now)).toBe('Sep 12, 2025');
    expect(formatAdded(null, now)).toBe('—');
  });
});

describe('userErrorMessage', () => {
  test('explains conflicts and missing permission', () => {
    expect(
      userErrorMessage(new ApiError('x', 409, 'last_full_admin'), 'f'),
    ).toBe('There must always be at least one Full Admin.');
    expect(userErrorMessage(new ApiError('x', 403), 'f')).toBe(
      'Only Full Admins can manage users.',
    );
    expect(userErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
