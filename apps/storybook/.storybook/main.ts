import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(root, '../../web');

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
  // Only what the components load by URL, so the site's robots.txt and
  // social images stay out of the catalog.
  staticDirs: [
    { from: path.join(webRoot, 'public/fonts'), to: '/fonts' },
    { from: path.join(webRoot, 'public/profile.jpg'), to: '/profile.jpg' },
  ],
  core: { disableTelemetry: true },
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      resolve: { alias: { '@web': path.join(webRoot, 'src') } },
      // The web app's vite.config.ts sets these per build.
      define: {
        'import.meta.env.VITE_PUBLIC_SITE_ORIGIN': JSON.stringify(
          'https://gagnechris.com',
        ),
        'import.meta.env.VITE_ADMIN_ORIGIN': JSON.stringify(
          'https://admin.gagnechris.com',
        ),
        'import.meta.env.VITE_NOTEBOOK_ORIGIN': JSON.stringify(
          'https://notebook.gagnechris.com',
        ),
        'import.meta.env.VITE_GA_MEASUREMENT_ID': JSON.stringify(''),
      },
    }),
};

export default config;
