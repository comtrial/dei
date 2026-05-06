import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();
const captureExceptionMock = vi.fn();
const captureMessageMock = vi.fn();
const setUserMock = vi.fn();
const setTagMock = vi.fn();
const addBreadcrumbMock = vi.fn();

interface ScopeMock {
  setTag: ReturnType<typeof vi.fn>;
  setExtra: ReturnType<typeof vi.fn>;
  setUser: ReturnType<typeof vi.fn>;
  setFingerprint: ReturnType<typeof vi.fn>;
}

let currentScope: ScopeMock;
const withScopeMock = vi.fn((fn: (scope: ScopeMock) => void) => fn(currentScope));

vi.mock('@sentry/react-native', () => ({
  init: initMock,
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
  setUser: setUserMock,
  setTag: setTagMock,
  addBreadcrumb: addBreadcrumbMock,
  withScope: withScopeMock,
  wrap: <T>(c: T) => c,
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '9.9.9' } },
}));

beforeEach(() => {
  initMock.mockReset();
  captureExceptionMock.mockReset();
  captureMessageMock.mockReset();
  setUserMock.mockReset();
  setTagMock.mockReset();
  addBreadcrumbMock.mockReset();
  withScopeMock.mockClear();
  currentScope = {
    setTag: vi.fn(),
    setExtra: vi.fn(),
    setUser: vi.fn(),
    setFingerprint: vi.fn(),
  };
  vi.resetModules();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  delete process.env.EXPO_PUBLIC_SENTRY_ENV;
});

afterEach(async () => {
  // Restore a no-op transport on whichever logger module is currently live.
  const shared = await import('@dei/shared');
  shared.registerLoggerTransport({
    captureException: () => {},
    captureMessage: () => {},
    setUser: () => {},
    setTag: () => {},
    addBreadcrumb: () => {},
  });
});

describe('initSentry', () => {
  it('does NOT call Sentry.init when DSN is missing', async () => {
    const { initSentry } = await import('../sentry');
    initSentry();

    expect(initMock).not.toHaveBeenCalled();
  });

  it('initializes the SDK with DSN, env, release, sampling', async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    process.env.EXPO_PUBLIC_SENTRY_ENV = 'staging';

    const { initSentry } = await import('../sentry');
    initSentry();

    expect(initMock).toHaveBeenCalledTimes(1);
    const config = initMock.mock.calls[0][0];
    expect(config.dsn).toBe('https://abc@o0.ingest.sentry.io/1');
    expect(config.environment).toBe('staging');
    expect(config.release).toBe('9.9.9');
    expect(config.sendDefaultPii).toBe(false);
    expect(typeof config.tracesSampleRate).toBe('number');
  });

  it('is idempotent (second call is a no-op)', async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    const { initSentry } = await import('../sentry');

    initSentry();
    initSentry();
    initSentry();

    expect(initMock).toHaveBeenCalledTimes(1);
  });
});

describe('logger transport (after initSentry)', () => {
  // We must re-import BOTH the logger and the sentry module after
  // vi.resetModules() so they share the same module instance.
  async function bootstrap() {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://abc@o0.ingest.sentry.io/1';
    const sentryModule = await import('../sentry');
    sentryModule.initSentry();
    const sharedModule = await import('@dei/shared');
    return sharedModule.logger;
  }

  it('routes captureException through Sentry.withScope + setTag/setExtra', async () => {
    const logger = await bootstrap();

    const err = new Error('routed');
    logger.captureException(err, {
      tags: { feature: 'auth' },
      extra: { uid: 'u1' },
    });

    expect(withScopeMock).toHaveBeenCalledTimes(1);
    expect(currentScope.setTag).toHaveBeenCalledWith('feature', 'auth');
    expect(currentScope.setExtra).toHaveBeenCalledWith('uid', 'u1');
    expect(captureExceptionMock).toHaveBeenCalledWith(err);
  });

  it('captureMessage forwards level to Sentry', async () => {
    const logger = await bootstrap();

    logger.captureMessage('soft fail', 'warning');

    expect(captureMessageMock).toHaveBeenCalledWith('soft fail', 'warning');
  });

  it('setUser passes id through and clears with null', async () => {
    const logger = await bootstrap();

    logger.setUser({ id: 'u-7' });
    logger.setUser(null);

    expect(setUserMock).toHaveBeenNthCalledWith(1, { id: 'u-7', email: undefined });
    expect(setUserMock).toHaveBeenNthCalledWith(2, null);
  });

  it('addBreadcrumb forwards message + category + data', async () => {
    const logger = await bootstrap();

    logger.addBreadcrumb({ message: 'nav', category: 'navigation', data: { to: '/' } });

    expect(addBreadcrumbMock).toHaveBeenCalledWith({
      message: 'nav',
      category: 'navigation',
      level: 'info',
      data: { to: '/' },
    });
  });
});
