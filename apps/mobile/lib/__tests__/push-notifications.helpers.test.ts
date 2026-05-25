import { describe, expect, it } from 'vitest';

import {
  buildRegisterPushTokenArgs,
  getExpoProjectIdFromConstants,
  getPushRouteFromData,
  normalizePushPlatform,
} from '../push-notifications.helpers';

describe('push notification helpers', () => {
  it('resolves Expo project id from EAS or app config', () => {
    expect(getExpoProjectIdFromConstants({
      easConfig: { projectId: ' eas-project ' },
    })).toBe('eas-project');

    expect(getExpoProjectIdFromConstants({
      expoConfig: { extra: { eas: { projectId: 'extra-project' } } },
    })).toBe('extra-project');

    expect(getExpoProjectIdFromConstants({})).toBeNull();
  });

  it('normalizes only platforms supported by the database enum', () => {
    expect(normalizePushPlatform('ios')).toBe('ios');
    expect(normalizePushPlatform('android')).toBe('android');
    expect(normalizePushPlatform('web')).toBe('web');
    expect(normalizePushPlatform('windows')).toBeNull();
  });

  it('builds register_user_push_token RPC args without empty optional fields', () => {
    expect(buildRegisterPushTokenArgs({
      appVersion: ' 1.0.0 ',
      deviceLabel: ' ',
      installationIdHash: ' install-1234567890 ',
      platform: 'ios',
      pushProvider: 'expo',
      pushToken: ' ExponentPushToken[token] ',
    })).toEqual({
      p_app_version: '1.0.0',
      p_device_label: undefined,
      p_installation_id_hash: 'install-1234567890',
      p_platform: 'ios',
      p_push_provider: 'expo',
      p_push_token: 'ExponentPushToken[token]',
    });
  });

  it('accepts only app routes from notification data', () => {
    expect(getPushRouteFromData({ route: '/home' })).toBe('/home');
    expect(getPushRouteFromData({ route: 'https://example.test' })).toBeNull();
    expect(getPushRouteFromData({ route: '' })).toBeNull();
    expect(getPushRouteFromData(null)).toBeNull();
  });
});
