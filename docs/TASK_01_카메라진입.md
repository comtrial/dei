# TASK · 01 카메라 진입 (Camera Entry Flow)

> **작업 범위**: 로그 촬영 화면 진입 플로우 — 3개 상태 구현  
> **레퍼런스 이미지**: `01_카메라진입_캡처.png` (첨부 참고)  
> **담당**: 손승태 · collaborator 최승원  
> **우선순위**: P0

---

## 📐 구현 대상 화면 (3개)

| ID | 상태 | 컴포넌트 유형 |
|----|------|--------------|
| 01A | CAMERA IDLE — 촬영 대기 | Screen (풀스크린) |
| 01B | PERMISSION — 권한 요청 | Bottom Sheet Modal |
| 01C | OVERWRITE — 덮어쓰기 확인 | Dialog |

---

## 🎨 디자인 토큰

```
배경 (카메라 뷰): #1A1008  (다크 브라운-블랙)
배경 (다이얼로그): #F5EDDB  (크림/베이지)
텍스트 메인:     #171310
텍스트 서브:     #6E6354
버튼 Primary:   #C0432A  (적갈색, danger 계열)
버튼 Secondary: #FFFFFF  (흰 배경 + 테두리)
테두리:          #C9BB9E
Border radius:  12px (다이얼로그), 8px (버튼)
폰트:            -apple-system, 'Pretendard', sans-serif
```

---

## 01A · CAMERA IDLE (촬영 대기)

### 레이아웃
- 풀스크린 카메라 뷰파인더 (배경 `#1A1008`)
- 상단 바 (좌→우): `[X 닫기]` — `[00:00 타이머 + 점 인디케이터]` — `[⚡ 플래시]`
- 중앙: 황금색 사각 포커스 프레임 (stroke only, `#C8A84B` 계열)
- 하단 컨트롤 바:
  - 좌: 카메라 전환 버튼 (회전 아이콘)
  - 중앙: 셔터 버튼 (흰 원, 크고 강조)
  - 우: `NO CLIP` 텍스트 버튼
- 하단 좌측 텍스트: `SEG 1 / 3` · `0.5` · `1×` (강조) · `2` · `2s MAX`
- 하단 좌측 서브: `REAR`

### 주요 인터랙션
```
셔터 버튼 길게 누르기  →  촬영 시작 (진행 링 애니메이션)
[X] 탭               →  촬영 화면 닫기 (홈으로)
카메라 전환 탭        →  전면 ↔ 후면 전환
```

### 진입 조건
- 홈 탭바 「로그 촬영」 탭 → 권한 확인 → 권한 있으면 바로 이 화면
- 최초 진입 1회: 권한 없으면 01B로 먼저 이동
- 오늘 이미 클립 존재하면: 01C 먼저 노출

---

## 01B · PERMISSION (권한 요청)

### 레이아웃
- 배경: 카메라 뷰 위에 딤 레이어 (`rgba(0,0,0,0.6)`)
- 바텀 시트 or 센터 모달 (이미지 기준 센터)
  - 배경: `#F5EDDB`
  - border-radius: `12px`
  - 패딩: `24px`

### 컨텐츠
```
제목:  카메라 접근 허용         (font-size: 18px, font-weight: 700)
본문:  dei.가 영상을 촬영하려면  (font-size: 14px, color: #6E6354)
       카메라와 마이크 접근이 필요합니다.

버튼 (가로 2열):
  [허용 안 함]  →  Secondary 버튼 (흰 배경, 테두리)
  [허용]        →  Primary 버튼 (다크, #171310 배경)
```

### 인터랙션
```
[허용 안 함]  →  모달 닫기, 카메라 화면 진입 취소 (홈으로)
[허용]        →  OS 권한 팝업 호출 → 허용 시 01A, 거부 시 권한 안내 화면(R1)
```

### 정책
- 최초 진입 1회만 노출
- 거부 시: 설정 앱 유도 하단 시트 노출 (R1 화면)

---

## 01C · OVERWRITE (덮어쓰기 확인)

### 레이아웃
- 배경: 카메라 뷰 위에 딤 레이어
- 센터 다이얼로그
  - 배경: `#F5EDDB`
  - border-radius: `12px`
  - 패딩: `24px`

### 컨텐츠
```
제목:  오늘 클립을 다시 촬영할까요?   (font-size: 18px, font-weight: 700)
본문:  이미 업로드된 오늘의 영상이 교체됩니다.
       이전 클립은 복구되지 않아요.   (font-size: 14px, color: #6E6354)

버튼 (가로 2열):
  [취소]      →  Secondary 버튼
  [다시 촬영]  →  Danger 버튼 (#C0432A 적갈색 배경, 흰 텍스트)
```

### 인터랙션
```
[취소]      →  다이얼로그 닫기, 홈으로 복귀
[다시 촬영]  →  기존 클립 교체 확정 → 01A 진입
```

### 정책
- **danger 버튼**: 되돌릴 수 없는 작업이므로 Primary(`#C0432A`) 강조 필수
- 오늘 클립 이미 존재 시에만 노출 (서버 or 로컬 상태 확인 후 분기)

---

## 🔗 화면 전환 플로우

```
홈 탭바 [촬영] 탭
    │
    ├─ 권한 없음 ──────────────→ [01B PERMISSION]
    │                               ├─ 허용 → [OS 권한 팝업]
    │                               │          ├─ 승인 → 아래 분기
    │                               │          └─ 거부 → [R1 권한 안내]
    │                               └─ 허용 안 함 → 홈
    │
    ├─ 오늘 클립 존재 ──────────→ [01C OVERWRITE]
    │                               ├─ 다시 촬영 → [01A CAMERA IDLE]
    │                               └─ 취소 → 홈
    │
    └─ 권한 있음 + 클립 없음 ───→ [01A CAMERA IDLE]
                                    └─ 셔터 → 촬영 시작 (R3/R4 플로우)
```

---

## ⚙️ 구현 시 주의사항

1. **Expo Camera**: `expo-camera` v14+ API 기준, `useCameraPermissions()` hook 사용
2. **권한 분기**: `permission.status === 'undetermined'` → 01B, `denied` → R1(설정 유도), `granted` → 클립 존재 확인
3. **클립 존재 확인**: Supabase `logs` 테이블에서 오늘 날짜 + 현재 유저 조회
4. **다이얼로그**: `Modal` 컴포넌트 + `backdropColor` 딤 처리
5. **셔터 버튼**: `LongPressGestureHandler` 사용 (3초 이상 누를 때 촬영 시작)
6. **포커스 프레임**: SVG rect or `View` border로 중앙 배치

---

## 📁 파일 구조 (예상)

```
src/
  screens/
    recording/
      CameraScreen.tsx        ← 01A
  components/
    modals/
      CameraPermissionSheet.tsx  ← 01B
      OverwriteConfirmDialog.tsx ← 01C
  hooks/
    useCameraPermission.ts
    useTodayClip.ts
```

---

## ✅ 완료 기준 (Definition of Done)

- [ ] 01A: 카메라 뷰파인더 렌더링, 셔터/전환/닫기 버튼 동작
- [ ] 01B: 권한 없을 때 자동 노출, 허용/거부 분기 처리
- [ ] 01C: 오늘 클립 존재 시 자동 노출, danger 버튼 스타일 적용
- [ ] 3개 상태 전환 플로우 정상 동작
- [ ] 디자인 토큰 (색상, radius, 폰트) 일치
