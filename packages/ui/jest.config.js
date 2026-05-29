/**
 * Jest config for @dei/ui React Native component tests (jest-expo preset).
 *
 * 순수 로직/토큰 테스트는 vitest(`*.test.ts`, node env) 가 소유한다.
 * RN 렌더러가 필요한 컴포넌트 테스트(`*.test.tsx`)만 Jest 가 담당한다.
 * 두 영역은 확장자로 분리되어 충돌하지 않는다.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // 컴포넌트(.test.tsx)만 — 로직(.test.ts)은 vitest 소유.
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-native-css-interop|nativewind|@rn-primitives/.*))',
  ],
};
