import * as React from 'react';
import { Modal, Pressable, View } from 'react-native';

import { cn } from '../lib/cn';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';

/**
 * AlertDialog (X4) — 모달 다이얼로그 / 알림 패턴.
 *
 * SSOT: all-screens 와이어프레임
 *  - `.sPF .modal` (size=lg)   : 결제/매칭 실패 alert — 풀 다이얼로그. scrim 위
 *    paper + r-lg, 52px 아이콘 원형(danger-soft), 가운데 제목 17/800·desc 12.5/ink-3,
 *    세로 스택 옵션 버튼(primary=ink / secondary=bg-2 / tertiary=transparent).
 *  - `.sCF .mini` (size=mini)  : 촬영 실패 3종 alert — 컴팩트 카드. paper + r-md,
 *    eyebrow 라벨(9px accent) + h3 14/800 + desc 11.5/ink-3 + 2-CTA row.
 *    `severityTopBorder` 시 상단 3px 보더(.mini.permission/.hardware/.upload =
 *    warn/danger/info) 로 심각도 표시.
 *
 * 커버리지 매트릭스 §X4: Badge(icon) + Text + Button 합성. RN `Modal` + scrim
 * (`bg-black/50`) 로 오버레이를 띄운다. 모든 표면·간격·색은 @dei/ui 토큰
 * className 으로만 표현한다(raw hex / inline style / StyleSheet 금지, DS D-04).
 *
 * tone (danger|warn|info):
 *  - 아이콘 원형(Badge variant=icon)의 *-soft 배경 + 전경색
 *  - severityTopBorder 의 상단 보더 색
 *  사용처: S03/S04c/S05/S11b/S12/S15/S18 (실패·확인·할인 만료 등 다양한 톤).
 */
export type AlertDialogTone = 'danger' | 'warn' | 'info';

export type AlertDialogSize = 'mini' | 'lg';

/** 하단 옵션 버튼 1개 — Button primitive 의 variant 로 시각 톤 결정. */
export interface AlertDialogAction {
  /** 버튼 라벨. */
  label: React.ReactNode;
  /** 누름 핸들러. */
  onPress?: () => void;
  /**
   * 버튼 시각 variant (Button primitive 기준).
   *  - lg  : `ink`(primary) / `secondary` / `tertiary` (HTML `.opts .b.*`)
   *  - mini: `ink`(primary) / `secondary` (HTML `.mini .row .b.*`)
   * 기본 `secondary`.
   */
  variant?: 'ink' | 'accent' | 'secondary' | 'tertiary';
  /** 접근성/테스트 식별자. */
  testID?: string;
}

export interface AlertDialogProps {
  /** 모달 표시 여부. RN `Modal` 의 `visible` 로 위임. */
  visible: boolean;
  /**
   * 심각도 톤. 아이콘 원형(*-soft)·severity 상단 보더 색을 결정. 기본 `danger`.
   */
  tone?: AlertDialogTone;
  /**
   * 다이얼로그 크기.
   *  - `lg`   : `.sPF .modal` 풀 다이얼로그(아이콘 원형 + 가운데 정렬 + 스택 버튼)
   *  - `mini` : `.sCF .mini` 컴팩트 카드(eyebrow + 2-CTA row)
   * 기본 `lg`.
   */
  size?: AlertDialogSize;
  /**
   * 상단 3px 심각도 보더(.mini.permission/.hardware/.upload). 주로 size=mini 에서
   * 사용하지만 양쪽 다 적용 가능. 기본 false.
   */
  severityTopBorder?: boolean;
  /**
   * 아이콘 글리프(이모지/문자). size=lg 의 52px 원형 안에 렌더. mini 는
   * eyebrow 라벨을 우선 쓰므로 보통 생략한다.
   */
  icon?: React.ReactNode;
  /** mini 의 eyebrow 라벨(9px accent UPPERCASE). 예: 'PERMISSION'. */
  eyebrow?: React.ReactNode;
  /** 제목. lg=17/800, mini=14/800, 둘 다 ink. */
  title: React.ReactNode;
  /** 보조 설명. lg=12.5/ink-3(가운데), mini=11.5/ink-3(좌측). */
  description?: React.ReactNode;
  /**
   * 하단 액션 버튼. lg=세로 스택, mini=가로 row(flex-1 균등). 비면 버튼 미표시.
   */
  actions?: AlertDialogAction[];
  /** scrim(배경) 탭 시 호출. 없으면 scrim 탭이 무시된다. */
  onDismiss?: () => void;
  /** Android 백버튼 핸들러(RN Modal onRequestClose). 기본 onDismiss. */
  onRequestClose?: () => void;
  /** 다이얼로그 카드에 머지할 className. */
  className?: string;
  /** 루트 식별자. */
  testID?: string;
}

/** tone → severity 상단 보더 색 토큰 className (HTML `.mini.* border-top`). */
const SEVERITY_BORDER: Record<AlertDialogTone, string> = {
  // .mini.hardware: border-top 3px var(--danger)
  danger: 'border-t-[3px] border-t-danger',
  // .mini.permission: border-top 3px var(--warn)
  warn: 'border-t-[3px] border-t-warn',
  // .mini.upload: border-top 3px var(--info)
  info: 'border-t-[3px] border-t-info',
};

