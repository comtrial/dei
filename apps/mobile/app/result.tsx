import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useSaveProfileVideo } from '@/hooks/useSaveProfileVideo';
import { useSaveLog } from '@/hooks/useSaveLog';
import { getRecordingUri } from '@/lib/recordingStore';
import { formatDuration } from '@/lib/formatDuration';
import { ROUTES } from '@/lib/routes';
import { getTimeOfDay } from '@/lib/timeOfDay';
import { useAccountGate } from '@/providers/account-gate-provider';

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { durationMs, purpose } = useLocalSearchParams<{
    durationMs: string;
    purpose?: 'daily' | 'profile';
  }>();
  // file:// URI는 URL 파라미터 인코딩 손상 방지를 위해 모듈 변수로 전달
  const uri = useRef(getRecordingUri() ?? '').current;
  const [muted, setMuted] = useState(true);
  const { saveLog, loading } = useSaveLog();
  const { saveProfileVideo, loading: profileVideoLoading } = useSaveProfileVideo();
  const { eligibility, refresh } = useAccountGate();

  const recordedMs = Number(durationMs ?? 2000);
  const isProfileVideoFlow =
    purpose === 'profile' || eligibility?.next_step === 'first_video';
  const isSaving = loading || profileVideoLoading;
  const timeLabel = getTimeOfDay(new Date().getHours());

  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = true;
    p.muted = true;
    // AVCaptureSession 해제 완료 후 재생 (카메라 → 재생 전환 시 블랙 방지)
    setTimeout(() => p.play(), 300);
  });

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const handleCancel = async () => {
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
    router.back();
  };

  const handleRedo = async () => {
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
    router.replace('/(app)/record');
  };

  const handleSave = async () => {
    if (isProfileVideoFlow) {
      const result = await saveProfileVideo({ tempVideoUri: uri || undefined, recordedMs });
      if (result.success) {
        await refresh();
        router.replace(ROUTES.videoReview as never);
      } else {
        Alert.alert('저장 실패', result.message || '저장에 실패했어요. 다시 시도해주세요.');
      }
      return;
    }

    // 시뮬레이터: 데일리 로그 uri가 없으면 저장 없이 홈으로 이동
    if (!uri) {
      router.replace(ROUTES.home as never);
      return;
    }

    const result = await saveLog({ tempVideoUri: uri, recordedMs });
    if (result.success) {
      router.replace(ROUTES.home as never);
    } else {
      Alert.alert('저장 실패', result.message || '저장에 실패했어요. 다시 시도해주세요.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#1A1008' }}>
      {/* 1. 영상 — 풀스크린 베이스 */}
      {uri ? (
        <VideoView
          key={uri}
          player={player}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}

      {/* 2. 상단 바 */}
      <View style={[styles.topBar, {
        paddingTop: insets.top + 12,
        paddingLeft: insets.left + 16,
        paddingRight: insets.right + 16,
      }]}>
        <TouchableOpacity onPress={handleCancel} hitSlop={12}>
          <Text style={styles.cancelText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleMuteToggle} hitSlop={12}>
          <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* 3. LOOP 인디케이터 */}
      <View style={[styles.loopBadge, { top: insets.top + 60, left: insets.left + 14 }]}>
        <View style={styles.loopDot} />
        <Text style={styles.loopText}>LOOP</Text>
      </View>

      {/* 4. 시간대 배지 */}
      <View style={[styles.hourBadge, { bottom: insets.bottom + 100 }]}>
        <Text style={styles.hourText}>{timeLabel}</Text>
        <Text style={styles.durationText}>{formatDuration(recordedMs)}</Text>
      </View>

      {/* 5. 하단 버튼 */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={[styles.bottomGradient, {
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 14,
          paddingRight: insets.right + 14,
        }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={handleRedo}
            disabled={isSaving}>
            <Text style={styles.btnSecondaryText}>다시 촬영</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, isSaving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving}>
            <Text style={styles.btnPrimaryText}>{isSaving ? '저장 중...' : '저장'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: 'monospace' },
  muteIcon: { fontSize: 18 },

  loopBadge: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  loopDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C0432A' },
  loopText: { color: '#fff', fontSize: 9, fontFamily: 'monospace' },

  hourBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 2,
  },
  hourText: { color: '#fff', fontSize: 20, fontFamily: 'monospace', letterSpacing: 2, fontWeight: '500' },
  durationText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace' },

  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  btnSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  btnPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#C0432A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
