import { forwardRef, type ReactNode } from 'react';
import { View, type TextInput, type ViewProps } from 'react-native';
import { ArrowUp } from 'lucide-react-native';

// 직접 파일 경로로 import — 일부 primitive 가 아직 배럴(`../primitives/index`)에
// 등재되기 전이어도 안전하게 컴포지션한다(배럴 등재는 각 primitive 소유 agent 담당).
import { Input } from '../primitives/Input';
import { IconButton } from '../primitives/IconButton';
import { Text } from '../primitives/Text';
import { Chip } from '../primitives/Chip';
import { Avatar } from '../primitives/Avatar';
import { cn } from '../lib/cn';

/**
 * InputBar (X9) — 채팅 컴포저 입력 바.
 *
 * SSOT: all-screens 와이어프레임 S13a `.input-bar` + 커버리지 매트릭스 §X9
 * ("InputBar (채팅 컴포저) ← Input, IconButton / sendDisabled, charcount /
 *  bg-2(input), accent(send 원형), r-full").
 *
 * 화면 CSS 원천 (S13a):
 *  - `.input-bar`        : padding 10px 14px 14px / border-top 1px var(--line) /
 *                          display flex / align-items center / gap 8px /
 *                          background var(--paper) / flex-shrink 0
 *  - `.input-bar input`  : flex 1 / background var(--bg-2) / border 0 /
 *                          padding 10px 14px / border-radius var(--r-full) /
 *                          font-size 13px / color var(--ink)
 *  - `.input-bar .send`  : 32×32 / border-radius 50% / background var(--accent) /
 *                          color white / font-size 14px / 글리프 "↑"(ArrowUp)
 *
 * 합성:
 *  - 입력 필드는 **Input** primitive(P2)를 재사용하되, HTML 의 pill 모양/치수를
 *    `inputClassName` 로 덮는다. Input base 는 `rounded-md` / `py-[14px]` /
 *    `text-[15px]` 이므로 S13a 값(`rounded-full` / `py-[10px]` / `text-[13px]`,
 *    bg-2 는 base 와 동일)으로 last-wins 오버라이드한다.
 *  - 전송 버튼은 **IconButton**(P15) + ArrowUp 글리프. accent 원형 + white 글리프는
 *    기본 variant 에 없다. IconButton 은 글리프 색을 variant 로만 정하므로(색 override
 *    prop 없음), white 글리프가 나오는 `glass` variant 를 쓰고 그 배경(bg-glass-dark)을
 *    `bg-accent` 로 className last-wins 오버라이드한다(ProfileHero 의 edit anchor 와
 *    동일 패턴). 32px 박스는 IconButton `size={32}` 그대로.
 *
 * 제어:
 *  - `value` / `onChange` 로 텍스트를 제어한다(controlled). 비제어로 두려면 둘 다
 *    생략 가능(Input 이 자체 상태).
 *  - `onSend` 는 전송 버튼 탭 시 호출. `sendDisabled` 면 버튼을 비활성(투명도 + 탭
 *    차단)한다 — 보통 입력이 비었을 때 caller 가 `value.trim() === ''` 로 넘긴다.
 *  - `charcount` 지정 시 입력 우측 위에 'N / max' 카운트(Text meta)를 띄운다
 *    (매트릭스 X9 charcount). 표시만 담당하며 글자수 강제(truncate)는 caller 책임.
 *
 * 규칙(DS 강제 D-04): inline style / raw hex / StyleSheet 금지. 색은 토큰
 * className 으로만. HTML 치수(10/14/8/32px 등)는 NativeWind 임의값 className.
 */

export interface InputBarProps extends Omit<ViewProps, 'children'> {
  /** 입력 값(controlled). onChange 와 함께 사용. */
  value?: string;
  /** 입력 변경 핸들러(controlled). TextInput onChangeText 와 동일 시그니처. */
  onChange?: (text: string) => void;
  /** 전송(전송 버튼 탭) 핸들러. */
  onSend?: () => void;
  /**
   * 전송 버튼 비활성 여부. true 면 탭이 막히고 투명도가 낮아진다.
   * 보통 입력이 비었을 때 caller 가 `value.trim() === ''` 를 넘긴다.
   */
  sendDisabled?: boolean;
  /** 글자수 카운트(예: { count, max }). 지정 시 입력 위에 'N / max' meta 를 표시. */
  charcount?: { count: number; max: number };
  /** placeholder (기본: 'メッセ지 입력' 대신 HTML 값 '메시지 입력 (@로 귓속말)'). */
  placeholder?: string;
  /** 전송 버튼 접근성 라벨. 기본 '전송'. */
  sendAccessibilityLabel?: string;
  /** 입력 우측 보조 노드(전송 버튼 앞에 끼울 액션 등). 보통 미사용. */
  children?: ReactNode;
  /** 입력 TextInput ref. */
  inputRef?: React.Ref<TextInput>;
  /** 귓속말 대상. null이면 일반 전체채팅 모드(기존 동작 유지). */
  whisperTarget?: { name: string; avatarInitial?: string; avatarBg?: string } | null;
  /** 귓속말 대상 칩 × 탭 — 귓속말 모드 해제. */
  onClearWhisper?: () => void;
  className?: string;
}

