import { describe, expect, test } from 'vitest';
import * as domain from './index.js';
import * as server from './server.js';

describe('@gagnechris/shared/server', () => {
  test('holds the server-only values the domain entry leaves out', () => {
    const serverNames = Object.keys(server);
    expect(serverNames.length).toBeGreaterThan(0);
    expect(serverNames.filter((name) => name in domain)).toEqual([]);
  });
});
