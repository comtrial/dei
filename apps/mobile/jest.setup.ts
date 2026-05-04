import '@testing-library/jest-native/extend-expect';

// Sentry: never let component tests touch the real SDK.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: (fn: (s: unknown) => void) =>
    fn({ setTag: jest.fn(), setExtra: jest.fn(), setUser: jest.fn(), setFingerprint: jest.fn() }),
  wrap: <T,>(c: T) => c,
}));

// AsyncStorage stub.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
