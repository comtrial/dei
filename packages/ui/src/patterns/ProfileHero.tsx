import { forwardRef, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { Pencil } from 'lucide-react-native';

// 직접 파일 경로로 import — 일부 primitive 가 아직 배럴(`../primitives/index`)에
// 등재되기 전이어도 안전하게 컴포지션한다(배럴 등재는 각 primitive 소유 agent 담당).
import { IconButton } from '../primitives/IconButton';
import { Text } from '../primitives/Text';
import { cn } from '../lib/cn';

/**
 * ProfileHero (X16) — 프로필 상단 히어로(아바타 + 이름/메타 + 편집 앵커).
 *
 * SSOT: all-screens 와이어프레임 + 커버리지 매트릭스 §X16.
 * 화면 CSS 원천:
 *  - S16 `.hero-av`        : 120×120 원형 아바타(상대 프로필 보기) — `size="xl"`
 *  - S19 `.hero .av`       : 90×90 원형 아바타(프로필 수정 허브) — `size="lg"`
 *  - S19 `.hero .av .edit` : 28×28 원형 편집 앵커(bottom:-2px right:-2px,
 *                            bg var(--ink), white glyph, border 2px solid var(--bg))
 *  - S14 멤버 프로필        : 동일 hero 패턴(이름/메타 텍스트) 재사용
 *
 * 합성:
 *  - 편집 앵커는 **IconButton** 오버레이(매트릭스 X16 ← IconButton). 글리프 색을
 *    white 로 강제해야 하므로 IconButton `glass` variant(white 글리프)를 쓰고
 *    배경은 `bg-ink`, 보더는 `border-bg` 로 className 오버라이드(HTML 값 그대로).
 *  - 아바타 배경은 사용자별 seed 색(HTML raw #E07A4F/#7A8DB8 — §3A 토큰 승격
 *    후보지만 *per-user identity* 색). raw hex 누수 방지를 위해 ProfileHero 는
 *    `seedClassName`(NativeWind bg className) 으로만 받는다. 미지정 시 중립
 *    토큰 `bg-bg-2`.
 *  - `ring` 활성 시 아바타 둘레에 accent 링(P6 Avatar `ring(accent)` 변형).
 *
 * 규칙(DS 강제 D-04): inline style / raw hex / StyleSheet 금지. 색은 토큰
 * className 으로만. HTML 치수(90/120/28px·offset)는 NativeWind 임의값 className.
 */
export type ProfileHeroSize = 'lg' | 'xl';

/** size → 아바타 박스 치수 className (HTML 90/120px 그대로) */
const AVATAR_BOX: Record<ProfileHeroSize, string> = {
  // S19 .hero .av: 90×90
  lg: 'w-[90px] h-[90px]',
  // S16 .hero-av: 120×120
  xl: 'w-[120px] h-[120px]',
};

/** size → 이니셜 글리프 크기 className (HTML 36px(S19) / 48px(S16)) */
const AVATAR_INITIAL_SIZE: Record<ProfileHeroSize, string> = {
  lg: 'text-[36px]',
  xl: 'text-[48px]',
};

/** size → 이름 텍스트 크기 className (HTML .nm 18px(S19) / 22px(S16), weight 800) */
const NAME_SIZE: Record<ProfileHeroSize, string> = {
  lg: 'text-[18px]',
  xl: 'text-[22px]',
};

export interface ProfileHeroProps extends ViewProps {
  /** 표시 이름. 없으면 이름 행을 렌더하지 않는다. */
  name?: string;
  /** 메타(예: '24세 · 여성'). ink-3. */
  meta?: string;
  /** 아바타 이니셜(예: '도'). image 미지정 시 fallback. */
  initial?: string;
  /** 아바타 크기. 기본 `xl`(120px, S16 상대 프로필). 수정 허브(S19)는 `lg`(90px). */
  size?: ProfileHeroSize;
  /**
   * 아바타 배경 seed className(NativeWind bg 유틸). per-user identity 색.
   * 미지정 시 중립 토큰 `bg-bg-2`. raw hex 금지 — 토큰/유틸 className 으로만.
   */
  seedClassName?: string;
  /** 이니셜 텍스트 색 className. 기본 `text-paper`(흰 글자, HTML 그대로). */
  initialClassName?: string;
  /** accent 링(P6 Avatar `ring` 변형) 표시 여부. 기본 false. */
  ring?: boolean;
  /** 편집 앵커(IconButton) 표시 여부 — S19 수정 허브. 기본 false. */
  editable?: boolean;
  /** 편집 앵커 탭 핸들러. */
  onEditPress?: () => void;
  /** 편집 앵커 접근성 라벨. 기본 '프로필 사진 편집'. */
  editAccessibilityLabel?: string;
  /** 아바타 자리에 들어갈 커스텀 노드(이미지 등). 지정 시 initial 무시. */
  children?: ReactNode;
  className?: string;
}

export const ProfileHero = forwardRef<View, ProfileHeroProps>(function ProfileHero(
  {
    name,
    meta,
    initial,
    size = 'xl',
    seedClassName,
    initialClassName,
    ring = false,
    editable = false,
    onEditPress,
    editAccessibilityLabel = '프로필 사진 편집',
    children,
    className,
    ...rest
  },
  ref,
) {
  return (
    <View
      ref={ref}
      accessibilityRole="header"
      className={cn('items-center', className)}
      {...rest}
    >
      {/* 아바타 + 편집 앵커 anchor (relative 컨테이너) */}
      <View className="relative">
        <View
          testID="profile-hero-avatar"
          accessible
          accessibilityRole="image"
          accessibilityLabel={name ? `${name} 프로필 사진` : undefined}
          className={cn(
            'items-center justify-center rounded-full overflow-hidden',
            AVATAR_BOX[size],
            // accent 링: P6 Avatar ring(accent). HTML 비표준이나 X16 명세 항목.
            ring && 'border-2 border-accent',
            // per-user seed 배경 — 미지정 시 중립 토큰.
            seedClassName ?? 'bg-bg-2',
          )}
        >
          {children ??
            (initial ? (
              <Text
                className={cn(
                  'font-extrabold',
                  AVATAR_INITIAL_SIZE[size],
                  // HTML: 이니셜 white. 토큰 paper(=#FFFFFF).
                  initialClassName ?? 'text-paper',
                )}
              >
                {initial}
              </Text>
            ) : null)}
        </View>

        {/* 편집 앵커 — IconButton 오버레이(매트릭스 X16 ← IconButton). */}
        {editable ? (
          <View className="absolute bottom-[-2px] right-[-2px]">
            <IconButton
              glyph={Pencil}
              // glass variant = white 글리프. 배경/보더/박스치수는 HTML 값으로 override.
              variant="glass"
              iconSize={12}
              accessibilityLabel={editAccessibilityLabel}
              onPress={onEditPress}
              // .edit: 28×28(토큰 스케일 밖), bg var(--ink), border 2px solid var(--bg).
              // cn last-wins 로 IconButton 기본 박스(32px)·glass 배경을 덮는다.
              className="w-[28px] h-[28px] rounded-full bg-ink border-2 border-bg"
            />
          </View>
        ) : null}
      </View>

      {/* 이름 — HTML .nm 18(S19)/22(S16) weight 800 ink */}
      {name ? (
        <Text
          tone="ink"
          className={cn('mt-[8px] text-center font-extrabold', NAME_SIZE[size])}
        >
          {name}
        </Text>
      ) : null}

      {/* 메타 — HTML .meta 12 ink-3 */}
      {meta ? (
        <Text variant="meta" tone="ink-3" className="mt-[3px] text-center">
          {meta}
        </Text>
      ) : null}
    </View>
  );
});

ProfileHero.displayName = 'ProfileHero';
