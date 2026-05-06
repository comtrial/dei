/**
 * Jest config for React Native component tests (jest-expo preset).
 *
 * Pure-logic tests live in vitest (see vitest.config.ts). Use Jest only when
 * you need the RN renderer (components, screens) or expo-module mocks.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/components/**/__tests__/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/__tests__/**/*.test.{ts,tsx}',
  ],
  // vitest owns these; don't double-run.
  testPathIgnorePatterns: ['<rootDir>/lib/', '<rootDir>/__tests__/integration/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@sentry/.*|nativewind|@rn-primitives/.*))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
