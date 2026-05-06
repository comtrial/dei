// https://docs.expo.dev/guides/using-eslint/
const path = require('node:path');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
          paths: [path.resolve(__dirname, '../../node_modules')],
        },
      },
    },
  },
  {
    files: ['components/ui/dialog.tsx'],
    rules: {
      'import/namespace': 'off',
    },
  },
]);
