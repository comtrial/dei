# L1 · 영상 파이프라인 Edge Function (인코딩 / 썸네일 / blur / storage cleanup)

- **status**: pending
- **owner**: C (손승태)
- **priority**: P1
- **위치**: `supabase/functions/video-postprocess/index.ts` (신규)
- **선행**: C-0 영상 모듈 (uploadClip 이 'processing' status 로 INSERT)

---

## 1. 목적

`video` row 가 status='processing' 으로 INSERT 된 후의 후처리. 마이그레이션만으론 배포
안 됨 → `supabase functions deploy video-postprocess` 필수 (AGENTS.md §7).

### 다루는 작업

1. **썸네일 생성** — `storage_path` 의 영상에서 frame 1장 → `thumbnail_path` 저장.
2. **blur 썸네일** (S10 미리보기용) — 같은 frame 을 흐리게 처리한 별도 파일.
3. **인코딩 정규화** — 가로 강제·크기 제한·codec 정렬 (옵션).
4. **status 전이** — 'processing' → 'ready' (또는 실패 시 'failed').
5. **storage cleanup** — `room.status='ended'` + 30일 경과 시 storage object 삭제.

---

## 2. 합의 (C-1 §3-4 와 정합)

**🔑 권장 단순화 (PM 우려 대응)**:
- 인코딩 정규화 = **클라 측** (`expo-camera` `videoQuality='720p'` + bitrate cap, C-0 §4-1).
- 썸네일 생성 = **클라 측** (`expo-video-thumbnails`, C-0 §4-2).
- 따라서 **finalize 엔드포인트 기본 불필요** — 클라가 영상+썸네일+row 모두 올리고 'ready' 직접 INSERT.
- 이 Edge Function 의 핵심 책임은 **cleanup / purge / fallback** 만.

`finalize` 엔드포인트는 **fallback 용**만 유지:
- 클라가 썸네일 생성 실패 시 last-resort.
- 또는 'processing' status 30분+ 잔존 row 를 pg_cron 이 호출 → 영상에서 직접 frame 추출.

남은 결정:
- [ ] blur 처리 — 클라 측 BlurView 로 충분 (S10 미리보기). 별도 blur 파일 생성 X.
- [ ] fallback finalize 구현 여부 (CI/CD 비용 vs 신뢰성 트레이드오프).

---

## 3. 구조 제안

```
supabase/functions/video-postprocess/
├── index.ts                   # 진입점
├── handlers/
│   ├── thumbnail.ts           # 프레임 추출 + 업로드
│   ├── markReady.ts           # status='ready' 전이
│   └── cleanup.ts             # 만료 방의 storage 삭제 (cron)
└── lib/
    ├── supabase.ts            # service_role + storage client
    └── ffmpeg.ts              # (옵션) Deno 호환 ffmpeg wasm
```

---

## 4. 엔드포인트 (제안)

### 4-1. `POST /video-postprocess/finalize` (FALLBACK ONLY)
**기본 경로 = 클라가 직접 'ready' INSERT** (C-0/C-1). 이 엔드포인트는 다음 경우만:
- 클라 썸네일 생성 실패 시 (`expo-video-thumbnails` 에러).
- 'processing' status 30분+ 잔존 row 를 pg_cron 이 강제 finalize.

요청: `{ video_id }`
처리:
1. `video` row fetch — storage_path 확인.
2. 프레임 추출 (ffmpeg wasm 또는 별도 service) → `{room_id}/{user_id}/{video_id}.jpg` 업로드.
3. `video.thumbnail_path` + `video.status='ready'` UPDATE.

응답: `{ ok: boolean, thumbnail_path?: string }`

### 4-1b. `POST /video-postprocess/signed-urls-batch` (NEW · C-1 §3-2 정합)
**8셀 grid 가 1 round-trip 으로 모든 signed URL 받기 위함**:

요청: `{ room_id, hour_from, hour_to }`
처리:
1. 본인이 `room_member` 인지 RLS 검증.
2. `video WHERE room_id=? AND hour_slot BETWEEN ?...?` SELECT.
3. 각 row 의 storage_path + thumbnail_path 에 대해 signed URL 발급 (TTL 1h).
4. 페어로 반환.

응답:
```json
{
  "videos": [
    { "video_id": "...", "user_id": "...", "hour_slot": 14, "video_url": "...", "thumbnail_url": "..." }
  ]
}
```

→ S13 grid 진입 / timestrip 시간대 변경 시 클라가 한 번에 받음.

