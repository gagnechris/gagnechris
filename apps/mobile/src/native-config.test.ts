import { describe, expect, it } from 'vitest';
import appJson from '../app.json';
import eas from '../eas.json';
import pkg from '../package.json';

const app = appJson.expo;

describe('native build config', () => {
  it('boots through the polyfill entry into expo-router', () => {
    expect(pkg.main).toBe('index.ts');
    expect(app.plugins).toContain('expo-router');
    expect(pkg.dependencies).toHaveProperty('expo-router');
  });

  it('builds a simulator dev client with no Apple credentials', () => {
    expect(pkg.dependencies).toHaveProperty('expo-dev-client');
    expect(eas.build.development).toMatchObject({
      developmentClient: true,
      ios: { simulator: true },
    });
  });

  it('auto-increments production build numbers', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.preview).toBeDefined();
  });

  it('installs the sign-in, token, entropy, and cache native modules', () => {
    for (const name of [
      'expo-auth-session',
      'expo-web-browser',
      'expo-secure-store',
      'expo-crypto',
      'react-native-mmkv',
      'react-native-nitro-modules',
    ]) {
      expect(pkg.dependencies, name).toHaveProperty(name);
    }
  });

  it('claims the notebook host for universal links', () => {
    expect(app.ios.associatedDomains).toContain(
      'applinks:notebook.gagnechris.com',
    );
  });
});
