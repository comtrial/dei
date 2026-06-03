import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

// 직접 파일 경로로 import — 배럴(`../primitives/index`) 등재 시점과 무관하게
// 안전히 컴포지션한다(배럴 등재는 각 primitive 소유 agent 담당).
import { Text } from '../primitives/Text';
import { Toggle } from '../primitives/Toggle';
import { Avatar } from '../primitives/Avatar';
import { color } from '../tokens';
import { cn } from '../lib/cn';

/**
 * SettingsRow (X12) — 설정/리스트 행.
 *
 * SSOT: all-screens 와이어프레임 + 커버리지 매트릭스 §X12 (S14/S15/S19/S22).
 * 화면 CSS 원천(variant 별):
 *  - `nav`    : S19 `.row` — paper, padding 13/24, border-top 1px line-2,
 *               `.k`(flex 13.5px ink), `.v`(13px ink-3 mr-8), `.arr`(ink-4 14px chevron)
 *  - `locked` : S19 `.row.locked` — nav 베이스 + `.v` ink-4 + `.lock` 10px ink-4 ml-6
 *  - `danger` : S19 `.row.danger` / `.sBR .it.danger` — `.k` 가 danger 색
 *  - `master` : S22 `.main-row` — paper, padding 18/24, border-top+bottom line-2,
 *               gap 14, `.t`(15px/700 ink) + `.d`(11.5px ink-3 desc) 좌측 스택 + 우측 Toggle
 *  - `member` : S15 `.sBR .who` — 36px Avatar + `.nm`(13.5px/700 ink) + `.sub`(11px ink-3),
 *               border-bottom 1px line (시트 헤더 행)
 *
 * 의존 primitive(매트릭스 X12 ← Text, Toggle, IconButton, Avatar):
 *  - 라벨/값/설명/이름/서브 → **Text**
 *  - master 우측 스위치 → **Toggle**
 *  - nav/locked/danger 우측 chevron → lucide `ChevronRight`(IconButton 의 글리프 역할)
 *  - member 좌측 아바타 → **Avatar**
 *
 * 규칙(DS 강제 D-04): inline style / raw hex / StyleSheet 금지. 색·치수는
 * 토큰 className(arbitrary-value 포함)으로만. lucide chevron 은 stroke 라
 * className 색이 안 먹어 토큰값을 `color` prop 으로 준다(IconButton 과 동일 패턴).
 *
 * 공통 구분선: X12 명세대로 `border-b border-line-2` 를 모든 variant 에 적용
 * (HTML 은 nav/master 가 border-top, member 가 border-bottom 으로 인접 행을
 * 1px line 으로 가르는 패턴 — RN 리스트에서는 행마다 하단선으로 통일하는 것이
 * 동등하고 안전하다). member 만 HTML 의 진한 `--line`(섹션 경계) 을 따른다.
 */
export type SettingsRowVariant = 'nav' | 'locked' | 'danger' | 'master' | 'member';

export interface SettingsRowProps extends Omit<PressableProps, 'children'> {
  /** 행 변형. 기본 `nav`. */
  variant?: SettingsRowVariant;
  /** 좌측 라벨(nav/locked/danger 의 `.k`, master 의 `.t`, member 의 `.nm`). */
  label?: string;
  /** 우측 값 텍스트(nav/locked `.v`) 또는 master/member 의 설명/서브(`.d`/`.sub`). */
  value?: string;
  /**
   * 우측 슬롯 override. master 면 기본 Toggle, nav/locked/danger 면 기본 chevron 을
   * 대체한다. 임의 노드(스위치/배지/커스텀 액션)를 우측에 얹을 때 사용.
   */
  right?: ReactNode;
  /** member 변형 아바타 이니셜(예: '도'). */
  initial?: string;
  /** member 변형 아바타 이미지 URL. 있으면 이니셜 대신 사진을 표시한다. */
  photoUrl?: string;
  /** member 변형 아바타 배경 className(per-user identity 색, §3A). 기본 peer 색. */
  avatarBg?: string;
  /** master 변형 Toggle on/off 상태. */
  toggleValue?: boolean;
  /** master 변형 Toggle 토글 콜백(다음 상태 인자). */
  onToggleChange?: (value: boolean) => void;
  className?: string;
}

