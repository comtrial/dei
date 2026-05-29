import * as React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { X } from 'lucide-react-native';

import { cn } from '../lib/cn';
import { IconButton } from '../primitives/IconButton';
import { Spinner } from '../primitives/Spinner';
import { Text } from '../primitives/Text';

/**
 * PermissionGate (X7) — 권한/진행 게이트 풀스크린 패턴.
 *
 * SSOT: all-screens 와이어프레임
 *  - `.s07a` 알림 권한 게이트 (S07a, status=info) — 🔔 info-soft 원형 + why-box + 스택 CTA
 *  - `.s07a` 카메라 권한 게이트 (S11a, status=info) — 📷 동일 레이아웃
 *  - `.s03`  인증 진행 (S03, status=spinner) — 80px progress-ring + heading/desc (why/cta 없음)
 *  - danger 변형은 `.s03f` 의 danger-soft/danger 아이콘 톤을 공유
 *
 * 커버리지 매트릭스 §X7: StateView + Banner(why) + BottomActionBar(stacked) 합성.
 * 본 패턴은 이미 구현된 primitives(IconButton/Spinner/Text)를 조립하고, 표면·간격은
 * 전부 @dei/ui 토큰 className 으로만 표현한다(raw hex / inline style 금지, DS D-04).
 *
 * 레이아웃(HTML `.s07a` / `.s03`):
 *  - 컨테이너 bg, topbar(우상단 닫기 filled-circle), body(세로 중앙 정렬, text-center)
 *  - icon: `.ic` 64×64 round, `*-soft` bg + status 전경, 글리프 30px, mb 24px
 *  - h2: 21/800 ink (spinner=19/700), desc: 13.5/ink-3
 *  - `.why`: bg-2 + r-md + padding 14/16, 좌측 정렬, 12.5/ink-2, bold title 블록 + 불릿
 *  - `.ctas`: 세로 스택 gap 10, mt-auto, pb 24 — primary(ink/white) + secondary(bg-2/ink-2)
 */
export type PermissionGateStatus = 'info' | 'danger' | 'spinner';

/** why-box(왜 필요한가요?) 항목 — 불릿 리스트. */
export interface PermissionGateReason {
  /** 좌측 정렬 불릿 한 줄. */
  text: string;
}

export interface PermissionGateProps extends Omit<ViewProps, 'children'> {
  /**
   * 게이트 상태.
   *  - `info`    : 권한 안내 (알림/카메라 등) — info-soft/info 아이콘 톤
   *  - `danger`  : 실패/거부 강조 — danger-soft/danger 아이콘 톤
   *  - `spinner` : 진행 중(인증 등) — 80px Spinner, why/cta 미표시
   */
  status?: PermissionGateStatus;
  /** 아이콘 글리프(이모지/문자). spinner 상태에서는 무시되고 Spinner 가 표시된다. */
  icon?: React.ReactNode;
  /** 제목 (예: '알림이 꺼져 있어요'). */
  heading: React.ReactNode;
  /** 보조 설명 (예: '매칭 결과를 알려드리려면 알림이 필요해요.'). */
  description?: React.ReactNode;
  /** why-box 제목 (기본 '왜 필요한가요?'). reasons 가 있을 때만 렌더. */
  whyTitle?: React.ReactNode;
  /** why-box 불릿 항목. 비면 why-box 미표시. spinner 상태에서는 무시. */
  reasons?: PermissionGateReason[];
  /** 주 CTA 라벨 (예: '설정에서 알림 켜기'). spinner 상태에서는 무시. */
  primaryLabel?: React.ReactNode;
  /** 주 CTA 핸들러. */
  onPrimary?: () => void;
  /** 보조 CTA 라벨 (예: '나중에 하기'). 없으면 미표시. */
  secondaryLabel?: React.ReactNode;
  /** 보조 CTA 핸들러. */
  onSecondary?: () => void;
  /** 우상단 닫기 핸들러. 없으면 닫기 버튼 미표시. */
  onClose?: () => void;
  /** 닫기 버튼 접근성 라벨 (기본 '닫기'). */
  closeAccessibilityLabel?: string;
  className?: string;
}

/** status → 아이콘 원형 배경/전경 토큰 className (HTML `.ic` *-soft/status). */
const ICON_TONE: Record<Exclude<PermissionGateStatus, 'spinner'>, string> = {
  // S07a/S11a: background var(--info-soft); color var(--info)
  info: 'bg-info-soft',
  // S03f 공유: background var(--danger-soft); color var(--danger)
  danger: 'bg-danger-soft',
};

