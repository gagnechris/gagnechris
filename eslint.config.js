import { readdirSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// The `node` resolver peer implements the wrong interface for ESLint 10.
const importXResolverSettings = {
  'import-x/resolver-next': [createNodeResolver()],
};

const crossWorkspaceRelativePatterns = [
  {
    group: [
      '**/../services/**',
      '**/../packages/**',
      '**/../apps/**',
      '**/../infra/**',
      '../../services/**',
      '../../packages/**',
      '../../apps/**',
      '../../infra/**',
      '../../../services/**',
      '../../../packages/**',
      '../../../apps/**',
      '../../../infra/**',
    ],
    message:
      'Import workspace packages by name (e.g. @gagnechris/data), not via relative paths across workspaces.',
  },
];

const siblingPackageRelativePatterns = [
  {
    group: [
      '../shared',
      '../shared/**',
      '../data',
      '../data/**',
      '../api-client',
      '../api-client/**',
      '../app-core',
      '../app-core/**',
      '../tokens',
      '../tokens/**',
      '../../shared/**',
      '../../data/**',
      '../../api-client/**',
      '../../app-core/**',
      '../../tokens/**',
    ],
    message:
      'Import workspace packages by name (e.g. @gagnechris/shared), not via relative sibling paths.',
  },
];

const noCrossWorkspaceRelativeImports = {
  'no-restricted-imports': [
    'error',
    {
      // Sibling bans (`../data`, …) apply only to packages/*: services/api has
      // its own local src/data/ folder.
      patterns: crossWorkspaceRelativePatterns,
    },
  ],
};

const platformNeutralRestrictedImports = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'react-dom',
          message: 'Platform-neutral packages must not import react-dom.',
        },
        {
          name: 'aws-amplify',
          message: 'Platform-neutral packages must not import aws-amplify.',
        },
        {
          name: 'marked',
          message:
            'Platform-neutral packages must not import marked. Use shared/render at the app boundary.',
        },
        {
          name: '@gagnechris/data',
          message:
            'Platform-neutral packages must not import @gagnechris/data.',
        },
        {
          name: 'fs',
          message: 'Platform-neutral packages must not import Node builtins.',
        },
        {
          name: 'crypto',
          message: 'Platform-neutral packages must not import Node builtins.',
        },
        {
          name: 'path',
          message: 'Platform-neutral packages must not import Node builtins.',
        },
        {
          name: 'os',
          message: 'Platform-neutral packages must not import Node builtins.',
        },
        {
          name: 'child_process',
          message: 'Platform-neutral packages must not import Node builtins.',
        },
      ],
      patterns: [
        ...crossWorkspaceRelativePatterns,
        ...siblingPackageRelativePatterns,
        {
          group: ['node:*'],
          message: 'Platform-neutral packages must not import node:* builtins.',
        },
        {
          group: ['@aws-sdk', '@aws-sdk/*'],
          message: 'Platform-neutral packages must not import @aws-sdk/*.',
        },
        {
          group: ['aws-amplify/*'],
          message: 'Platform-neutral packages must not import aws-amplify.',
        },
        {
          group: ['@codemirror', '@codemirror/*'],
          message: 'Platform-neutral packages must not import @codemirror/*.',
        },
        {
          group: ['react-dom/*'],
          message: 'Platform-neutral packages must not import react-dom.',
        },
        {
          group: ['@gagnechris/shared/*'],
          message:
            'RN-facing packages must import @gagnechris/shared (domain root) only — not /render or /openapi.',
        },
        {
          group: ['@gagnechris/data/*'],
          message:
            'Platform-neutral packages must not import @gagnechris/data.',
        },
        {
          group: [
            './render.js',
            './render',
            './html.js',
            './html',
            './markdown.js',
            './markdown',
            './home-html.js',
            './home-html',
            './resume-html.js',
            './resume-html',
            './post-html.js',
            './post-html',
            './project-html.js',
            './project-html',
            './site-chrome-html.js',
            './site-chrome-html',
            './public-pages-html.js',
            './public-pages-html',
            './page-meta-html.js',
            './page-meta-html',
          ],
          message:
            'Shared domain must not import render/html/markdown helpers. Keep them in the render entry.',
        },
      ],
    },
  ],
};

