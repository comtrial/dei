export interface AnalyticsTransport {
  capture(event: string, props?: Record<string, unknown>): void;
  identify(distinctId: string, props?: Record<string, unknown>): void;
  screen(name: string, props?: Record<string, unknown>): void;
  setPersonProperties(props: Record<string, unknown>): void;
  // super properties: 한 번 등록하면 이후 모든 capture 이벤트에 자동 첨부된다.
  register(props: Record<string, unknown>): void;
  reset(): void;
}

const consoleAnalyticsTransport: AnalyticsTransport = {
  capture(event, props) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] capture ${event}`, props ?? '');
  },
  identify(distinctId, props) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] identify ${distinctId}`, props ?? '');
  },
  screen(name, props) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] screen ${name}`, props ?? '');
  },
  setPersonProperties(props) {
    // eslint-disable-next-line no-console
    console.log('[analytics] setPersonProperties', props);
  },
  register(props) {
    // eslint-disable-next-line no-console
    console.log('[analytics] register', props);
  },
  reset() {
    // eslint-disable-next-line no-console
    console.log('[analytics] reset');
  },
};

let transport: AnalyticsTransport = consoleAnalyticsTransport;

export function registerAnalyticsTransport(t: AnalyticsTransport): void {
  transport = t;
}

export const analytics = {
  capture(event: string, props?: Record<string, unknown>): void {
    transport.capture(event, props);
  },
  identify(distinctId: string, props?: Record<string, unknown>): void {
    transport.identify(distinctId, props);
  },
  screen(name: string, props?: Record<string, unknown>): void {
    transport.screen(name, props);
  },
  setPersonProperties(props: Record<string, unknown>): void {
    transport.setPersonProperties(props);
  },
  register(props: Record<string, unknown>): void {
    transport.register(props);
  },
  reset(): void {
    transport.reset();
  },
};

export type Analytics = typeof analytics;
