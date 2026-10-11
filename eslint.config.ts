import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '*.tsbuildinfo'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      // Deferred to `unused-imports`, which can autofix and understands the
      // leading-underscore convention for deliberately ignored arguments.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // The renderer is the only half with React in it. `configs.flat.recommended`
  // rather than `configs.recommended` — the latter is still eslintrc-shaped and
  // ESLint 10 rejects its array-valued `plugins` key.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },

  // `console` is the main process's logging sink, by design — see
  // main/logger/logger.service.ts.
  {
    files: ['src/main/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // Install-time scripts: plain Node ESM run from `postinstall`, never
  // bundled and never type-checked with the rest. They are the only files
  // here that need Node's globals spelled out, so they are spelled out rather
  // than pulling in the `globals` package for two names.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },

  prettier
);
