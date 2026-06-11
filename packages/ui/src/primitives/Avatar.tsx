import { forwardRef, useEffect, useState } from 'react';
import { Image, View, Text, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * Avatar (P6) — 이니셜 원형 아바타.
 *
 * SSOT: all-screens 와이어프레임의 아바타 계열 CSS + 커버리지 매트릭스 §P6.
 * 흡수 별칭: Avatar / AvatarInitial / PresenceAvatar / HeroAvatar / ProfileHero(av) /
 * MemberChip(av) / MyAvatarWithBadge / TargetMemberChip(av).
 * HTML 출처별 치수: `.s05 .av-me`(38/14px,700), `.s06 .chip .av`(24/11px,700),
 * `.s13a .msg .av`(28/11px,700), `.s13b .meta .av`(30/11px,700),
 * `.s21 .target .av`(34/13px,700), `.sBR .who .av`(36/13px,700),
 * `.s19 .hero .av`(90/36px,800), `.s16 .hero-av`(120/48px,800).
 * 공통 규칙: 정원(`border-radius:50%`), 흰 글자, 이니셜 중앙 정렬.
 *
 * 규칙(DS 강제 D-04):
 *  - 색·치수는 NativeWind className(arbitrary-value 포함)으로만 인코딩.
 *  - 치수 arbitrary-value 는 NativeWind 추출을 위해 정적 클래스 테이블로 유지한다.
 *  - inline `style={{}}` / raw hex `style` / StyleSheet 미사용.
 *  - ring(accent 테두리)·presenceDot·badge 는 토큰 className(accent/paper)으로.
 *
 * 비표준 아바타 bg(§3A — 토큰 승격 후보지만 미승격분):
 *  - `#E07A4F` 내 아바타(self) / `#7A8DB8` 상대 아바타(peer)는 정체성 색이다.
 *    승격 전까지는 `bg` prop 으로 caller 가 명시 주입하며, 기본값은
 *    HTML 값(self 톤) 컴포넌트 상수로 둔다. 토큰화 시 이 상수만 교체.
 */

// §3A: 미승격 아바타 식별 색(HTML 값 그대로). 토큰 승격 시 여기만 교체한다.
const DEFAULT_BG = 'bg-[#E07A4F]'; // self(내 아바타). peer(#7A8DB8)는 bg prop 으로.

// peer 식별 팔레트(와이어프레임 §3A 분포색). photoUrl 없는 멤버의 이니셜 배경을
// userId 해시로 결정적으로 배정 — 같은 사람은 항상 같은 색(세션·재렌더 안정).
const PEER_BGS = [
  'bg-[#7A8DB8]',
  'bg-[#7A6CB8]',
  'bg-[#A86B8A]',
  'bg-[#6BA88A]',
  'bg-[#C99A5B]',
  'bg-[#5B9AC9]',
] as const;

const SIZE_CLASS: Record<number, string> = {
  20: 'h-[20px] w-[20px]',
  24: 'h-[24px] w-[24px]',
  26: 'h-[26px] w-[26px]',
  28: 'h-[28px] w-[28px]',
  32: 'h-[32px] w-[32px]',
  36: 'h-[36px] w-[36px]',
  38: 'h-[38px] w-[38px]',
  120: 'h-[120px] w-[120px]',
};

const INITIAL_SIZE_CLASS: Record<number, string> = {
  20: 'text-[10px] leading-[20px]',
  24: 'text-[11px] leading-[24px]',
  26: 'text-[12px] leading-[26px]',
  28: 'text-[12px] leading-[28px]',
  32: 'text-[14px] leading-[32px]',
  36: 'text-[15px] leading-[36px]',
  38: 'text-[16px] leading-[38px]',
  120: 'text-[48px] leading-[120px]',
};

function avatarSizeClass(size: number): string {
  return SIZE_CLASS[size] ?? SIZE_CLASS[38];
}

/** userId(또는 임의 키) → 결정적 peer 아바타 bg className. 캐싱·재렌더에 안정. */
export function avatarColorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PEER_BGS[h % PEER_BGS.length];
}

