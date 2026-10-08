import { describe, expect, it } from 'vitest';
import { initials, rootGuards } from './session';

describe('root gate', () => {
  it('shows the tabs only to a signed-in user with the notebook group', () => {
    expect(rootGuards('signedIn', true)).toEqual({
      notebook: true,
      noAccess: false,
      signIn: false,
    });
  });

  it('shows No access to a signed-in user without it', () => {
    expect(rootGuards('signedIn', false)).toEqual({
      notebook: false,
      noAccess: true,
      signIn: false,
    });
  });

  it('shows sign-in when signed out, and nothing while restoring', () => {
    expect(rootGuards('signedOut', false).signIn).toBe(true);
    expect(Object.values(rootGuards('restoring', false))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('builds avatar initials from the name, else the email', () => {
    const user = { sub: 's', email: 'chris.gagne@example.com', groups: [] };
    expect(initials({ ...user, name: 'Chris Gagne' })).toBe('CG');
    expect(initials({ ...user, name: null })).toBe('CG');
    expect(initials({ ...user, email: 'alex@example.com', name: null })).toBe(
      'A',
    );
  });
});
