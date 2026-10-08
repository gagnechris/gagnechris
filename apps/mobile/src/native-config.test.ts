import bundledNativeModules from 'expo/bundledNativeModules.json';
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

  it('installs the sign-in, token, entropy, cache, and network modules', () => {
    for (const name of [
      'expo-auth-session',
      'expo-web-browser',
      'expo-secure-store',
      'expo-crypto',
      '@react-native-async-storage/async-storage',
      'expo-sqlite',
      '@react-native-community/netinfo',
    ]) {
      expect(pkg.dependencies, name).toHaveProperty(name);
    }
  });

  it('pins native modules to the Expo SDK versions', () => {
    const bundled: Record<string, string> = bundledNativeModules;
    // React is ahead of the SDK pin on purpose; see docs/mobile.md.
    const mismatched = Object.entries(pkg.dependencies)
      .filter(([name]) => name !== 'react' && name in bundled)
      .filter(([name, range]) => bundled[name] !== range);
    expect(mismatched).toEqual([]);
  });

  const buildProperties = () =>
    app.plugins.find(
      (plugin) =>
        Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    )?.[1] as { ios?: Record<string, unknown> } | undefined;

  it('targets iOS 17.4 for the HTTPS auth callback', () => {
    expect(buildProperties()?.ios?.deploymentTarget).toBe('17.4');
  });

  it('adopts the scene life cycle, which the iOS 27 SDK requires at launch', () => {
    expect(buildProperties()?.ios?.enableSceneSupport).toBe(true);
  });

  it('embeds the Inter faces the theme names', () => {
    const fonts = app.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-font',
    )?.[1] as { fonts: string[] } | undefined;
    expect(fonts?.fonts.map((path) => path.split('/').pop())).toEqual([
      'Inter_400Regular.ttf',
      'Inter_500Medium.ttf',
      'Inter_600SemiBold.ttf',
      'Inter_700Bold.ttf',
    ]);
  });

  it('associates the notebook host for universal links and the https sign-in callback', () => {
    expect(app.ios.associatedDomains).toEqual([
      'applinks:notebook.gagnechris.com',
      'webcredentials:notebook.gagnechris.com',
      'webcredentials:gagnechris.com',
    ]);
  });

  it('signs and submits with the Apple Team ID the AASA files name', () => {
    expect(app.ios.appleTeamId).toBe('FF9YB7FZ7A');
    expect(eas.submit.production.ios.appleTeamId).toBe('FF9YB7FZ7A');
  });
});
