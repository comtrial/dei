# S13a 채팅 오버레이 UX 스펙 (UX 전문가 자문)

2026-06-03 · 매칭된 방 영상 위에 채팅을 띄울 때의 표면·가독성·전환 결정.
구현은 이 수치 그대로 따른다(토큰 className / arbitrary value).

## 결정 요약
- **표면**: 영상 위 **dark scrim** + 채팅 콘텐츠 **불투명**. (translucent white X, blur X)
- **블러 안 씀**: 재생 중 영상 위 full-screen BlurView 는 중급 단말 성능 최악. flat scrim 이 싸고 결정적.
- **전환**: 300ms cross-fade (slide 아님 — "방 위에 얹힌 레이어" 인지). 종료 200ms 역페이드.

## 정확한 값
| 레이어 | 값 | 이유 |
|---|---|---|
| 영상 dim scrim(전체, 콘텐츠 뒤) | `bg-[rgba(0,0,0,0.45)]` | 영상 인지 + 흰 텍스트 가독. .4 미만 텍스트 약함 / .55 초과 방 존재감 상실 |
| 본문 스크롤 영역 배경 | `bg-transparent` | 빈 간격으로 dimmed 영상이 비쳐 "방에 있음" 유지 |
| 헤더 band | `bg-[rgba(0,0,0,0.62)]` + 하단 `border-b border-[rgba(255,255,255,0.12)]` | 상단 컨트롤·제목 대비 floor 고정 |
| 컴포저 band | `bg-[rgba(0,0,0,0.62)]` | 입력/전송 항상 가독 |
| safe-area top/bottom inset 채움 | 헤더/컴포저와 동일 `.62` | 노치/홈인디케이터 뒤 밝은 영상 슬라이버 방지 |

## 가독성 보호
- **버블은 항상 불투명**: 받은=`bg-bg-2`+`text-ink`, 내것=`bg-ink`+`text-white`(또는 accent). 페이지 투명도 상속 금지.
- 버블 없는 흰 라벨(타임스탬프/방종료/날짜구분)엔 text-shadow: `color rgba(0,0,0,.6)`, `radius 3`, `offset {0,1}`.
- 헤더/컴포저는 band 로 자기 floor 확보. 본문만 transparent.

## 본문/헤더 투명도
- 버블·헤더·컴포저 전부 **불투명**. 페이지 간격(스크롤 배경)만 transparent. 이게 가장 중요한 가독성 규칙.

## 구조(확정)
- 채팅을 room/index 위 **transparentModal** 로 띄움 → 뒷 영상 *동일 인스턴스* 계속 재생.
- 루트 transparent + scrim. 헤더/컴포저 dark band. 본문 transparent. 버블 불투명.
