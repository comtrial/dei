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
/** 등록된 PostHog 클라이언트(피처 플래그 조회용). 미초기화 시 null. */
let client: PostHog | null = null;

/**
 * PostHog 피처 플래그 값을 읽는다(원격 제어 — 앱 재배포 없이 분기). 클라이언트가
 * 없거나(키 미설정) 아직 플래그를 못 받았으면 undefined. 호출부는 fallback 을 둔다.
 */
export function getFeatureFlag(key: string): boolean | string | undefined {
  return client?.getFeatureFlag(key) as boolean | string | undefined;
}

/**
 * 플래그 로드/갱신 시 콜백(반응형 구독). PostHog SDK 는 플래그를 **비동기**로
 * 받으므로 첫 렌더 시점엔 getFeatureFlag 가 undefined 일 수 있다. 이 구독으로
 * 플래그가 도착/변경되면 UI 가 재평가하도록 한다. 해제 함수를 반환.
 * 클라이언트 미초기화 시 no-op.
 */
export function onFeatureFlags(cb: () => void): () => void {
  if (!client) return () => {};
  // SDK 의 onFeatureFlags 는 flags 인자를 주지만 여기선 트리거만 필요.
  return client.onFeatureFlags(() => cb());
}

/** 플래그를 강제 재요청(예: identify 직후 — 로그인 유저 기준 재평가). */
export function reloadFeatureFlags(): void {
  client?.reloadFeatureFlags();
}

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
      console.warn(
        '[posthog] EXPO_PUBLIC_POSTHOG_KEY 가 설정되지 않아 원격 전송이 비활성화됩니다. 콘솔 transport 로 동작합니다.',
      );
    }
    initialized = true;
    return;
  }

  const posthog = new PostHog(apiKey, { host });
  client = posthog;

  const transport: AnalyticsTransport = {
    capture(event, props) {
      posthog.capture(event, toEventProps(props));
    },
    identify(distinctId, props) {
      posthog.identify(distinctId, toEventProps(props));
      // 로그인(특정 user) 으로 distinct_id 가 바뀌었으니 플래그를 재평가한다
      // — distinct_id 타겟팅(overlay 등)이 익명→유저 전환 후에도 반영되게.
      posthog.reloadFeatureFlags();
    },
    screen(name, props) {
      posthog.screen(name, toEventProps(props));
    },
    setPersonProperties(props) {
      posthog.setPersonProperties(toEventProps(props));
    },
    register(props) {
      // super properties: 이후 모든 capture 이벤트에 자동 첨부 (PostHog 표준 API).
      void posthog.register(toEventProps(props) ?? {});
    },
    reset() {
      posthog.reset();
    },
  };

  registerAnalyticsTransport(transport);
  initialized = true;
}
