import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

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
      ],
    },
  ],
};

const unusedVarsRule = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', ignoreRestSiblings: true },
  ],
};

/** Shared domain entry modules (not render / openapi / scripts). */
const sharedDomainFiles = [
  'packages/shared/src/index.ts',
  'packages/shared/src/constants.ts',
  'packages/shared/src/site-config.ts',
  'packages/shared/src/schemas.ts',
  'packages/shared/src/home-default.ts',
  'packages/shared/src/resume-default.ts',
  'packages/shared/src/slugify.ts',
  'packages/shared/src/post-date.ts',
  'packages/shared/src/excerpt.ts',
  'packages/shared/src/post-date.test.ts',
  // Ephemeral files from `npm run check:platform-neutral-lint`
  'packages/shared/src/*platform-neutral-lint-fixture*.ts',
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
      ...sharedDomainFiles,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.es2022,
    },
    rules: {
      ...platformNeutralRestrictedImports,
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
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...noCrossWorkspaceRelativeImports,
      ...unusedVarsRule,
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
    },
  },
);
