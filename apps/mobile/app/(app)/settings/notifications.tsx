import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger, POLICY } from '@dei/shared';
import { AlertDialog, Banner, SettingsRow, Text, TopNav } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

type NotificationSettings = {
  push_enabled: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  push_enabled: true,
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
          .select('push_enabled')
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

  const updateMasterSetting = (value: boolean) => {
    setSettings({ push_enabled: value });

    void logger.withErrorCapture(
      'notifications.update-setting',
      async () => {
        if (!user) {
          return;
        }

        const { error } = await supabase
          .from('notification_setting')
          .upsert({
            chat_mention: value,
            match_alert: value,
            push_enabled: value,
            upload_reminder: value,
            user_id: user.id,
          }, { onConflict: 'user_id' });

        if (error) {
          throw error;
        }

        analytics.capture(ANALYTICS_EVENTS.notification_master_toggled, {
          value,
        });
      },
      { tags: { screen: 'settings-notifications', action: 'update' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'settings-notifications', action: 'update-catch' },
      });
      setSettings({ push_enabled: !value });
      setFailed(true);
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="알림" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="pb-[42px] pt-[18px]">
          <SettingsRow
            variant="master"
            label="알림 받기"
            value="OFF 시 매칭 결과·메시지·멘션을 받지 못해요"
            toggleValue={settings.push_enabled}
            onToggleChange={updateMasterSetting}
          />
          <Text className="px-[24px] pt-[10px] text-[13.5px] leading-[17px] text-ink-3">
            앱 안 알림 설정이에요. OS 권한이 꺼져 있으면 시스템 설정에서 켜야 해요.
          </Text>

          <View className="px-[24px] pt-[22px]">
            {!settings.push_enabled ? (
              <Banner tone="warn" icon="!" title="매칭을 시작할 수 없어요">
                알림 받기를 켜야 매칭 성사와 방 알림을 받을 수 있어요.
              </Banner>
            ) : null}
            <Banner
              tone="info"
              icon="🌙"
              title="새벽 알림 자동 차단"
              className={!settings.push_enabled ? 'mt-[12px]' : undefined}
            >
              {POLICY.notifications.quietHours.startHourKst}~{POLICY.notifications.quietHours.endHourKst}시에는 알림이 자동으로 가지 않아요. 별도 설정 불필요.
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
