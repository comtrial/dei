import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { registerLoggerTransport, type LoggerTransport } from '@dei/shared';

let initialized = false;

/**
 * Sentry SDK를 초기화하고 @dei/shared 의 logger transport 로 등록한다.
 * 앱 진입점에서 React 컴포넌트 트리 마운트 전에 호출되어야 한다.
 */
export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[sentry] EXPO_PUBLIC_SENTRY_DSN 가 설정되지 않아 원격 전송이 비활성화됩니다. 콘솔 transport 로 동작합니다.',
      );
    }
    initialized = true;
    return;
  }

  Sentry.init({
    dsn,
    debug: __DEV__,
    environment:
      (process.env.EXPO_PUBLIC_SENTRY_ENV as string | undefined) ??
      (__DEV__ ? 'development' : 'production'),
    release: Constants.expoConfig?.version ?? undefined,
    enableAutoSessionTracking: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // PII 는 명시적으로 사용자 컨텍스트를 등록할 때만 수집한다.
    sendDefaultPii: false,
  });

  const transport: LoggerTransport = {
    captureException(error, context) {
      Sentry.withScope((scope) => {
        applyContext(scope, context);
        Sentry.captureException(error);
      });
    },
    captureMessage(message, level = 'info', context) {
      Sentry.withScope((scope) => {
        applyContext(scope, context);
        Sentry.captureMessage(message, mapLevel(level));
      });
    },
    setUser(user) {
      Sentry.setUser(user ? { id: user.id, email: user.email ?? undefined } : null);
    },
    setTag(key, value) {
      Sentry.setTag(key, value);
    },
    addBreadcrumb(b) {
      Sentry.addBreadcrumb({
        message: b.message,
        category: b.category,
        level: mapLevel(b.level ?? 'info'),
        data: b.data,
      });
    },
  };

  registerLoggerTransport(transport);
  initialized = true;
}

function applyContext(
  scope: Sentry.Scope,
  context: Parameters<LoggerTransport['captureException']>[1],
): void {
  if (!context) return;
  if (context.tags) {
    for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
  }
  if (context.extra) {
    for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
  }
  if (context.user) {
    scope.setUser({ id: context.user.id, email: context.user.email ?? undefined });
  }
  if (context.fingerprint) scope.setFingerprint(context.fingerprint);
}

function mapLevel(
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal',
): Sentry.SeverityLevel {
  return level;
}

export { Sentry };
