import { POLICY, REPORT_CATEGORIES } from '@dei/shared';

export const NICKNAME_MAX_LENGTH = 10;
export const PROFILE_BIO_MAX_LENGTH = 60;
export const SUPPORT_MESSAGE_MAX_LENGTH = 500;
export const TERMS_VERSION = '2026-05-30';
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MBTI_OPTIONS = [
  'ISTJ',
  'ISFJ',
  'INFJ',
  'INTJ',
  'ISTP',
  'ISFP',
  'INFP',
  'INTP',
  'ESTP',
  'ESFP',
  'ENFP',
  'ENTP',
  'ESTJ',
  'ESFJ',
  'ENFJ',
  'ENTJ',
] as const;

export const REGION_OPTIONS = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '광주',
  '대전',
  '울산',
  '세종',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;

export const GENDER_OPTIONS = [
  { label: '여성', value: 'female' },
  { label: '남성', value: 'male' },
] as const;

export type ProfileGender = (typeof GENDER_OPTIONS)[number]['value'];

export const LEAVE_REASONS = [
  { label: '분위기가 맞지 않아요', value: 'mood' },
  { label: '실수로 들어왔어요', value: 'mistake' },
  { label: '불쾌한 멤버가 있어요', value: 'bad_member' },
  { label: '기타', value: 'other' },
] as const;

export const WITHDRAW_REASONS = [
  { label: '자주 보이는 상대가 부담돼요', value: 'repeat_matches' },
  { label: '매칭이 잘 안 돼요', value: 'low_match' },
  { label: '다른 앱을 써요', value: 'another_app' },
  { label: '잠시 쉬고 싶어요', value: 'break' },
  { label: '기타', value: 'other' },
] as const;

export const SUPPORT_CATEGORIES = [
  '결제·환불',
  '매칭',
  '차단·신고',
  '기타',
] as const;

const PAYMENT_PRICE_LABELS = {
  pack1: process.env.EXPO_PUBLIC_INSTANT_REMATCH_PRICE_1_LABEL ?? '스토어 가격',
  pack3: process.env.EXPO_PUBLIC_INSTANT_REMATCH_PRICE_3_LABEL ?? '스토어 가격',
  pack10: process.env.EXPO_PUBLIC_INSTANT_REMATCH_PRICE_10_LABEL ?? '스토어 가격',
} as const;

export const PAYMENT_PACKS = [
  {
    badge: null,
    id: POLICY.payment.instantRematchProductId,
    label: '1회',
    price: PAYMENT_PRICE_LABELS.pack1,
    sub: '한 번의 바로 매치',
    unit: null,
  },
  {
    badge: '12% 할인',
    id: `${POLICY.payment.instantRematchProductId}_pack3`,
    label: '3회 팩',
    price: PAYMENT_PRICE_LABELS.pack3,
    sub: '바로 매치 3회 묶음',
    unit: '3',
  },
  {
    badge: '29% 할인',
    id: `${POLICY.payment.instantRematchProductId}_pack10`,
    label: '10회 팩',
    price: PAYMENT_PRICE_LABELS.pack10,
    sub: '바로 매치 10회 묶음',
    unit: '10',
  },
] as const;

export type NicknameValidation =
  | { state: 'idle'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'valid'; message: string }
  | { state: 'invalid'; message: string };

const NICKNAME_PATTERN = /^[0-9A-Za-z가-힣]{1,10}$/;
const BLOCKED_NICKNAME_FRAGMENTS = ['admin', 'administrator', '운영자', '관리자', 'dei'];

export function normalizeNickname(value: string) {
  return value.trim();
}

export function validateNickname(value: string): NicknameValidation {
  const nickname = normalizeNickname(value);

  if (!nickname) {
    return { state: 'idle', message: '한글, 영문, 숫자만 1~10자로 입력해주세요.' };
  }

  if (!NICKNAME_PATTERN.test(nickname)) {
    return { state: 'invalid', message: '특수문자와 이모지는 사용할 수 없어요.' };
  }

  const lower = nickname.toLowerCase();
  if (BLOCKED_NICKNAME_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    return { state: 'invalid', message: '사용할 수 없는 닉네임이에요.' };
  }

  return { state: 'valid', message: '사용 가능해요.' };
}

export function genderLabel(gender?: string | null) {
  if (gender === 'male') return '남성';
  if (gender === 'female') return '여성';
  return '성별 미제공';
}

export function birthYearLabel(birthYear?: number | null) {
  return birthYear ? `${birthYear}년생` : '본인인증 필요';
}

export function birthDateLabel(birthDate?: string | null, birthYear?: number | null) {
  if (birthDate) {
    return birthDate.replaceAll('-', '.');
  }

  return birthYearLabel(birthYear);
}

export function ageLabel(birthYear?: number | null) {
  if (!birthYear) return '나이 미확인';

  const now = new Date();
  return `${now.getFullYear() - birthYear + 1}세`;
}

export function profileMeta({
  birthYear,
  gender,
  region,
}: {
  birthYear?: number | null;
  gender?: string | null;
  region?: string | null;
}) {
  return [ageLabel(birthYear), genderLabel(gender), region].filter(Boolean).join(' · ');
}

export function toInitial(value?: string | null) {
  return normalizeNickname(value ?? '').slice(0, 1) || 'd';
}

export function isUuidLike(value?: string | string[] | null) {
  const next = Array.isArray(value) ? value[0] : value;
  return !!next && UUID_PATTERN.test(next);
}

export function reportCategoryOptions() {
  return REPORT_CATEGORIES.map((category) => ({
    label: category.label,
    value: category.code,
  }));
}
