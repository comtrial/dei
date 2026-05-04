import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  logger,
  registerLoggerTransport,
  type Breadcrumb,
  type LogContext,
  type LogLevel,
  type LoggerTransport,
} from '../logger';

interface CapturedException {
  error: Error;
  context?: LogContext;
}

interface CapturedMessage {
  message: string;
  level: LogLevel;
  context?: LogContext;
}

function createSpyTransport() {
  const exceptions: CapturedException[] = [];
  const messages: CapturedMessage[] = [];
  const breadcrumbs: Breadcrumb[] = [];
  const users: ({ id?: string; email?: string | null } | null)[] = [];
  const tags: { key: string; value: string }[] = [];

  const transport: LoggerTransport = {
    captureException(error, context) {
      exceptions.push({ error: error as Error, context });
    },
    captureMessage(message, level = 'info', context) {
      messages.push({ message, level, context });
    },
    setUser(user) {
      users.push(user);
    },
    setTag(key, value) {
      tags.push({ key, value });
    },
    addBreadcrumb(b) {
      breadcrumbs.push(b);
    },
  };

  return { transport, exceptions, messages, breadcrumbs, users, tags };
}

afterEach(() => {
  // Each test installs its own transport; restore the no-op so tests are isolated.
  registerLoggerTransport({
    captureException: () => {},
    captureMessage: () => {},
    setUser: () => {},
    setTag: () => {},
    addBreadcrumb: () => {},
  });
});

describe('logger', () => {
  it('routes captureException through the registered transport', () => {
    const spy = createSpyTransport();
    registerLoggerTransport(spy.transport);

    const err = new Error('boom');
    logger.captureException(err, { tags: { feature: 'x' }, extra: { id: 1 } });

    expect(spy.exceptions).toHaveLength(1);
    expect(spy.exceptions[0].error).toBe(err);
    expect(spy.exceptions[0].context).toEqual({
      tags: { feature: 'x' },
      extra: { id: 1 },
    });
  });

  it('normalizes non-Error values into Error instances', () => {
    const spy = createSpyTransport();
    registerLoggerTransport(spy.transport);

    logger.captureException('string-failure');
    logger.captureException({ code: 42, msg: 'nope' });

    expect(spy.exceptions[0].error).toBeInstanceOf(Error);
    expect(spy.exceptions[0].error.message).toBe('string-failure');
    expect(spy.exceptions[1].error.message).toContain('"code":42');
  });

  it('captureMessage defaults to info level', () => {
    const spy = createSpyTransport();
    registerLoggerTransport(spy.transport);

    logger.captureMessage('hello');
    logger.captureMessage('warn-me', 'warning');

    expect(spy.messages).toEqual([
      { message: 'hello', level: 'info', context: undefined },
      { message: 'warn-me', level: 'warning', context: undefined },
    ]);
  });

  it('forwards setUser / setTag / addBreadcrumb', () => {
    const spy = createSpyTransport();
    registerLoggerTransport(spy.transport);

    logger.setUser({ id: 'u-1' });
    logger.setUser(null);
    logger.setTag('env', 'test');
    logger.addBreadcrumb({ message: 'nav', category: 'navigation' });

    expect(spy.users).toEqual([{ id: 'u-1' }, null]);
    expect(spy.tags).toEqual([{ key: 'env', value: 'test' }]);
    expect(spy.breadcrumbs).toEqual([{ message: 'nav', category: 'navigation' }]);
  });

  describe('withErrorCapture', () => {
    it('returns the resolved value when no error is thrown', async () => {
      const spy = createSpyTransport();
      registerLoggerTransport(spy.transport);

      const result = await logger.withErrorCapture('op.ok', async () => 42);

      expect(result).toBe(42);
      expect(spy.exceptions).toHaveLength(0);
    });

    it('captures and rethrows when the wrapped fn throws', async () => {
      const spy = createSpyTransport();
      registerLoggerTransport(spy.transport);

      const err = new Error('async-boom');

      await expect(
        logger.withErrorCapture('op.fail', async () => {
          throw err;
        }),
      ).rejects.toBe(err);

      expect(spy.exceptions).toHaveLength(1);
      expect(spy.exceptions[0].error).toBe(err);
      // op tag must be auto-attached.
      expect(spy.exceptions[0].context?.tags).toEqual({ op: 'op.fail' });
    });

    it('merges caller-provided tags with the auto op tag', async () => {
      const spy = createSpyTransport();
      registerLoggerTransport(spy.transport);

      await expect(
        logger.withErrorCapture(
          'op.merge',
          async () => {
            throw new Error('x');
          },
          { tags: { screen: 'home' }, extra: { rid: 'r1' } },
        ),
      ).rejects.toThrow('x');

      expect(spy.exceptions[0].context).toEqual({
        tags: { op: 'op.merge', screen: 'home' },
        extra: { rid: 'r1' },
      });
    });
  });

  it('default transport falls back to console when nothing was registered', async () => {
    // Re-import a fresh module so we hit the real default (consoleTransport).
    vi.resetModules();
    const fresh = await import('../logger');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    fresh.logger.captureException(new Error('to-console'));
    fresh.logger.captureMessage('msg-to-console');

    expect(errorSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
