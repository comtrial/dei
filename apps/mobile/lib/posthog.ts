import PostHog from 'posthog-react-native';
import { registerAnalyticsTransport, type AnalyticsTransport } from '@dei/shared';

const DEFAULT_HOST = 'https://us.i.posthog.com';

/**
 * PostHog SDK 가 받는 이벤트 속성 타입(`PostHogEventProperties` = JSON 값 맵).
 * 그 이름이 패키지 엔트리에서 re-export 되지 않으므로 `capture` 의 두 번째
 * 인자 타입에서 그대로 끌어와 참조한다.
 */
type EventProps = NonNullable<Parameters<PostHog['capture']>[1]>;

/**
 * transport 계약은 호출부 통일을 위해 `Record<string, unknown>` 을 쓴다.
 * PostHog SDK 는 더 엄격한 JSON 값 맵을 요구하므로 SDK 경계에서만 좁혀
 * 캐스팅한다 (전송 시 어차피 JSON 직렬화되므로 안전).
 */
function toEventProps(props?: Record<string, unknown>): EventProps | undefined {
  return props as EventProps | undefined;
}

let initialized = false;

/**
 * PostHog SDK를 초기화하고 @dei/shared 의 analytics transport 로 등록한다.
 * 앱 진입점에서 React 컴포넌트 트리 마운트 전에 호출되어야 한다.
 *
 * PostHogProvider(React) 가 일반적이지만, transport 패턴을 위해 비-React
 * `PostHog` 클라이언트 인스턴스를 직접 생성해 등록한다.
 */
export function initPostHog(): void {
  if (initialized) return;

  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? DEFAULT_HOST;

  if (!apiKey) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[posthog] EXPO_PUBLIC_POSTHOG_KEY 가 설정되지 않아 원격 전송이 비활성화됩니다. 콘솔 transport 로 동작합니다.',
      );
    }
    initialized = true;
    return;
  }

  const posthog = new PostHog(apiKey, { host });

  const transport: AnalyticsTransport = {
    capture(event, props) {
      posthog.capture(event, toEventProps(props));
    },
    identify(distinctId, props) {
      posthog.identify(distinctId, toEventProps(props));
    },
    screen(name, props) {
      posthog.screen(name, toEventProps(props));
    },
    setPersonProperties(props) {
      posthog.setPersonProperties(toEventProps(props));
    },
    reset() {
      posthog.reset();
    },
  };

  registerAnalyticsTransport(transport);
  initialized = true;
}