### 4-2. `POST /video-postprocess/cron-purge` (인증된 cron)
주기적:
1. `room WHERE status='ended' AND ended_at < now() - 30d` 의 모든 `video.storage_path` + `thumbnail_path` 삭제.
2. `video` row 도 hard delete (이미 cascade 로 처리되면 생략).
3. **추가**: `status='processing'` AND `created_at < now() - 30min` 의 row 들 → finalize fallback 호출 (위 §4-1) 또는 'failed' 전이.

### 4-3. (선택) `POST /video-postprocess/account-purge`
사용자 계정 삭제 요청 시 24h 내 hard delete (`POLICY.video.purgeOnAccountDeletionHours=24`).
S20 회원 탈퇴 → 백오피스가 호출 또는 cron 이 처리.

---

## 5. 구현 체크리스트

### 5-1. finalize
- [ ] service_role client 로 `video` row SELECT.
- [ ] storage object 다운로드 → 프레임 1 추출 (영상 0초 또는 중간).
- [ ] **ffmpeg wasm Deno 어려움** → 대안: `expo-video-thumbnails` 로 클라에서 생성 후 첨부 업로드. Edge 에서는 status='ready' 전이만.
  - **권장 단순화**: 클라가 썸네일도 같이 업로드, Edge 는 status 전이만 담당.
- [ ] `thumbnail_path` + `status='ready'` UPDATE.

### 5-2. cleanup (cron)
- [ ] `video` JOIN `room` 으로 만료 대상 추출.
- [ ] `supabase.storage.from('room-videos').remove([...paths])`.
- [ ] 30일 경과 + ended 방의 video row delete (cascade 안 걸려있으면).

### 5-3. account-purge
- [ ] target_user_id 의 모든 video storage + row hard delete.
- [ ] auth 트리거 (`auth.users` DELETE trigger) 와 정합 — A 측 회원 탈퇴 (S20) 핸들러와 인터페이스 합의.

### 5-4. 마이그레이션 (필요 시)
- [ ] Storage 버킷 `room-videos` + `room-thumbnails` 생성 (C-0 에서 이미 다룬다면 중복 X).
- [ ] 버킷 RLS: 같은 `room_member` 만 read, service_role 만 write.

### 5-5. 배포 (AGENTS.md §7)
- [ ] `supabase functions deploy video-postprocess`.
- [ ] 클라 (`uploadClip`) 에서 `supabase.functions.invoke('video-postprocess/finalize', ...)` 호출 확인.
- [ ] **AGENTS.md §7: Edge Function 경로 e2e 필수**.

---

## 6. 테스트

- **integration (CI 실DB)**: video INSERT 'processing' → finalize 호출 → 'ready' 전이 + thumbnail_path 채워짐.
- **integration**: cleanup → 만료 방의 storage object 삭제 확인.
- **e2e-realdb 필수**: 실 영상 업로드 → finalize → S13 grid 에 썸네일 표시.

---

## 7. 위험

- **ffmpeg wasm Deno 한계** — 권장 단순화(클라 썸네일) 안 따르면 막힐 수 있음.
- **storage 비용** — 30일 retention 정확히 지키지 않으면 비용 폭증. cron 누락 모니터링.
- **race**: uploadClip → finalize 사이 클라 종료 → finalize 미호출 → 'processing' 영구 잔존. **fallback**: pg_cron 으로 'processing' 30분+ row 를 'failed' 전이.
- **blur 처리** — 클라 BlurView 만 사용한다면 raw 영상이 storage 에 있고 클라가 blur — 정책상 문제 없는지 확인 필요 (보통 OK, 다른 멤버 클라는 blur 강제).

---

## 8. 발생 이벤트 / Realtime

- `video.status='ready'` UPDATE → C-0b 의 `useRoomVideos` 가 INSERT 가 아닌 UPDATE 도 구독하면 자동 표시.
  - 또는 클라 uploadClip → finalize → 응답 받고 직접 갱신 (낙관적 업데이트).

---

## 9. 완료 정의

- [ ] Edge Function 3 엔드포인트 (finalize / cleanup / account-purge) 배포.
- [ ] storage 버킷 + RLS 설정.
- [ ] integration + e2e-realdb 통과.
- [ ] **`supabase functions deploy video-postprocess` 실행 완료**.
- [ ] cron 설정 (pg_cron 또는 Edge scheduler) 확인.
- [ ] A 1차 리뷰.