const platformNeutralRestrictedGlobals = {
  'no-restricted-globals': [
    'error',
    {
      name: 'process',
      message:
        'Platform-neutral packages must not use process. Inject env at the app boundary.',
    },
    {
      name: 'Buffer',
      message: 'Platform-neutral packages must not use Buffer.',
    },
    {
      name: 'window',
      message:
        'Platform-neutral packages must not use window. Inject platform APIs.',
    },
    {
      name: 'document',
      message:
        'Platform-neutral packages must not use document. Inject platform APIs.',
    },
    {
      name: 'localStorage',
      message:
        'Platform-neutral packages must not use localStorage. Inject storage.',
    },
    {
      name: 'sessionStorage',
      message:
        'Platform-neutral packages must not use sessionStorage. Inject storage.',
    },
    {
      name: 'navigator',
      message:
        'Platform-neutral packages must not use navigator. Inject platform APIs.',
    },
    {
      name: 'location',
      message:
        'Platform-neutral packages must not use location. Inject platform APIs.',
    },
  ],
};

const platformNeutralRestrictedSyntax = {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'ImportExpression[source.value=/^node:/]',
      message: 'Platform-neutral packages must not dynamically import node:*.',
    },
    {
      selector:
        "MemberExpression[object.name='globalThis'][property.name='process']",
      message: 'Platform-neutral packages must not use globalThis.process.',
    },
    {
      selector:
        "MemberExpression[object.name='globalThis'][property.name='window']",
      message: 'Platform-neutral packages must not use globalThis.window.',
    },
  ],
};

/** Relative import of a sibling app directory under apps/web/src. */
// Everything in apps/web/src except the kit and `lib/`, read from disk so a
// new app directory is out of the kit's reach without editing this list.
const webSrc = new URL('./apps/web/src/', import.meta.url);
const kitSubdirs = new Set(
  readdirSync(new URL('kit/', webSrc), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);
const kitForbiddenWebModules = readdirSync(webSrc, { withFileTypes: true })
  .filter((entry) =>
    entry.isDirectory()
      ? !['kit', 'lib', 'admin', 'notebook', 'workspace'].includes(entry.name)
      : /^[A-Za-z]\w*\.tsx?$/.test(entry.name) &&
        !/\.(test|d)\.tsx?$/.test(entry.name),
  )
  .map((entry) => entry.name.replace(/\.tsx?$/, ''))
  .filter((name) => !kitSubdirs.has(name));

const webDirImport = (...dirs) => ({
  regex: `^\\.{1,2}/(?:.*/)?(?:${dirs.join('|')})(?:/|$)`,
});

// Each web app builds alone; these keep one app's code out of another's bundle.
// The public Vite build's bundle-boundary plugin is the hard check.
const webAppZones = [
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/src/{admin,notebook,workspace}/**',
      'apps/web/src/**/*.test.{ts,tsx}',
      'apps/web/src/__tests__/**',
      'apps/web/src/test-utils.tsx',
      'apps/web/src/setupTests.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'aws-amplify',
              message: 'The public site never signs anyone in.',
            },
            {
              name: '@gagnechris/app-core',
              message: 'Signed-in app code stays out of the public bundle.',
            },
            {
              name: '@tanstack/react-query',
              message: 'Signed-in app code stays out of the public bundle.',
            },
          ],
          patterns: [
            ...crossWorkspaceRelativePatterns,
            {
              ...webDirImport('admin', 'notebook', 'workspace', 'auth'),
              message:
                'Public pages must not import the admin, Notebook or workspace apps.',
            },
            {
              group: ['aws-amplify/*', '@aws-amplify/*'],
              message: 'The public site never signs anyone in.',
            },
          ],
        },
      ],
    },
  },
  // Admin, Notebook and the public demos import the kit; it stays public-safe.
  {
    files: ['apps/web/src/kit/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/kit/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'aws-amplify',
              message: 'The kit never signs anyone in.',
            },
            {
              name: '@gagnechris/app-core',
              message:
                'The kit is presentational: pass data and callbacks in as props.',
            },
            {
              name: '@tanstack/react-query',
              message:
                'The kit is presentational: pass data and callbacks in as props.',
            },
            {
              name: '@gagnechris/api-client',
              message: 'The kit never calls the API.',
            },
          ],
          patterns: [
            ...crossWorkspaceRelativePatterns,
            {
              ...webDirImport('admin', 'notebook', 'workspace', 'auth'),
              message:
                'The kit must not import the admin, Notebook or workspace apps.',
            },
            {
              ...webDirImport(...kitForbiddenWebModules),
              message:
                'The kit must not import app code: pages, API clients, analytics and app chrome stay outside it.',
            },
            {
              group: ['aws-amplify/*', '@aws-amplify/*'],
              message: 'The kit never signs anyone in.',
            },
            {
              group: ['@gagnechris/api-client/*', '@tanstack/react-query/*'],
              message: 'The kit never calls the API.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/admin/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...crossWorkspaceRelativePatterns,
            {
              ...webDirImport('notebook'),
              message: 'The admin app must not import the Notebook app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/notebook/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...crossWorkspaceRelativePatterns,
            {
              ...webDirImport('admin'),
              message: 'The Notebook app must not import the admin app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/workspace/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...crossWorkspaceRelativePatterns,
            {
              ...webDirImport('admin', 'notebook'),
              message:
                'Shared workspace code must not depend on either app; move the code into workspace/.',
            },
          ],
        },
      ],
    },
  },
];

