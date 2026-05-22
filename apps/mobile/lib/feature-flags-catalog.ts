/**
 * 앱이 렌더 가능한 flag variant 카탈로그. register-flags 스크립트가 이걸
 * Supabase feature_flags.kind/options 에 등록한다(메타만; 값/enabled 불가침).
 * source of truth = 이 파일. admin(dei-admin)은 DB 를 읽고, 비어있으면 자체
 * 복사본 카탈로그로 폴백한다.
 */
export type FlagCatalogOption = { value: string; label: string; description?: string };

export type FlagCatalogEntry = {
  kind: "screen-variant" | "boolean-toggle" | "multivariate";
  description?: string;
  options: FlagCatalogOption[];
};

export const FLAG_CATALOG: Record<string, FlagCatalogEntry> = {
  home_top_layout: {
    kind: "screen-variant",
    description: "홈 상단 영역 variant",
    options: [
      { value: "A", label: "무압박 (로고만)" },
      { value: "B", label: "반응통계 카드" },
      { value: "C", label: "리프레시 압박 카드" },
    ],
  },
  curation_layout: {
    kind: "screen-variant",
    description: "홈 큐레이션 레이아웃",
    options: [
      { value: "stack3", label: "3명 동시" },
      { value: "single", label: "1명 풀스크린" },
    ],
  },
};
