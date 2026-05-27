import { describe, expect, it } from 'vitest';

import {
  buildRegisterPushTokenArgs,
  getExpoProjectIdFromConstants,
  getPushRouteFromData,
  normalizePushPlatform,
} from '../push-notifications.helpers';

/**
 * Phase 1 정리: 1:1 채팅 conversation deeplink 파싱 케이스 제거.
 * 새 도메인(방) deeplink 케이스는 Phase 3 에서 `getPushRouteFromData` 가
 * `dei://room/...` 를 in-app 경로로 변환하는 로직과 함께 다시 추가 예정.
 */
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

  it('accepts only in-app pathname routes from notification data', () => {
    expect(getPushRouteFromData({ route: '/home' })).toBe('/home');
    expect(getPushRouteFromData({ route: '/profiles/user-1' })).toBe('/profiles/user-1');
    expect(getPushRouteFromData({ route: 'https://example.test' })).toBeNull();
    expect(getPushRouteFromData({ route: '//example.test' })).toBeNull();
    expect(getPushRouteFromData({ route: 'dei://chat/anything' })).toBeNull();
    expect(getPushRouteFromData({ route: '' })).toBeNull();
    expect(getPushRouteFromData(null)).toBeNull();
  });

  describe('Phase 3E — 새 도메인 deeplink 매핑', () => {
    it('room_matched → /room/<id>', () => {
      expect(getPushRouteFromData({ type: 'room_matched', roomId: 'r-1' })).toBe('/room/r-1');
      // roomId 없으면 홈으로
      expect(getPushRouteFromData({ type: 'room_matched' })).toBe('/home');
    });

    it('hourly_upload_reminder → /room/<id>/upload', () => {
      expect(getPushRouteFromData({ type: 'hourly_upload_reminder', roomId: 'r-2' })).toBe('/room/r-2/upload');
    });

    it('chat_mention → /room/<id>/chat', () => {
      expect(getPushRouteFromData({ type: 'chat_mention', roomId: 'r-3', messageId: 'm-1' })).toBe('/room/r-3/chat');
    });

    it('room_auto_kicked → /home', () => {
      expect(getPushRouteFromData({ type: 'room_auto_kicked', roomId: 'r-4' })).toBe('/home');
    });

    it('rematch_available → /home', () => {
      expect(getPushRouteFromData({ type: 'rematch_available' })).toBe('/home');
    });

    it('booster_offer → /booster', () => {
      expect(getPushRouteFromData({ type: 'booster_offer' })).toBe('/booster');
    });

    it('unknown type → null', () => {
      expect(getPushRouteFromData({ type: 'unknown_event' })).toBeNull();
    });

    it('explicit route overrides type mapping', () => {
      // route 가 있으면 type 무시
      expect(getPushRouteFromData({ route: '/home', type: 'room_matched', roomId: 'r-1' })).toBe('/home');
    });
  });
});