/** lg 다이얼로그 본문(.sPF .modal). 가운데 정렬 + 52px 아이콘 + 스택 버튼. */
function LargeBody({
  tone,
  icon,
  title,
  description,
  actions,
}: {
  tone: AlertDialogTone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: AlertDialogAction[];
}) {
  return (
    <>
      {/* .icn: 52×52 *-soft 원형 + tone 전경 글리프 26px (Badge icon 변형 재사용) */}
      {icon != null ? (
        <Badge
          variant="icon"
          tone={tone}
          className="mb-[14px] h-[52px] w-[52px] self-center"
          textClassName="text-[26px]"
          accessibilityRole="image"
        >
          {icon}
        </Badge>
      ) : null}

      {/* h2: 17/800 ink, 가운데 정렬 */}
      <Text variant="h2" tone="ink" className="text-center text-[17px] font-extrabold">
        {title}
      </Text>

      {/* .desc: 12.5/ink-3, 가운데 정렬 */}
      {description != null ? (
        <Text
          variant="caption"
          tone="ink-3"
          className="mt-[6px] text-center text-[14.5px] leading-[1.6]"
        >
          {description}
        </Text>
      ) : null}

      {/* .opts: 세로 스택 gap 6 (primary=ink / secondary=bg-2 / tertiary=transparent) */}
      {actions != null && actions.length > 0 ? (
        <View className="mt-[14px] gap-[6px]">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant ?? 'secondary'}
              size="sm"
              fullWidth
              testID={action.testID}
              onPress={action.onPress}
            >
              {action.label}
            </Button>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** mini 다이얼로그 본문(.sCF .mini). 좌측 정렬 + eyebrow + 2-CTA row. */
function MiniBody({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: AlertDialogAction[];
}) {
  return (
    <>
      {/* .lbl: 9px/800 accent UPPERCASE tracking-wider (eyebrow variant) */}
      {eyebrow != null ? (
        <Text
          variant="eyebrow"
          tone="accent"
          className="mb-[6px] text-[11px] tracking-[0.1em]"
        >
          {eyebrow}
        </Text>
      ) : null}

      {/* h3: 14/800 ink */}
      <Text variant="h2" tone="ink" className="text-[16px] font-extrabold leading-[1.3]">
        {title}
      </Text>

      {/* .d: 11.5/ink-3 */}
      {description != null ? (
        <Text
          variant="micro"
          tone="ink-3"
          className="mt-[4px] text-[13.5px] leading-[1.5]"
        >
          {description}
        </Text>
      ) : null}

      {/* .row: 가로 균등(flex-1) 2-CTA, gap 6 (primary=ink / secondary=bg-2) */}
      {actions != null && actions.length > 0 ? (
        <View className="mt-[10px] flex-row gap-[6px]">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant ?? 'secondary'}
              size="sm"
              testID={action.testID}
              onPress={action.onPress}
              className="flex-1 px-[9px] py-[9px]"
            >
              {action.label}
            </Button>
          ))}
        </View>
      ) : null}
    </>
  );
}

/**
 * X4 AlertDialog.
 */
export function AlertDialog({
  visible,
  tone = 'danger',
  size = 'lg',
  severityTopBorder = false,
  icon,
  eyebrow,
  title,
  description,
  actions,
  onDismiss,
  onRequestClose,
  className,
  testID,
}: AlertDialogProps) {
  const isMini = size === 'mini';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose ?? onDismiss}
      testID={testID}
    >
      {/* scrim: bg-black/50, 가운데 정렬(lg) / 가운데 정렬(mini), 좌우 24px 인셋 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="닫기"
        onPress={onDismiss}
        className="flex-1 items-center justify-center bg-black/50 px-[24px]"
      >
        {/*
          카드: 바깥 Pressable 의 onPress(닫기) 가 카드 내부 탭으로 전파되지 않도록
          내부를 별도 Pressable 로 감싸 이벤트를 흡수한다(스크림만 닫힘).
          - lg   : .sPF .modal — paper + r-lg + padding 22/22/14
          - mini : .sCF .mini  — paper + r-md + padding 14
        */}
        <Pressable
          onPress={() => {}}
          className={cn(
            'w-full bg-paper',
            isMini ? 'rounded-md px-[14px] py-[14px]' : 'rounded-lg px-[22px] pb-[14px] pt-[22px]',
            severityTopBorder && SEVERITY_BORDER[tone],
            // severity 보더 시 상단 라운드가 보더와 어색해지지 않도록 overflow 클립
            severityTopBorder && 'overflow-hidden',
            className,
          )}
        >
          {isMini ? (
            <MiniBody
              eyebrow={eyebrow}
              title={title}
              description={description}
              actions={actions}
            />
          ) : (
            <LargeBody
              tone={tone}
              icon={icon}
              title={title}
              description={description}
              actions={actions}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

AlertDialog.displayName = 'AlertDialog';
