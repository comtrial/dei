/**
 * RoomUploadScreen — 3초 영상 촬영 → 업로드 (그림 A "최대 3초 영상 게시").
 *
 * expo-camera 로 촬영, useHourlyUpload 로 storage + Edge 업로드.
 * 촬영 완료 → 확인 → 업로드 → 피드 화면으로 복귀.
 *
 * `record.tsx` (일반 일상 영상) 와 분리 — storage bucket / path / RPC 다름.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useHourlyUpload } from '@/hooks/useHourlyUpload';

type Stage = 'preview' | 'recording' | 'uploading' | 'done' | 'error';

export default function RoomUploadScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>('preview');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recordStartRef = useRef<number>(0);

  const { upload } = useHourlyUpload(roomId);

  const handleStartRecord = useCallback(async () => {
    if (!cameraRef.current || stage !== 'preview') return;
    setStage('recording');
    recordStartRef.current = Date.now();

    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 3 });
      if (!result?.uri) {
        setStage('error');
        setErrorMsg('촬영에 실패했어요.');
        return;
      }
      const recordedMs = Date.now() - recordStartRef.current;
      setStage('uploading');

      const uploadResult = await upload({ tempVideoUri: result.uri, recordedMs });
      if (uploadResult.ok) {
        setStage('done');
        // 잠시 후 피드 화면으로 복귀
        setTimeout(() => {
          router.back();
        }, 1200);
      } else {
        setStage('error');
        setErrorMsg(uploadResult.message);
      }
    } catch {
      setStage('error');
      setErrorMsg('알 수 없는 오류가 발생했어요.');
    }
  }, [stage, upload, router]);

  const handleStopRecord = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  if (!permission) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-sm text-muted-foreground">카메라 권한 확인 중…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center gap-4 px-6">
        <Text className="text-lg font-semibold text-foreground text-center">카메라 권한이 필요해요</Text>
        <Text className="text-sm text-muted-foreground text-center">
          3초 영상을 올리려면 카메라 접근을 허용해 주세요.
        </Text>
        <Button onPress={requestPermission}>
          <Text>권한 허용하기</Text>
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          <Text>돌아가기</Text>
        </Button>
      </SafeAreaView>
    );
  }

  if (stage === 'done') {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center gap-4">
        <Text className="text-4xl">✅</Text>
        <Text className="text-lg font-semibold text-foreground">올렸어요!</Text>
        <Text className="text-sm text-muted-foreground">피드로 돌아가는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="front"
        mode="video">
        {/* 하단 컨트롤 */}
        <View className="absolute bottom-0 left-0 right-0 pb-12 items-center gap-4">
          {stage === 'error' && errorMsg && (
            <View className="bg-destructive/80 rounded-xl px-4 py-2 mx-6">
              <Text className="text-white text-sm text-center">{errorMsg}</Text>
            </View>
          )}

          {stage === 'uploading' && (
            <View className="bg-black/60 rounded-xl px-6 py-3">
              <Text className="text-white text-sm">업로드 중…</Text>
            </View>
          )}

          {(stage === 'preview' || stage === 'error') && (
            <View className="flex-row items-center gap-6">
              <Pressable
                onPress={() => router.back()}
                className="px-4 py-2 rounded-xl bg-black/40">
                <Text className="text-white text-sm">취소</Text>
              </Pressable>

              <Pressable
                onPress={handleStartRecord}
                className="w-20 h-20 rounded-full bg-white items-center justify-center active:opacity-80 border-4 border-primary">
                <View className="w-14 h-14 rounded-full bg-primary" />
              </Pressable>

              <View className="w-[68px]" />
            </View>
          )}

          {stage === 'recording' && (
            <View className="flex-row items-center gap-6">
              <View className="w-[68px]" />

              <Pressable
                onPress={handleStopRecord}
                className="w-20 h-20 rounded-full bg-white items-center justify-center active:opacity-80 border-4 border-destructive">
                <View className="w-10 h-10 rounded-sm bg-destructive" />
              </Pressable>

              <View className="bg-black/60 rounded-xl px-3 py-1 w-[68px] items-center">
                <Text className="text-white text-xs font-mono">최대 3초</Text>
              </View>
            </View>
          )}
        </View>
      </CameraView>
    </SafeAreaView>
  );
}
