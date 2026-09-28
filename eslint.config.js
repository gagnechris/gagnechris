import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/** Ban relative imports that leave a workspace into another (CHR-138). */
const noCrossWorkspaceRelativeImports = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
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
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/cdk.out/**',
      '**/node_modules/**',
      'apps/web/src/api/schema.d.ts',
      'packages/shared/openapi/openapi.json',
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
    rules: {
      ...noCrossWorkspaceRelativeImports,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...noCrossWorkspaceRelativeImports,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);