const ICON_GLYPH_TONE: Record<Exclude<PermissionGateStatus, 'spinner'>, string> = {
  info: 'text-info',
  danger: 'text-danger',
};

/**
 * X7 PermissionGate.
 */
export const PermissionGate = React.forwardRef<View, PermissionGateProps>(
  function PermissionGate(
    {
      status = 'info',
      icon,
      heading,
      description,
      whyTitle = '왜 필요한가요?',
      reasons,
      primaryLabel,
      onPrimary,
      secondaryLabel,
      onSecondary,
      onClose,
      closeAccessibilityLabel = '닫기',
      className,
      ...rest
    },
    ref,
  ) {
    const isSpinner = status === 'spinner';
    const hasWhy = !isSpinner && reasons != null && reasons.length > 0;
    const hasCtas = !isSpinner && (primaryLabel != null || secondaryLabel != null);

    return (
      <View
        ref={ref}
        // .s07a/.s03: background var(--bg), 풀스크린 컨테이너
        className={cn('flex-1 bg-bg', className)}
        {...rest}
      >
        {/* .topbar: 우상단 닫기 (filled-circle .x 36×36) */}
        {onClose != null ? (
          <View className="flex-row justify-end px-[18px] pt-[50px]">
            <IconButton
              glyph={X}
              variant="filled-circle"
              size={36}
              accessibilityLabel={closeAccessibilityLabel}
              onPress={onClose}
            />
          </View>
        ) : null}

        {/* .body: 세로 중앙 정렬, text-center, padding 120/32 (spinner=100/32) */}
        <View
          className={cn(
            'flex-1 items-center px-[32px] pb-[32px]',
            isSpinner ? 'pt-[100px]' : 'pt-[120px]',
          )}
        >
          {/* icon 영역: spinner → 80px Spinner / 그 외 → .ic 64×64 *-soft 원형 */}
          {isSpinner ? (
            <View className="mb-[22px]">
              <Spinner size={80} />
            </View>
          ) : (
            <View
              accessibilityRole="image"
              className={cn(
                'mb-[24px] h-[64px] w-[64px] items-center justify-center rounded-full',
                ICON_TONE[status],
              )}
            >
              <Text className={cn('text-[30px]', ICON_GLYPH_TONE[status])}>{icon}</Text>
            </View>
          )}

          {/* h2: spinner=19/700, 그 외 21/800 — 둘 다 ink, 가운데 정렬 */}
          <Text
            variant="h2"
            tone="ink"
            className={cn('text-center', isSpinner ? 'text-[19px]' : 'text-[21px] font-extrabold')}
          >
            {heading}
          </Text>

          {/* desc: 13.5/ink-3, 가운데 정렬 */}
          {description != null ? (
            <Text
              variant="caption"
              tone="ink-3"
              className="mt-[10px] text-center text-[13.5px] leading-[1.6]"
            >
              {description}
            </Text>
          ) : null}

          {/* .why: bg-2 + r-md, 좌측 정렬, bold title 블록 + 불릿 리스트. mt-auto 로 CTA 위로 밀착 */}
          {hasWhy ? (
            <View className="mb-auto mt-[18px] w-full rounded-md bg-bg-2 px-[16px] py-[14px]">
              <Text className="mb-[6px] text-[12.5px] font-bold leading-[1.6] text-ink">
                {whyTitle}
              </Text>
              <View className="pl-[16px]">
                {reasons!.map((reason, i) => (
                  <View key={i} className="my-[2px] flex-row">
                    <Text className="text-[12.5px] leading-[1.6] text-ink-2">{'• '}</Text>
                    <Text className="flex-1 text-[12.5px] leading-[1.6] text-ink-2">
                      {reason.text}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* .ctas: 세로 스택 gap 10, mt-auto, pb 24 — primary(ink) + secondary(bg-2) */}
          {hasCtas ? (
            <View className="mt-auto w-full gap-[10px] pb-[24px]">
              {primaryLabel != null ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onPrimary}
                  className="items-center rounded-md bg-ink py-[16px]"
                >
                  <Text className="text-[15px] font-bold text-white">{primaryLabel}</Text>
                </Pressable>
              ) : null}
              {secondaryLabel != null ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onSecondary}
                  className="items-center rounded-md bg-bg-2 py-[16px]"
                >
                  <Text className="text-[14px] font-semibold text-ink-2">{secondaryLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  },
);

PermissionGate.displayName = 'PermissionGate';
