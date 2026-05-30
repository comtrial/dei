export * from './client';
// Phase 4 에서 rooms v2 스키마 베이스라인 → `pnpm db:gen-types` 로 재생성됨.
// 스키마 변경 시 항상 `pnpm db:gen-types` 를 다시 돌려 이 타입을 동기화한다.
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from './database.types';
export * from './schemas/sendMessage';