/**
 * S13a `.input-bar` 컨테이너 — paper 표면 / 상단 라인 / 패딩 10·14·14.
 * 귓속말 칩 헤더를 입력행 위에 얹기 위해 컨테이너는 column 으로 두고, 실제 입력
 * 가로 정렬(`flex-row items-center gap-8`)은 내부 ROW 에서 담당한다.
 * (border-top 1px var(--line) → `border-t border-line`)
 */
const BAR_CLASS = 'border-t border-line bg-paper px-[14px] pt-[10px] pb-[14px]';

/** 입력행 — 기존 `.input-bar` 가로 정렬(gap 8 / center). */
const ROW_CLASS = 'flex-row items-center gap-[8px]';

/**
 * S13a `.input-bar input` 오버라이드 — Input base(rounded-md/py-14/text-15)를
 * pill 형태(rounded-full/py-10/text-13)로 덮는다. bg-2/ink/px-14 는 base 와 동일.
 */
const INPUT_OVERRIDE_CLASS = 'rounded-full py-[10px] text-[13px]';

export const InputBar = forwardRef<View, InputBarProps>(function InputBar(
  {
    value,
    onChange,
    onSend,
    sendDisabled = false,
    charcount,
    placeholder = '메시지 입력 (@로 귓속말)',
    sendAccessibilityLabel = '전송',
    children,
    inputRef,
    whisperTarget = null,
    onClearWhisper,
    className,
    ...rest
  },
  ref,
) {
  const whisperActive = whisperTarget != null;
  // 귓속말 모드면 대상에게만 보이는 안내 placeholder, 아니면 기존 기본값 유지.
  const effectivePlaceholder = whisperActive
    ? `${whisperTarget.name}에게만 보이는 귓속말…`
    : placeholder;

  return (
    <View
      ref={ref}
      className={cn(
        BAR_CLASS,
        // 귓속말 모드 시 accent 톤으로 강조(보더+soft 배경). 색은 토큰 className 만.
        whisperActive && 'border-accent bg-accent-soft',
        className,
      )}
      {...rest}
    >
      {/* 귓속말 대상 칩 헤더 — 입력행 위. × 탭으로 귓속말 해제. */}
      {whisperActive ? (
        <View testID="input-bar-whisper-chip" className="mb-[8px] flex-row">
          <Chip
            variant="default"
            label={whisperTarget.name}
            avatar={
              <Avatar initial={whisperTarget.avatarInitial} size={20} bg={whisperTarget.avatarBg} />
            }
            removable
            onRemove={onClearWhisper}
            removeTestID="input-bar-whisper-clear"
          />
        </View>
      ) : null}

      <View className={ROW_CLASS}>
        {/* 입력 필드 + (옵션) 글자수 카운트 — flex 1 로 가용폭 차지 */}
        <View className="flex-1">
          {charcount != null ? (
            // 매트릭스 X9 charcount — 입력 위 우측 정렬 meta ('N / max').
            <Text
              variant="meta"
              tone="ink-3"
              tabularNums
              className="mb-[4px] self-end"
              testID="input-bar-charcount"
            >
              {`${charcount.count} / ${charcount.max}`}
            </Text>
          ) : null}
          <Input
            ref={inputRef}
            value={value}
            onChangeText={onChange}
            onSubmitEditing={onSend}
            placeholder={effectivePlaceholder}
            returnKeyType="send"
            // S13a pill 형태 오버라이드. className(field 컨테이너 여백)은 0.
            className="m-0"
            inputClassName={INPUT_OVERRIDE_CLASS}
            testID="input-bar-input"
          />
        </View>

        {children}

        {/* 전송 버튼 — IconButton glass(white 글리프) 위에 accent 원형 배경 오버라이드. */}
        <IconButton
          glyph={ArrowUp}
          // glass = white 글리프(color.paper). 배경 bg-glass-dark 는 아래 className 으로 덮음.
          variant="glass"
          size={32}
          iconSize={16}
          accessibilityLabel={sendAccessibilityLabel}
          accessibilityState={{ disabled: sendDisabled }}
          disabled={sendDisabled}
          onPress={onSend}
          // .send: 32×32 accent 원형. glass 기본 bg-glass-dark 를 accent 로 last-wins.
          // 비활성 시 투명도 40%(HTML 비명시 — disabled 관용 표현, 토큰 색 유지).
          className={cn('bg-accent', sendDisabled && 'opacity-40')}
          testID="input-bar-send"
        />
      </View>
    </View>
  );
});

InputBar.displayName = 'InputBar';