const unusedVarsRule = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', ignoreRestSiblings: true },
  ],
};

const sharedDomainIgnores = [
  'packages/shared/src/**/*.test.ts',
  'packages/shared/src/render.ts',
  'packages/shared/src/html.ts',
  'packages/shared/src/markdown.ts',
  'packages/shared/src/home-html.ts',
  'packages/shared/src/resume-html.ts',
  'packages/shared/src/post-html.ts',
  'packages/shared/src/project-html.ts',
  'packages/shared/src/site-chrome-html.ts',
  'packages/shared/src/public-pages-html.ts',
  'packages/shared/src/page-meta-html.ts',
  'packages/shared/src/openapi.ts',
  'packages/shared/src/openapi-extend.ts',
  'packages/shared/src/generate-openapi.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'apps/web/dist-admin/**',
      'apps/web/dist-notebook/**',
      '**/coverage/**',
      '**/cdk.out/**',
      '**/node_modules/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
      'e2e/.stack/**',
      'packages/api-client/src/schema.d.ts',
      'packages/shared/openapi/openapi.json',
      'packages/tokens/src/variables.css',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: [
      'packages/**/*.{ts,tsx}',
      'services/**/*.{ts,tsx}',
      'infra/**/*.{ts,tsx}',
      'scripts/**/*.{ts,tsx,mjs}',
      'e2e/**/*.ts',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    plugins: {
      'import-x': importX,
    },
    settings: importXResolverSettings,
    rules: {
      ...noCrossWorkspaceRelativeImports,
      ...unusedVarsRule,
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
    },
  },
  {
    files: [
      'packages/app-core/**/*.{ts,tsx}',
      'packages/api-client/**/*.{ts,tsx}',
      'packages/tokens/src/**/*.{ts,tsx}',
      'packages/shared/src/**/*.{ts,tsx}',
    ],
    ignores: sharedDomainIgnores,
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.es2022,
    },
    rules: {
      ...platformNeutralRestrictedImports,
      ...platformNeutralRestrictedGlobals,
      ...platformNeutralRestrictedSyntax,
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import-x': importX,
    },
    settings: importXResolverSettings,
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...noCrossWorkspaceRelativeImports,
      ...unusedVarsRule,
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  ...webAppZones,
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    plugins: {
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    settings: {
      ...importXResolverSettings,
      // react-native ships Flow sources the parser cannot read.
      'import-x/ignore': ['node_modules'],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...noCrossWorkspaceRelativeImports,
      ...unusedVarsRule,
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
    },
  },
);
