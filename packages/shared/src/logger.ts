export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface LogContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string | null } | null;
  fingerprint?: string[];
}

export interface Breadcrumb {
  message: string;
  category?: string;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

export interface LoggerTransport {
  captureException(error: unknown, context?: LogContext): void;
  captureMessage(message: string, level?: LogLevel, context?: LogContext): void;
  setUser(user: { id?: string; email?: string | null } | null): void;
  setTag(key: string, value: string): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
}

const consoleTransport: LoggerTransport = {
  captureException(error, context) {
    // eslint-disable-next-line no-console
    console.error('[logger] exception:', error, context ?? '');
  },
  captureMessage(message, level = 'info', context) {
    // eslint-disable-next-line no-console
    console.log(`[logger][${level}] ${message}`, context ?? '');
  },
  setUser() {},
  setTag() {},
  addBreadcrumb(b) {
    // eslint-disable-next-line no-console
    console.log('[logger][breadcrumb]', b);
  },
};

let transport: LoggerTransport = consoleTransport;

export function registerLoggerTransport(t: LoggerTransport): void {
  transport = t;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

export const logger = {
  captureException(error: unknown, context?: LogContext): void {
    transport.captureException(normalizeError(error), context);
  },
  captureMessage(message: string, level: LogLevel = 'info', context?: LogContext): void {
    transport.captureMessage(message, level, context);
  },
  setUser(user: { id?: string; email?: string | null } | null): void {
    transport.setUser(user);
  },
  setTag(key: string, value: string): void {
    transport.setTag(key, value);
  },
  addBreadcrumb(breadcrumb: Breadcrumb): void {
    transport.addBreadcrumb(breadcrumb);
  },

  /**
   * 비동기 작업을 감싸 예외를 자동으로 캡처한 뒤 재던진다.
   * 에러 경계(이벤트 핸들러, 라우트 액션 등) 진입부에서 사용한다.
   */
  async withErrorCapture<T>(
    name: string,
    fn: () => Promise<T>,
    context?: LogContext,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      transport.captureException(normalizeError(error), {
        ...context,
        tags: { op: name, ...(context?.tags ?? {}) },
      });
      throw error;
    }
  },
};

export type Logger = typeof logger;
