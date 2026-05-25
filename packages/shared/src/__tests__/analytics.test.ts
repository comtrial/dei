import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analytics,
  registerAnalyticsTransport,
  type AnalyticsTransport,
} from '../analytics';

interface CapturedEvent {
  event: string;
  props?: Record<string, unknown>;
}

interface CapturedIdentify {
  distinctId: string;
  props?: Record<string, unknown>;
}

interface CapturedScreen {
  name: string;
  props?: Record<string, unknown>;
}

function createSpyTransport() {
  const events: CapturedEvent[] = [];
  const identifies: CapturedIdentify[] = [];
  const screens: CapturedScreen[] = [];
  const personProps: Record<string, unknown>[] = [];
  const registers: Record<string, unknown>[] = [];
  let resets = 0;

  const transport: AnalyticsTransport = {
    capture(event, props) {
      events.push({ event, props });
    },
    identify(distinctId, props) {
      identifies.push({ distinctId, props });
    },
    screen(name, props) {
      screens.push({ name, props });
    },
    setPersonProperties(props) {
      personProps.push(props);
    },
    register(props) {
      registers.push(props);
    },
    reset() {
      resets += 1;
    },
  };

  return {
    transport,
    events,
    identifies,
    screens,
    personProps,
    registers,
    getResets: () => resets,
  };
}

afterEach(() => {
  // Each test installs its own transport; restore the no-op so tests are isolated.
  registerAnalyticsTransport({
    capture: () => {},
    identify: () => {},
    screen: () => {},
    setPersonProperties: () => {},
    register: () => {},
    reset: () => {},
  });
});

describe('analytics', () => {
  it('routes capture through the registered transport', () => {
    const spy = createSpyTransport();
    registerAnalyticsTransport(spy.transport);

    analytics.capture('signup_started', { source: 'home' });
    analytics.capture('no_props_event');

    expect(spy.events).toEqual([
      { event: 'signup_started', props: { source: 'home' } },
      { event: 'no_props_event', props: undefined },
    ]);
  });

  it('routes identify through the registered transport', () => {
    const spy = createSpyTransport();
    registerAnalyticsTransport(spy.transport);

    analytics.identify('user-1', { plan: 'free' });

    expect(spy.identifies).toEqual([{ distinctId: 'user-1', props: { plan: 'free' } }]);
  });

  it('routes screen through the registered transport', () => {
    const spy = createSpyTransport();
    registerAnalyticsTransport(spy.transport);

    analytics.screen('ChatRoom', { matchId: 'm-1' });

    expect(spy.screens).toEqual([{ name: 'ChatRoom', props: { matchId: 'm-1' } }]);
  });

  it('routes setPersonProperties through the registered transport', () => {
    const spy = createSpyTransport();
    registerAnalyticsTransport(spy.transport);

    analytics.setPersonProperties({ verified: true });

    expect(spy.personProps).toEqual([{ verified: true }]);
  });

  it('routes register (super properties) through the registered transport', () => {
    const spy = createSpyTransport();
    registerAnalyticsTransport(spy.transport);

    analytics.register({ home_top_layout: 'B', curation_layout: 'single' });

    expect(spy.registers).toEqual([{ home_top_layout: 'B', curation_layout: 'single' }]);
  });

  it('routes reset through the registered transport', () => {
    const spy = createSpyTransport();
    registerAnalyticsTransport(spy.transport);

    analytics.reset();
    analytics.reset();

    expect(spy.getResets()).toBe(2);
  });

  it('default transport falls back to console when nothing was registered', async () => {
    // Re-import a fresh module so we hit the real default (consoleAnalyticsTransport).
    vi.resetModules();
    const fresh = await import('../analytics');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => {
      fresh.analytics.capture('to-console', { a: 1 });
      fresh.analytics.identify('id-to-console');
      fresh.analytics.screen('screen-to-console');
      fresh.analytics.setPersonProperties({ k: 'v' });
      fresh.analytics.register({ home_top_layout: 'A' });
      fresh.analytics.reset();
    }).not.toThrow();

    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
