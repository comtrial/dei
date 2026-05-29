// https://docs.expo.dev/guides/using-eslint/
const path = require('node:path');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// ── 디자인 시스템 강제 규약 (D-04) ──────────────────────────────────────────
// 화면/컴포넌트 코드는 @dei/ui 토큰·컴포넌트만 사용한다. raw 스타일 금지.
const dsEnforcement = {
  files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        // inline style={{ ... }} 객체 prop 금지 — @dei/ui className 만
        selector:
          'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression',
        message:
          'inline style 금지 — @dei/ui 컴포넌트와 NativeWind className(토큰) 만 사용하세요. (DS 강제 D-04)',
      },
      {
        // raw hex 색 리터럴 금지 — 토큰(bg-accent 등)으로
        selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/]',
        message:
          'raw hex 색 금지 — @dei/ui 토큰(bg-accent, text-ink-3 등)을 사용하세요. (DS 강제 D-04)',
      },
      {
        // StyleSheet.create 금지
        selector: 'CallExpression[callee.object.name="StyleSheet"][callee.property.name="create"]',
        message:
          'StyleSheet.create 금지 — @dei/ui + NativeWind className 으로 스타일링하세요. (DS 강제 D-04)',
      },
    ],
  },
};

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
  dsEnforcement,
]);
