import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analytics, logger } from '@dei/shared';

import { Text } from '@/components/ui/text';
import { useSaveLog } from '@/hooks/useSaveLog';
import { getRecordingUri, setOverwriteAcknowledged } from '@/lib/recordingStore';
import { formatDuration } from '@/lib/formatDuration';
import { ROUTES } from '@/lib/routes';

import { useAccountGate } from '@/providers/account-gate-provider';

const COMMENT_MAX_LENGTH = 50;

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { durationMs } = useLocalSearchParams<{
    durationMs: string;
  }>();
  // file:// URI는 URL 파라미터 인코딩 손상 방지를 위해 모듈 변수로 전달
  const uri = useRef(getRecordingUri() ?? '').current;
  const [muted, setMuted] = useState(true);
  const [comment, setComment] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { saveLog, loading } = useSaveLog();
  const { eligibility, refresh } = useAccountGate();

  const recordedMs = Number(durationMs ?? 2000);
  const isSaving = loading;
  const timeLabel = `${String(new Date().getHours()).padStart(2, '0')}:00`;

  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = true;
    p.muted = true;
    // AVCaptureSession 해제 완료 후 재생 (카메라 → 재생 전환 시 블랙 방지)
    setTimeout(() => p.play(), 300);
  });

  // 코멘트 입력 중 키보드가 영상 위 hourBadge / 하단 버튼을 가리지 않도록 두 영역을
  // 키보드 높이만큼 같이 들어올린다. iOS 는 will* 이벤트로 애니메이션과 동기, Android 는
  // did* 만 신뢰 가능 (will* 이 일관되게 발화 안 됨).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const cleanupTempFile = async (action: 'cancel' | 'redo') => {
    if (!uri) return;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'result', action: `${action}-cleanup` },
        extra: { uri },
      });
    }
  };

  const handleCancel = async () => {
    Keyboard.dismiss();
    await cleanupTempFile('cancel');
    router.back();
  };

  const handleRedo = async () => {
    Keyboard.dismiss();
    await cleanupTempFile('redo');
    // 직전에 사용자가 record 에서 overwrite dialog 를 confirm 한 상태이므로, back 후
    // record 가 다시 focus 될 때 같은 dialog 를 한 번 더 띄우지 않도록 ack 를 set 한다.
    // (record.useFocusEffect 가 consumeOverwriteAcknowledged 로 1회 적용 후 자동 초기화)
    setOverwriteAcknowledged();
    // result.tsx 는 record 에서 push 로 진입했으므로 back 하면 record 로 복귀.
    // router.replace('/(app)/record') 는 Tabs 내부 라우트를 stack 으로 다시 쌓아
    // CameraView 가 중복 마운트되며 AVCaptureSession 충돌 → native crash 유발.
    router.back();
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!uri) {
      Alert.alert('저장 실패', '촬영 파일이 없어 저장할 수 없어요. 다시 촬영해 주세요.');
      return;
    }

    // 온보딩 첫 영상도 일반 영상과 동일하게 logs 로 저장한다 (검수·큐레이션 파이프라인 공유).
    const wasOnboarding = eligibility?.next_step !== 'complete';

    const result = await saveLog({ tempVideoUri: uri, recordedMs, comment });
    if (!result.success) {
      Alert.alert('저장 실패', result.message || '저장에 실패했어요. 다시 시도해주세요.');
      return;
    }

    // 촬영 결과 저장 성공.
    analytics.capture('log_recorded', {
      ...(result.logId ? { log_id: result.logId } : {}),
      duration_sec: Math.round(recordedMs / 1000),
      is_first_log: wasOnboarding,
      entry_point: wasOnboarding ? 'onboarding' : 'record',
    });

    // 첫 로그 업로드로 서버에서 온보딩이 완료되므로, 게이트가 홈을 허용하도록 eligibility 를 갱신한다.
    if (wasOnboarding) {
      try {
        await refresh();
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'result', action: 'refresh-after-first-log' },
        });
      }
    }

    router.replace(ROUTES.home as never);
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

      {/* 영상 영역 탭 → 키보드 닫기 (TextInput / 상단 바 / 버튼 영역은 제외) */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={Keyboard.dismiss}
        // accessible=false 로 두면 스크린리더가 큰 투명 영역을 빈 버튼으로 잘못 읽지 않음
        accessible={false}
      />

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

      {/* 4. 시간대 + 코멘트 입력 — 키보드 열림 시 같이 위로 이동 */}
      <View
        style={[
          styles.hourBadge,
          { bottom: insets.bottom + 100 + keyboardHeight },
        ]}
        // 자식 TextInput 외 영역 (시간 텍스트 등) 은 통과시켜 영상 Pressable 이 받게 함
        pointerEvents="box-none"
      >
        <Text style={styles.hourText}>{timeLabel}</Text>
        <Text style={styles.durationText}>{formatDuration(recordedMs)}</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="코멘트 추가"
          placeholderTextColor="rgba(255,255,255,0.55)"
          maxLength={COMMENT_MAX_LENGTH}
          multiline={false}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
          style={styles.commentInput}
          testID="result-comment-input"
          editable={!isSaving}
        />
      </View>

      {/* 5. 하단 버튼 — 키보드 열림 시 같이 위로 이동 */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={[styles.bottomGradient, {
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 14,
          paddingRight: insets.right + 14,
          bottom: keyboardHeight,
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
  commentInput: {
    marginTop: 6,
    minWidth: 140,
    maxWidth: 260,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },

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
