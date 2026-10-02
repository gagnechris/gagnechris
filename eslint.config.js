import js from '@eslint/js';
import globals from 'globals';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/** ESLint 10-compatible resolver (legacy `node` peer is optional and wrong interface). */
const importXResolverSettings = {
  'import-x/resolver-next': [createNodeResolver()],
};

/** Ban relative imports that leave a workspace into another (CHR-138). */
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

const noCrossWorkspaceRelativeImports = {
  'no-restricted-imports': [
    'error',
    {
      patterns: crossWorkspaceRelativePatterns,
    },
  ],
};

/** Platform-neutral RN-facing packages must not pull Node / web / AWS SDKs (CHR-156). */
const platformNeutralRestrictedImports = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'react-dom',
          message:
            'Platform-neutral packages must not import react-dom (CHR-156).',
        },
        {
          name: 'aws-amplify',
          message:
            'Platform-neutral packages must not import aws-amplify (CHR-156).',
        },
      ],
      patterns: [
        ...crossWorkspaceRelativePatterns,
        {
          group: ['node:*'],
          message:
            'Platform-neutral packages must not import node:* builtins (CHR-156).',
        },
        {
          group: ['@aws-sdk', '@aws-sdk/*'],
          message:
            'Platform-neutral packages must not import @aws-sdk/* (CHR-156).',
        },
        {
          group: ['aws-amplify/*'],
          message:
            'Platform-neutral packages must not import aws-amplify (CHR-156).',
        },
        {
          group: ['@codemirror', '@codemirror/*'],
          message:
            'Platform-neutral packages must not import @codemirror/* (CHR-156).',
        },
        {
          group: ['react-dom/*'],
          message:
            'Platform-neutral packages must not import react-dom (CHR-156).',
        },
        {
          group: ['@gagnechris/shared/*'],
          message:
            'RN-facing packages must import @gagnechris/shared (domain root) only — not /render or /openapi (CHR-164).',
        },
      ],
    },
  ],
};

/** Node / DOM globals that must not sneak into platform-neutral packages (CHR-164). */
const platformNeutralRestrictedGlobals = {
  'no-restricted-globals': [
    'error',
    {
      name: 'process',
      message:
        'Platform-neutral packages must not use process (CHR-164). Inject env at the app boundary.',
    },
    {
      name: 'Buffer',
      message: 'Platform-neutral packages must not use Buffer (CHR-164).',
    },
    {
      name: 'window',
      message:
        'Platform-neutral packages must not use window (CHR-164). Inject platform APIs.',
    },
    {
      name: 'document',
      message:
        'Platform-neutral packages must not use document (CHR-164). Inject platform APIs.',
    },
    {
      name: 'localStorage',
      message:
        'Platform-neutral packages must not use localStorage (CHR-164). Inject storage.',
    },
  ],
};

const unusedVarsRule = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', ignoreRestSiblings: true },
  ],
};

/** Shared domain sources — everything under src/ except render / openapi / scripts / tests (CHR-164). */
const sharedDomainIgnores = [
  'packages/shared/src/**/*.test.ts',
  'packages/shared/src/render.ts',
  'packages/shared/src/html.ts',
  'packages/shared/src/markdown.ts',
  'packages/shared/src/home-html.ts',
  'packages/shared/src/resume-html.ts',
  'packages/shared/src/openapi.ts',
  'packages/shared/src/openapi-extend.ts',
  'packages/shared/src/generate-openapi.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/cdk.out/**',
      '**/node_modules/**',
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
      // Avoid parsing react-native Flow sources for cycle detection (CHR-164).
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