/** variant → Pressable 컨테이너 className (HTML CSS 값 그대로). */
const CONTAINER: Record<SettingsRowVariant, string> = {
  // S19 .row: paper, 13/24 패딩, 하단 구분선(line-2). HTML border-top → 하단선으로 통일.
  nav: 'flex-row items-center bg-paper px-[24px] py-[13px] border-b border-line-2',
  locked: 'flex-row items-center bg-paper px-[24px] py-[13px] border-b border-line-2',
  danger: 'flex-row items-center bg-paper px-[24px] py-[13px] border-b border-line-2',
  // S22 .main-row: paper, 18/24 패딩, gap 14, 상하 line-2 → 하단선 통일.
  master: 'flex-row items-center gap-[14px] bg-paper px-[24px] py-[18px] border-b border-line-2',
  // S15 .sBR .who: 좌 아바타+텍스트, gap 10, 하단 진한 line(섹션 경계), 0/24/14 패딩.
  member: 'flex-row items-center gap-[10px] px-[24px] pb-[14px] border-b border-line',
};

export const SettingsRow = forwardRef<View, SettingsRowProps>(function SettingsRow(
  {
    variant = 'nav',
    label,
    value,
    right,
    initial,
    photoUrl,
    avatarBg = 'bg-[#7A8DB8]',
    toggleValue = false,
    onToggleChange,
    className,
    accessibilityRole,
    ...rest
  },
  ref,
) {
  // master: 좌측 라벨(.t)+설명(.d) 스택 + 우측 Toggle.
  if (variant === 'master') {
    return (
      <Pressable
        ref={ref}
        // 우측 Toggle 이 switch 시맨틱을 소유 → 래퍼는 중복 role 을 갖지 않는다.
        accessibilityRole={accessibilityRole ?? 'none'}
        className={cn(CONTAINER.master, className)}
        {...rest}
      >
        <View className="flex-1">
          {/* .t: 15px/700 ink */}
          {label ? (
            <Text className="text-[15px] font-bold text-ink">{label}</Text>
          ) : null}
          {/* .d: 11.5px ink-3, line-height 1.45 */}
          {value ? (
            <Text className="mt-[3px] text-[11.5px] leading-[17px] text-ink-3">{value}</Text>
          ) : null}
        </View>
        {right ?? (
          <Toggle value={toggleValue} onValueChange={onToggleChange} />
        )}
      </Pressable>
    );
  }

  // member: S15 .sBR .who — 36px Avatar + 이름(.nm) + 서브(.sub).
  if (variant === 'member') {
    return (
      <Pressable
        ref={ref}
        accessibilityRole={accessibilityRole ?? 'none'}
        className={cn(CONTAINER.member, className)}
        {...rest}
      >
        <Avatar
          initial={initial}
          photoUrl={photoUrl}
          size={36}
          bg={avatarBg}
          textClassName="text-[13px] font-bold"
        />
        <View className="flex-1">
          {/* .nm: 13.5px/700 ink */}
          {label ? (
            <Text className="text-[13.5px] font-bold text-ink">{label}</Text>
          ) : null}
          {/* .sub: 11px ink-3 */}
          {value ? (
            <Text className="mt-[1px] text-[11px] text-ink-3">{value}</Text>
          ) : null}
        </View>
        {right}
      </Pressable>
    );
  }

  // nav / locked / danger: 좌측 라벨(.k) flex + 우측 값(.v) + chevron(.arr).
  // .k: 13.5px ink. danger → danger 색. locked 는 라벨 색 동일(값/lock 만 ink-4).
  const labelClass = cn('flex-1 text-[13.5px]', variant === 'danger' ? 'text-danger' : 'text-ink');
  // .v: 13px ink-3. locked → ink-4 (HTML .row.locked .v).
  const valueClass = cn('mr-[8px] text-[13px]', variant === 'locked' ? 'text-ink-4' : 'text-ink-3');

  return (
    <Pressable
      ref={ref}
      accessibilityRole={accessibilityRole ?? 'button'}
      className={cn(CONTAINER[variant], className)}
      {...rest}
    >
      {label ? <Text className={labelClass}>{label}</Text> : null}
      {value ? <Text className={valueClass}>{value}</Text> : null}
      {/* locked: .lock 자물쇠 글리프 10px ink-4 (값 옆). 우측 슬롯 override 없을 때만. */}
      {variant === 'locked' && right == null ? (
        <Text className="mr-[6px] text-[10px] text-ink-4">🔒</Text>
      ) : null}
      {/* .arr: ink-4 14px chevron. right slot 지정 시 그것으로 대체. */}
      {right ?? <ChevronRight color={color['ink-4']} size={14} />}
    </Pressable>
  );
});

SettingsRow.displayName = 'SettingsRow';
