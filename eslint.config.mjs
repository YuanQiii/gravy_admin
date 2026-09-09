// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn'
    },
  },
  // D7 依赖方向守护（ADR 0010）：app 之间禁止交叉 import，packages 禁止
  // import 任何应用层代码；全仓禁止 @gvray/*/src 深路径 import（D2 barrel 约束）。
  {
    files: ['apps/admin/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/apps/mall/**'],
            message: 'Admin must not import from apps/mall. Move shared logic to @gvray/core or @gvray/domain.',
          },
          {
            group: ['@gvray/core/src/**', '@gvray/domain/src/**'],
            message: 'Use the public barrel exports of @gvray/core / @gvray/domain; deep src imports are forbidden.',
          },
        ],
      }],
    },
  },
  {
    files: ['apps/mall/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/apps/admin/**'],
            message: 'Mall must not import from apps/admin. Move shared logic to @gvray/core or @gvray/domain.',
          },
          {
            group: ['@gvray/core/src/**', '@gvray/domain/src/**'],
            message: 'Use the public barrel exports of @gvray/core / @gvray/domain; deep src imports are forbidden.',
          },
        ],
      }],
    },
  },
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/apps/**'],
            message: 'packages must not import any app-layer code (apps/*).',
          },
          {
            group: ['@gvray/core/src/**', '@gvray/domain/src/**'],
            message: 'Use the public barrel exports of @gvray/core / @gvray/domain; deep src imports are forbidden.',
          },
        ],
      }],
    },
  },
);