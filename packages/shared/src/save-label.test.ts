import { describe, expect, test } from 'vitest';
import { saveLabel } from './save-label.js';

describe('saveLabel', () => {
  test('covers saving, dirty and clean', () => {
    expect(saveLabel('saving', true)).toBe('Saving…');
    expect(saveLabel('idle', true)).toBe('Unsaved changes');
    expect(saveLabel('saved', false)).toBe('Saved');
    expect(saveLabel('idle', false)).toBe('Saved');
  });

  test('says when a new entity has never been saved', () => {
    expect(saveLabel('idle', false, { isNew: true })).toBe('Not saved yet');
    expect(saveLabel('idle', true, { isNew: true })).toBe('Unsaved changes');
  });

  test('says an offline edit or failed save will retry', () => {
    expect(saveLabel('idle', true, { offline: true })).toBe(
      'Offline, will retry',
    );
    expect(saveLabel('error', false, { offline: true })).toBe(
      'Offline, will retry',
    );
    expect(saveLabel('saved', false, { offline: true })).toBe('Saved');
  });
});
