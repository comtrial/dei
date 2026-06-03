import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { PermissionGate } from '@dei/ui';

import {
  getPermissionState,
  openSystemSettings,
  requestPermission,
  type PermissionState,
} from '@/lib/permissions';

export default function CameraPermissionScreen() {
  const router = useRouter();
  const [permState, setPermState] = useState<PermissionState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const state = await getPermissionState('camera');
      if (cancelled) return;

      if (state === 'granted') {
        router.back();
        return;
      }

      if (state === 'undetermined') {
        const result = await requestPermission('camera');
        if (cancelled) return;
        if (result === 'granted') {
          router.back();
          return;
        }
        setPermState(result);
        return;
      }

      setPermState(state);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      if (permState === null) return;

      let cancelled = false;

      async function recheck() {
        const state = await getPermissionState('camera');
        if (cancelled) return;
        if (state === 'granted') {
          router.back();
        }
      }

      void recheck();
      return () => {
        cancelled = true;
      };
    }, [permState, router]),
  );

  if (permState !== 'denied') {
    return <View className="flex-1 bg-bg" />;
  }

  return (
    <PermissionGate
      status="info"
      icon="📷"
      heading="카메라 권한이 필요해요"
      description="3초 일상 영상을 찍으려면 카메라 권한이 필요해요. 설정에서 허용해주세요."
      reasons={[
        { text: '3초 영상으로 내 하루 기록' },
        { text: '친구들 일상도 보려면 영상 1개 필요' },
        { text: '방의 모든 활동이 영상 기반' },
      ]}
      primaryLabel="설정에서 카메라 켜기"
      onPrimary={openSystemSettings}
      secondaryLabel="나중에 하기"
      onSecondary={() => router.back()}
      onClose={() => router.back()}
    />
  );
}
