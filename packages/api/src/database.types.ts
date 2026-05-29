// 임시 stub — Phase 4(rooms v2 스키마 베이스라인 → `pnpm db:gen-types`)에서
// Supabase 가 생성한 실제 타입으로 덮어쓴다. zero-base 전환 중 client.ts 가
// 컴파일되도록 최소 형태만 유지한다.
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
