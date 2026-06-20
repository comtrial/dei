import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Badge,
  BottomActionBar,
  Button,
  ChoiceList,
  Input,
  ProgressBar,
  Text,
} from '@dei/ui';

import {
  birthDateLabel,
  GENDER_OPTIONS,
  NICKNAME_MAX_LENGTH,
  normalizeNickname,
  type ProfileGender,
  validateNickname,
  type NicknameValidation,
} from '@/lib/b-flow';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { hasVerifiedIdentity } from '@/lib/auth-flow';
import {
  repairProfileIdentityFromVerification,
  VERIFIED_IDENTITY_SELECT,
} from '@/lib/identity-profile';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { mergeCachedProfileSnapshot } from '@/lib/profile-session-cache';

function birthDateLongLabel(birthDate?: string | null, birthYear?: number | null) {
  if (!birthDate) {
    return birthDateLabel(birthDate, birthYear);
  }

  const [year, month, day] = birthDate.split('-');
  if (!year || !month || !day) {
    return birthDateLabel(birthDate, birthYear);
  }

  return `${year}년 ${month}월 ${day}일`;
}

/**
 * S04 — 프로필 작성 (1/3) 기본 정보
 * ==================================================================
 * 담당자: B
 * 화면 목적: 본인인증 통과 직후 첫 진입. 멀티스텝 3단계 중 1단계 = 기본
 *           정보(닉네임·성별 선택). 생년월일은 본인인증 결과로 자동 채워지고 lock.
 * 의존 DS 컴포넌트: Text(헤딩/서브카피/카운트/검사메시지) · ProgressBar(스텝 33%
 *   진행바, S04/S04b/S04c 공유) · Input(닉네임 입력 필드) · Spinner(검사 중 상태)
 *   · ChoiceList(성별 선택) · Input(생년월일 lock 필드 — locked 변형) · Badge(🔒 본인인증 자동
 *   인라인 잠금) · Button(BottomFixedCTA '다음 (2/3)', 검사 통과 시에만 활성)  [@dei/ui]
 * 의존 데이터: 본인인증 결과 생년월일(S03 root of trust, lock) / 성별 직접 선택 /
 *   닉네임 중복
 *   조회(profiles.nickname unique, 0.5초 debounce) / 닉네임 blocklist(욕설 필터 +
 *   운영팀 수동) / 온보딩 진행 단계 저장(재진입 복원)
 * 발생 이벤트(PostHog): profile_step_completed(F24 멀티스텝 3단계 start) ·
 *   profile_photo_uploaded(F24, S04b 단계 alt)  (lib/analytics-taxonomy)
 * 서버 의존(L1): 닉네임 unique·blocklist 검사 엔드포인트(debounce 호출) /
 *   프로필 step1 저장(닉네임 + 본인인증 자동필드 commit) / 온보딩 단계 진행상태 저장
 * 정책 의존(L2): 닉네임 정책(한글·영문·숫자, 특수문자·이모지 금지, 1~10자) /
 *   닉네임 = 시스템 unique key(PRD §6 친구 초대 기반) / 닉네임 변경 30일 1회 throttle /
 *   생년월일 변경 불가(본인인증 lock) / 성별은 매칭용 프로필 값으로 직접 선택
 * 와이어프레임 참조: all-screens S04
 *
 * 현재 구현: 본인인증 lock 필드 조회, 닉네임 형식/중복 debounce 검사,
 * step1 저장과 다음 단계 라우팅을 실제 Supabase 경로로 처리한다.
 */
