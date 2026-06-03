import { forwardRef, memo, useMemo, type ComponentType, type ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '../primitives/Text';
import { EmptyBlob, type EmptyBlobTone } from '../primitives/EmptyBlob';
import { cn } from '../lib/cn';

/**
 * GridRoom (X10) — ★시그니처 패턴. 매칭 후 홈 ③b 언블러 모드(JSON `S13`).
 *
 * SSOT: all-screens 와이어프레임 8셀 방(HTML `.s12` — JSON id `S13`) +
 * 커버리지 매트릭스 §X10. 합성: Avatar(presence)·Card/cell·Text·EmptyBlob.
 *
 * 구성:
 *  1) Timestrip — 과거~현재 시간대 row. now 칩은 ink 채움/white(P/§TimeChip),
 *     default 칩은 ink-4. 좌우 chevron + 스와이프 hint. (시간대 회상)
 *  2) 8셀 그리드 — 2-col(1fr 1fr) gap 4px, padding 0 12px, 행 우선 배치
 *     (좌=본인 성별 / 우=반대 성별). 각 셀 aspect 3/4, radius r-md(14px), overflow-hidden.
 *     - filled: 영상 썸네일(그라데이션 placeholder/media) + presence avatar + 닉 + 업로드 시각(hr).
 *     - empty : dark 배경 + EmptyBlob(zzz 얼굴) + "이름 · 안 올림" 라벨.
 *
 * 색 처리(DS D-04 / 매트릭스 §3):
 *  - now 칩=토큰 ink, 시간 라벨=ink-4, 셀 라운드=r-md(=14px, HTML r14 정확 일치).
 *  - 셀 그라데이션 8종(bg-a~h)은 §3B 장식 placeholder → **패턴 내부 상수 배열**
 *    `CELL_GRADIENTS`. 실데이터 시 `media` slot(이미지)으로 대체. inline style 미사용:
 *    `GradientComponent`(expo-linear-gradient `LinearGradient` 주입)의 `colors` prop 으로 전달.
 *    시그니처 화면이라 8-way 시각 구분이 정체성이므로 그라데이션 주입을 옵션으로 둔다.
 *    미주입 시엔 FullscreenVideo 와 동일하게 토큰 단색(`bg-bg-2`)으로 degrade —
 *    `@dei/ui` 를 Expo 에 비결합 유지(D-04 inline style 회피).
 *  - empty 셀 dark 배경/EmptyBlob 색은 §3B 패턴 상수(EmptyBlob 참조).
 */

/** 셀 썸네일 placeholder 그라데이션 키(HTML bg-a~h). */
export type CellGradient =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h';

// §3B 패턴 내부 상수 — 8종 135° 선형 그라데이션(영상 썸네일 자리표시, 의미 없음).
// HTML `.bg-a..bg-h` 값 그대로. GradientComponent.colors 로 전달(inline style 아님).
export const CELL_GRADIENTS: Record<CellGradient, readonly [string, string]> = {
  a: ['#c9a584', '#6b4a2a'],
  b: ['#f5d4a3', '#c08b5c'],
  c: ['#8aa6c4', '#4a6079'],
  d: ['#d4d9e0', '#8a93a0'],
  e: ['#4a3a6a', '#1f1535'],
  f: ['#a3c995', '#5a8044'],
  g: ['#c7c0d4', '#6a5f80'],
  h: ['#e8a3c0', '#a35070'],
};

/** expo-linear-gradient `LinearGradient` 와 호환되는 최소 인터페이스. */
export interface GradientComponentProps {
  colors: readonly string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: unknown;
  className?: string;
}

export interface GridRoomFilledCell {
  kind?: 'filled';
  name: string;
  /** 멤버 user_id — 아바타 탭 → 멤버 프로필(S14) 정확 매칭용(이름 문자열 매칭 대체). */
  userId?: string;
  initial?: string;
  uploadTime: string;
  gradient?: CellGradient;
  media?: ReactNode;
  present?: boolean;
  videoId?: string;
  /**
   * 멤버 프로필 사진 URL(서명된 https). 지정 시 presence 아바타가 이니셜 대신
   * 원형 이미지로 렌더하며, 미지정/로드 실패 전까지 `initial` 폴백. expo-image
   * memory-disk 캐시 → 재렌더/재진입 시 네트워크 왕복 없이 즉시 표시.
   */
  photoUrl?: string;
}

/** 아직 영상을 안 올린 셀. */
export interface GridRoomEmptyCell {
  kind: 'empty';
  /** 멤버 표시 이름. */
  name: string;
  /** EmptyBlob 얼굴 색. */
  tone?: EmptyBlobTone;
  /** 라벨 보조 문구. 기본 '안 올림'. */
  label?: string;
  /** 자기 자신 셀 — onCellPress 분기용. */
  isSelf?: boolean;
  /** 멤버 user_id — 자기 셀 fallback 매칭용. */
  userId?: string;
  /** 현재 시간대에서 자기 자신 셀로 촬영 가능한 경우만 true (보라색 face 표시). */
  canRecord?: boolean;
}

export type GridRoomCell = GridRoomFilledCell | GridRoomEmptyCell;

/** Timestrip 시간 마커. */
export interface GridRoomTimeSlot {
  /** 표시 라벨(예: '11', '14:00'). */
  label: string;
  /** 현재 시간대 여부(ink 채움 pill). */
  isNow?: boolean;
}

export interface GridRoomProps extends ViewProps {
  timeStrip?: GridRoomTimeSlot[];
  timeHint?: string;
  cells: GridRoomCell[];
  GradientComponent?: ComponentType<GradientComponentProps>;
  onCellPress?: (cell: GridRoomCell, index: number) => void;
  /** 아바타+이름 영역 탭(→ 멤버 프로필). filled·empty 셀 모두 발생(둘 다 userId 보유). */
  onAvatarPress?: (cell: GridRoomCell, index: number) => void;
  onTimeSlotPress?: (slotIndex: number, slot: GridRoomTimeSlot) => void;
  className?: string;
}

function isEmpty(cell: GridRoomCell): cell is GridRoomEmptyCell {
  return cell.kind === 'empty';
}

/** 셀 배열을 행 우선 2칸 묶음으로 분할(원래 인덱스 보존). */
function chunkPairs(
  cells: GridRoomCell[],
): { cell: GridRoomCell; index: number }[][] {
  const rows: { cell: GridRoomCell; index: number }[][] = [];
  cells.forEach((cell, index) => {
    if (index % 2 === 0) rows.push([]);
    rows[rows.length - 1].push({ cell, index });
  });
  return rows;
}

/** Timestrip 한 칸. now=ink 채움/white, default=ink-4. */
function TimeChip({ slot }: { slot: GridRoomTimeSlot }) {
  if (slot.isNow) {
    return (
      <View
        testID="gridroom-now-pill"
        className="rounded-full bg-ink px-[12px] py-[6px]"
        accessibilityRole="text"
      >
        <Text
          className="text-base font-extrabold text-paper tracking-tight"
          tabularNums
        >
          {slot.label}
        </Text>
      </View>
    );
  }
  return (
    <View className="rounded-full px-[8px] py-[4px]">
      <Text className="text-sm font-bold text-ink-4" tabularNums>
        {slot.label}
      </Text>
    </View>
  );
}

const PresenceAvatar = memo(function PresenceAvatar({
  initial,
  present,
  photoUrl,
  index,
}: {
  initial: string;
  present: boolean;
  /** 멤버 프로필 사진 URL(서명된 https). 지정 시 이니셜 대신 원형 이미지. */
  photoUrl?: string;
  /** 셀 인덱스 — testID 분리용(empty 셀은 미지정). */
  index?: number;
}) {
  const photoTestID = index != null ? `gridroom-avatar-photo-${index}` : undefined;
  const initialTestID = index != null ? `gridroom-avatar-initial-${index}` : undefined;
  return (
    // shrink-0: 이름 라벨과 같은 flex-row 안에 있어, 긴 이름이면 원이 가로 압축돼
    // 타원이 되는 것을 막는다(정사각 보존).
    <View className="relative w-[22px] h-[22px] shrink-0">
      <View className="w-[22px] h-[22px] items-center justify-center overflow-hidden rounded-full border-[1.5px] border-accent bg-[rgba(0,0,0,0.35)]">
        {photoUrl != null ? (
          // 프로필 이미지: 원형 컨테이너를 가득 채우는 cover 이미지(이니셜 폴백 대체).
          // cachePolicy=memory-disk + recyclingKey: 한 번 받은 아바타는 디스크+메모리
          // 캐시 → 재렌더/재진입 시 네트워크 왕복 없이 즉시 표시(Avatar primitive 와 동일).
          <Image
            testID={photoTestID}
            source={{ uri: photoUrl }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={photoUrl}
            transition={120}
            className="w-[22px] h-[22px] rounded-full"
          />
        ) : (
          <Text testID={initialTestID} className="text-2xs font-bold text-paper">
            {initial}
          </Text>
        )}
      </View>
      {present ? (
        <View className="absolute -bottom-[2px] -right-[2px] w-[8px] h-[8px] rounded-full bg-accent border border-paper" />
      ) : null}
    </View>
  );
});

const CellBackground = memo(function CellBackground({
  cell,
  GradientComponent,
}: {
  cell: GridRoomFilledCell;
  GradientComponent?: ComponentType<GradientComponentProps>;
}) {
  if (cell.media) {
    return <View className="absolute inset-0">{cell.media}</View>;
  }
  const colors = CELL_GRADIENTS[cell.gradient ?? 'a'];
  if (GradientComponent) {
    return (
      <GradientComponent
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="absolute inset-0"
      />
    );
  }
  return (
    <View testID="gridroom-cell-bg-fallback" className="absolute inset-0 bg-bg-2" />
  );
});

const FilledCell = memo(
  function FilledCell({
    cell,
    index,
    GradientComponent,
    onCellPress,
    onAvatarPress,
  }: {
    cell: GridRoomFilledCell;
    index: number;
    GradientComponent?: ComponentType<GradientComponentProps>;
    onCellPress?: GridRoomProps['onCellPress'];
    onAvatarPress?: GridRoomProps['onAvatarPress'];
  }) {
    const initial = cell.initial ?? cell.name.charAt(0);
    return (
      <Pressable
        testID={`gridroom-cell-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`${cell.name} 영상 — ${cell.uploadTime}`}
        onPress={onCellPress ? () => onCellPress(cell, index) : undefined}
        className="relative aspect-[3/4] overflow-hidden rounded-md"
      >
        <CellBackground cell={cell} GradientComponent={GradientComponent} />
        <Pressable
          testID={`gridroom-avatar-${index}`}
          accessibilityRole="button"
          accessibilityLabel={`${cell.name} 프로필`}
          onPress={
            onAvatarPress ? () => onAvatarPress(cell, index) : undefined
          }
          className="absolute left-[8px] top-[8px] flex-row items-center gap-[5px]"
        >
          <PresenceAvatar
            initial={initial}
            present={cell.present ?? true}
            photoUrl={cell.photoUrl}
            index={index}
          />
          <Text className="text-2xs font-bold text-paper">{cell.name}</Text>
        </Pressable>
        <View className="absolute inset-0 items-center justify-center">
          <Text
            className="text-3xl font-black text-paper tracking-tight"
            tabularNums
          >
            {cell.uploadTime}
          </Text>
        </View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.cell.videoId === next.cell.videoId &&
    prev.cell.uploadTime === next.cell.uploadTime &&
    prev.cell.present === next.cell.present &&
    prev.cell.photoUrl === next.cell.photoUrl &&
    prev.index === next.index,
);

const EmptyCell = memo(function EmptyCell({
  cell,
  index,
  onCellPress,
  onAvatarPress,
}: {
  cell: GridRoomEmptyCell;
  index: number;
  onCellPress?: GridRoomProps['onCellPress'];
  onAvatarPress?: GridRoomProps['onAvatarPress'];
}) {
  const initial = cell.name.charAt(0);
  return (
    <Pressable
      testID={`gridroom-cell-${index}`}
      accessibilityRole="button"
      accessibilityLabel={`${cell.name} — ${cell.label ?? '안 올림'}`}
      onPress={onCellPress ? () => onCellPress(cell, index) : undefined}
      className="relative aspect-[3/4] overflow-hidden rounded-md bg-[#1A1A1A]"
    >
      {/* 아바타+이름 영역 탭 → 멤버 프로필(filled 셀과 동일). 영상 없는 'Zzz..'
          셀에서도 프로필 진입이 되도록 별도 Pressable 로 묶는다. */}
      <Pressable
        testID={`gridroom-avatar-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`${cell.name} 프로필`}
        onPress={onAvatarPress ? () => onAvatarPress(cell, index) : undefined}
        className="absolute left-[8px] top-[8px] flex-row items-center gap-[5px]"
      >
        <PresenceAvatar initial={initial} present={false} />
        <Text className="text-2xs font-bold text-paper">{cell.name}</Text>
      </Pressable>
      <View className="absolute inset-0 items-center justify-center">
        {cell.canRecord ? (
          <EmptyBlob tone="purple" size={120} />
        ) : (
          <Text className="text-3xl font-black text-paper/40 tracking-tight">Zzz..</Text>
        )}
      </View>
    </Pressable>
  );
});

export const GridRoom = forwardRef<View, GridRoomProps>(function GridRoom(
  {
    timeStrip,
    timeHint,
    cells,
    GradientComponent,
    onCellPress,
    onAvatarPress,
    onTimeSlotPress,
    className,
    ...rest
  },
  ref,
) {
  const pairs = useMemo(() => chunkPairs(cells), [cells]);

  return (
    <View ref={ref} testID="gridroom" className={cn('bg-bg', className)} {...rest}>
      {timeStrip && timeStrip.length > 0 ? (
        <View className="relative mx-[8px] px-0 pb-[14px] pt-[6px]">
          <View className="absolute left-[6px] top-[6px] bottom-[14px] justify-center">
            <Text className="text-2xs text-ink-4">‹</Text>
          </View>
          <View className="absolute right-[6px] top-[6px] bottom-[14px] justify-center">
            <Text className="text-2xs text-ink-4">›</Text>
          </View>
          <View className="flex-row items-center justify-center gap-[6px]">
            {timeStrip.map((slot, i) => (
              <Pressable
                key={`${slot.label}-${i}`}
                onPress={onTimeSlotPress ? () => onTimeSlotPress(i, slot) : undefined}
                accessibilityRole="button"
                accessibilityLabel={`${slot.label} 시간대`}
              >
                <TimeChip slot={slot} />
              </Pressable>
            ))}
          </View>
          {timeHint ? (
            <Text className="mt-[8px] text-center text-2xs text-ink-4 tracking-wide">
              {timeHint}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="gap-[4px] px-[12px]">
        {pairs.map((pair, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-[4px]">
            {pair.map(({ cell, index }) => (
              <View key={index} className="flex-1">
                {isEmpty(cell) ? (
                  <EmptyCell
                    cell={cell}
                    index={index}
                    onCellPress={onCellPress}
                    onAvatarPress={onAvatarPress}
                  />
                ) : (
                  <FilledCell
                    cell={cell}
                    index={index}
                    GradientComponent={GradientComponent}
                    onCellPress={onCellPress}
                    onAvatarPress={onAvatarPress}
                  />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
});

GridRoom.displayName = 'GridRoom';
