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

jest.mock('react-native-orientation-turbo', () => ({
  lockToLandscape: jest.fn(),
  lockToPortrait: jest.fn(),
  unlockAllOrientations: jest.fn(),
  startOrientationTracking: jest.fn(),
  stopOrientationTracking: jest.fn(),
  getCurrentOrientation: jest.fn(() => 'PORTRAIT'),
  isLocked: jest.fn(() => false),
  onLockOrientationChange: jest.fn(() => ({ remove: jest.fn() })),
  onOrientationChange: jest.fn(() => ({ remove: jest.fn() })),
  LandscapeDirection: { LEFT: 'LEFT', RIGHT: 'RIGHT' },
  PortraitDirection: { UP: 'UP', UPSIDE_DOWN: 'UPSIDE_DOWN' },
  Orientation: {
    PORTRAIT: 'PORTRAIT',
    LANDSCAPE_LEFT: 'LANDSCAPE_LEFT',
    LANDSCAPE_RIGHT: 'LANDSCAPE_RIGHT',
    FACE_UP: 'FACE_UP',
    FACE_DOWN: 'FACE_DOWN',
  },
}));