export default function ProfileStep1Screen() {
  const router = useRouter();
  const { user } = useAuth();
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<ProfileGender | ''>('');
  const [originalNickname, setOriginalNickname] = useState<string | null>(null);
  const [validation, setValidation] = useState<NicknameValidation>({
    state: 'idle',
    message: '한글, 영문, 숫자만 1~10자로 입력해주세요.',
  });
  const [verifiedProfile, setVerifiedProfile] = useState<{
    birthDate: string | null;
    birthYear: number | null;
  }>({ birthDate: null, birthYear: null });
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    let mounted = true;

    void logger.withErrorCapture(
      'onboarding.step1.load-profile',
      async () => {
        const [
          { data, error },
          { data: verifiedIdentity, error: verifiedIdentityError },
        ] = await Promise.all([
          supabase
            .from('profile')
            .select('birth_date, birth_year, gender, is_adult, nickname, nickname_changed_at')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('auth_verification')
            .select(VERIFIED_IDENTITY_SELECT)
            .eq('user_id', user.id)
            .eq('provider', 'portone')
            .eq('status', 'verified')
            .order('verified_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (error) {
          throw error;
        }

        if (verifiedIdentityError) {
          throw verifiedIdentityError;
        }

        if (!mounted) {
          return;
        }

        const profile = await repairProfileIdentityFromVerification({
          profile: data,
          userId: user.id,
          verification: verifiedIdentity,
        });

        if (!hasVerifiedIdentity(profile)) {
          router.replace(ROUTES.terms);
          return;
        }

        setVerifiedProfile({
          birthDate: profile.birth_date ?? null,
          birthYear: profile.birth_year,
        });
        setGender(profile.gender === 'male' || profile.gender === 'female' ? profile.gender : '');

        if (profile.nickname) {
          setNickname(profile.nickname);
          setOriginalNickname(profile.nickname);
        }
      },
      { tags: { screen: 'onboarding-step1' } },
    );

    return () => {
      mounted = false;
    };
  }, [router, user]);

  useEffect(() => {
    const base = validateNickname(nickname);
    if (base.state !== 'valid') {
      setValidation(base);
      return;
    }

    setValidation({ state: 'checking', message: '닉네임을 확인하고 있어요.' });

    const timer = setTimeout(() => {
      void logger.withErrorCapture(
        'onboarding.nickname-check',
        async () => {
          const normalized = normalizeNickname(nickname);
          let query = supabase
            .from('profile')
            .select('user_id')
            .eq('nickname_lower', normalized.toLowerCase())
            .limit(1);

          if (user) {
            query = query.neq('user_id', user.id);
          }

          const { data, error } = await query;

          if (error) {
            throw error;
          }

          if (data && data.length > 0) {
            setValidation({ state: 'invalid', message: '이미 사용 중이에요.' });
            return;
          }

          setValidation({ state: 'valid', message: '사용 가능해요.' });
        },
        { tags: { screen: 'onboarding-step1', action: 'nickname-check' } },
      ).catch(() => {
        setValidation({
          state: 'invalid',
          message: '닉네임 확인에 실패했어요. 잠시 후 다시 시도해주세요.',
        });
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [nickname, user]);

  const canContinue =
    validation.state === 'valid'
    && normalizeNickname(nickname).length > 0
    && Boolean(gender);
  const helperClassName = useMemo(() => {
    if (validation.state === 'valid') return 'text-success';
    if (validation.state === 'invalid') return 'text-danger';
    return undefined;
  }, [validation.state]);
  const helperMessage = useMemo(() => {
    if (validation.state === 'valid') return `✓ ${validation.message}`;
    if (validation.state === 'invalid') return `✗ ${validation.message}`;
    return validation.message;
  }, [validation.message, validation.state]);

  const handleNext = () => {
    if (!canContinue || isSaving) {
      return;
    }

    void logger.withErrorCapture(
      'onboarding.step1.save',
      async () => {
        setIsSaving(true);
        const normalized = normalizeNickname(nickname);
        const selectedGender = gender || null;

        if (user && selectedGender) {
          const nicknameChanged = normalized !== normalizeNickname(originalNickname ?? '');
          const nicknameChangedAt = nicknameChanged ? new Date().toISOString() : undefined;
          const { error } = await supabase
            .from('profile')
            .update({
              gender: selectedGender,
              nickname: normalized,
              ...(nicknameChangedAt ? { nickname_changed_at: nicknameChangedAt } : {}),
            })
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }

          mergeCachedProfileSnapshot(user.id, {
            birthDate: verifiedProfile.birthDate,
            birthYear: verifiedProfile.birthYear,
            gender: selectedGender,
            nickname: normalized,
            ...(nicknameChangedAt ? { nicknameChangedAt } : {}),
          });
        }

        analytics.capture(ANALYTICS_EVENTS.profile_step_completed, {
          step: 1,
        });

        router.replace(ROUTES.profileStep2);
      },
      { tags: { screen: 'onboarding-step1', action: 'save' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'onboarding-step1', action: 'save-catch' },
        });
        setSaveFailed(true);
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TouchableWithoutFeedback
        accessible={false}
        onPress={Keyboard.dismiss}
        testID="onboarding-step1-dismiss-area"
      >
        <View className="flex-1 px-[24px] pb-[118px] pt-[18px]">
          <Text variant="meta" tone="ink-3">
            기본 정보 · 1 / 3
          </Text>
          <ProgressBar value={1 / 3} className="mt-[10px]" />

          <View className="mt-[34px]">
            <Text variant="h1" className="text-[26px] leading-[34px]">
              닉네임과 성별을{'\n'}알려주세요
            </Text>
            <Text className="mt-[8px] text-[15.5px] leading-[20px] text-ink-3">
              성별은 매칭에 사용돼요
            </Text>
          </View>

          <Input
            value={nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            onChangeText={setNickname}
            label="닉네임"
            labelAccessory={`${normalizeNickname(nickname).length} / ${NICKNAME_MAX_LENGTH}`}
            placeholder="예: 하루산책"
            state={validation.state === 'invalid' ? 'error' : 'default'}
            helper={helperMessage}
            helperClassName={helperClassName}
            className="mt-[30px]"
            testID="onboarding-nickname-input"
          />

          <View className="mt-[24px]">
            <Text variant="eyebrow" tone="ink-3">
              성별 선택
            </Text>
            <ChoiceList
              tone="accent"
              className="mt-[10px]"
              value={gender}
              onChange={(value) => {
                if (value === 'male' || value === 'female') {
                  setGender(value);
                }
              }}
              options={GENDER_OPTIONS}
            />
          </View>

          <View className="mt-[28px] gap-[12px]">
            <Text variant="eyebrow" tone="ink-3">
              본인인증 정보
            </Text>
            <Input
              state="locked"
              readonly
              label="생년월일"
              labelAccessory="🔒 본인인증 자동"
              value={birthDateLongLabel(verifiedProfile.birthDate, verifiedProfile.birthYear)}
            />
            <Badge variant="required" tone="info">
              생년월일은 본인인증 기준으로만 사용돼요.
            </Badge>
          </View>
        </View>
      </TouchableWithoutFeedback>

      <BottomActionBar fixed>
        <Button
          fullWidth
          disabled={!canContinue || isSaving}
          onPress={handleNext}
          testID="onboarding-step1-next"
        >
          {isSaving ? '저장 중' : '다음 (2/3)'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={saveFailed}
        tone="warn"
        icon="!"
        title="닉네임을 저장하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[
          { label: '확인', variant: 'ink', onPress: () => setSaveFailed(false) },
        ]}
        onDismiss={() => setSaveFailed(false)}
      />
    </SafeAreaView>
  );
}
