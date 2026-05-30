import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger, POLICY } from '@dei/shared';
import { AlertDialog, Banner, SettingsRow, TopNav } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { openSystemSettings } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

type NotificationSettings = {
  chat_mention: boolean;
  match_alert: boolean;
  push_enabled: boolean;
  upload_reminder: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  chat_mention: true,
  match_alert: true,
  push_enabled: true,
  upload_reminder: true,
};

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.notification_settings_opened);

    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'notifications.load-settings',
      async () => {
        const { data, error } = await supabase
          .from('notification_setting')
          .select('chat_mention, match_alert, push_enabled, upload_reminder')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data) {
          setSettings(data);
        }
      },
      { tags: { screen: 'settings-notifications', action: 'load' } },
    );
  }, [user]);

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));

    void logger.withErrorCapture(
      'notifications.update-setting',
      async () => {
        if (!user) {
          return;
        }

        const next = { ...settings, [key]: value };
        const { error } = await supabase
          .from('notification_setting')
          .upsert({ ...next, user_id: user.id }, { onConflict: 'user_id' });

        if (error) {
          throw error;
        }

        analytics.capture(ANALYTICS_EVENTS.notification_master_toggled, {
          key,
          value,
        });
      },
      { tags: { screen: 'settings-notifications', action: 'update' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'settings-notifications', action: 'update-catch' },
      });
      setSettings((current) => ({ ...current, [key]: !value }));
      setFailed(true);
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="알림 설정" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="pb-[42px] pt-[18px]">
          <SettingsRow
            variant="master"
            label="푸시 알림"
            value="앱 밖에서도 매칭과 방 소식을 받을게요."
            toggleValue={settings.push_enabled}
            onToggleChange={(value) => updateSetting('push_enabled', value)}
          />
          <SettingsRow
            variant="master"
            label="매칭 완료"
            value="새 방이 열리면 알려드려요."
            toggleValue={settings.match_alert}
            onToggleChange={(value) => updateSetting('match_alert', value)}
          />
          <SettingsRow
            variant="master"
            label="영상 리마인드"
            value="오늘의 3초를 놓치지 않게 알려드려요."
            toggleValue={settings.upload_reminder}
            onToggleChange={(value) => updateSetting('upload_reminder', value)}
          />
          <SettingsRow
            variant="master"
            label="멘션"
            value="방에서 나를 부르면 알려드려요."
            toggleValue={settings.chat_mention}
            onToggleChange={(value) => updateSetting('chat_mention', value)}
          />

          <View className="px-[24px] pt-[22px]">
            <Banner
              tone="info"
              icon="i"
              title="조용한 시간"
              cta="OS 설정"
              onCtaPress={() => {
                void openSystemSettings();
              }}
            >
              {POLICY.notifications.quietHours.startHourKst}시부터 {POLICY.notifications.quietHours.endHourKst}시까지 정기 알림은 보내지 않아요.
            </Banner>
          </View>
        </View>
      </ScrollView>

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="알림 설정을 저장하지 못했어요"
        description="잠시 후 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </SafeAreaView>
  );
}
