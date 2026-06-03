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

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaInsetsContext: React.createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
  getOrientationAsync: jest.fn(() => Promise.resolve(1)),
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  removeOrientationChangeListeners: jest.fn(),
  removeOrientationChangeListener: jest.fn(),
  OrientationLock: {
    DEFAULT: 0,
    ALL: 1,
    PORTRAIT: 2,
    PORTRAIT_UP: 3,
    PORTRAIT_DOWN: 4,
    LANDSCAPE: 5,
    LANDSCAPE_LEFT: 6,
    LANDSCAPE_RIGHT: 7,
    OTHER: 8,
    UNKNOWN: 9,
  },
  Orientation: {
    UNKNOWN: 0,
    PORTRAIT_UP: 1,
    PORTRAIT_DOWN: 2,
    LANDSCAPE_LEFT: 3,
    LANDSCAPE_RIGHT: 4,
  },
}));