export interface AvatarProps extends ViewProps {
  /** 표시할 이니셜(보통 1글자). 예: '수'. */
  initial?: string;
  /**
   * 프로필 이미지 URL. 지정 시 이니셜 대신 원형(size) 이미지로 렌더하며,
   * 미지정/로드 실패 시 `initial` 폴백을 사용한다.
   */
  photoUrl?: string;
  /** 원형 지름(px). 18~120. 기본 38 (S05 `.av-me`). */
  size?: number;
  /**
   * 배경색 className. 비표준 아바타 bg(§3A)는 caller 가 토큰/상수로 주입.
   * 예: `bg-[#7A8DB8]`(peer) / `bg-accent`. 미지정 시 self 기본색.
   */
  bg?: string;
  /** accent 테두리 링(PresenceAvatar). HTML `box-shadow:0 0 0 1.5px var(--accent)`. */
  ring?: boolean;
  /**
   * 우하단 presence 점(접속 표시). HTML `.av::after` accent 원 + 흰 보더.
   * `.av-me .badge`(우상단 accent 점) 도 동일 토큰으로 표현.
   */
  presenceDot?: boolean;
  /**
   * 우하단 오버레이 슬롯(편집 배지/상태 배지 등). S19 `.hero .av .edit`,
   * ProfileHero edit anchor. 임의 노드를 절대배치로 얹는다.
   */
  badge?: React.ReactNode;
  /** 이니셜 Text 에 머지할 className(굵기/크기 미세조정용). */
  textClassName?: string;
  className?: string;
}

/**
 * size → 이니셜 폰트 크기·굵기 className.
 * HTML 분포: 작은 칩(<=40)=700·size의 ~0.37배, hero(>=90)=800·size의 ~0.4배.
 * 정수 px 로 라운딩한 arbitrary-value 로 인코딩(토큰 스케일 밖 — D-04 허용 범위).
 */
function initialClass(size: number): string {
  const isHero = size >= 64;
  return cn(
    'text-white text-center',
    isHero ? 'font-extrabold' : 'font-bold',
    INITIAL_SIZE_CLASS[size] ?? INITIAL_SIZE_CLASS[38],
  );
}

/**
 * Avatar primitive. 항상 `View` 로 래핑되며 정원·중앙정렬을 기본 적용하고
 * `bg`(배경)·ring·presenceDot·badge 를 토큰 className 으로 합성한다.
 * `props.className` 은 `cn()` 으로 마지막 병합(last-wins).
 */
export const Avatar = forwardRef<View, AvatarProps>(function Avatar(
  {
    initial,
    photoUrl,
    size = 38,
    bg,
    ring = false,
    presenceDot = false,
    badge,
    textClassName,
    className,
    accessibilityLabel,
    ...rest
  },
  ref,
) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = photoUrl != null && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  return (
    <View
      ref={ref}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? (initial ? `${initial} 아바타` : undefined)}
      className={cn(
        // shrink-0: flex-row 부모(Chip·아바타 스택·헤더 등)에서 라벨/배지가 공간을
        // 요구할 때 아바타 width 만 압축돼 타원으로 찌그러지는 것을 막는다(정사각 보존).
        'relative shrink-0 items-center justify-center overflow-hidden rounded-full',
        avatarSizeClass(size),
        showPhoto ? 'bg-bg-2' : bg ?? DEFAULT_BG,
        // PresenceAvatar accent 링: 1.5px accent 보더(box-shadow 대체).
        ring && 'border-[1.5px] border-accent',
        className,
      )}
      {...rest}
    >
      {showPhoto ? (
        // 프로필 이미지: 원형 컨테이너를 가득 채우는 cover 이미지(이니셜 폴백 대체).
        // react-native Image 를 사용한다. 프로필 상세 화면도 같은 경로라 iOS 실기기에서
        // Supabase signed URL 렌더링이 일관된다. 로드 실패 시 빈 색 원 대신 이니셜 폴백.
        <Image
          testID="av-photo"
          source={{ uri: photoUrl }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          className={cn('rounded-full', avatarSizeClass(size))}
        />
      ) : initial != null ? (
        <Text className={cn(initialClass(size), textClassName)}>{initial}</Text>
      ) : null}

      {/* presence 점 — 우하단 accent 원 + 흰 보더 (HTML `.av::after` / `.av-me .badge`). */}
      {presenceDot ? (
        <View
          accessibilityLabel="접속 중"
          className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-2 border-paper bg-accent"
        />
      ) : null}

      {/* 편집/상태 배지 슬롯 — 우하단 절대배치 (S19 `.hero .av .edit`). */}
      {badge != null ? (
        <View className="absolute -bottom-[2px] -right-[2px]">{badge}</View>
      ) : null}
    </View>
  );
});

Avatar.displayName = 'Avatar';
