I now have all the data needed from lines 12-25 (tokens) and 223-860 (component CSS). Let me compile the inventory.

# dei v4 Design System — 토큰 + 컴포넌트 패턴 인벤토리 (SSOT: `/Users/susan/Downloads/all-screens (3).html`)

HTML 원본값 그대로. `@dei/ui` 패키지 초안 구조: `tokens/` · `primitives/` · `patterns/`.

---

## (1) `:root` 토큰 (라인 12–25) — 카테고리별

### 색 — 표면/배경 (surface)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#FFFFFF` | 앱 기본 배경 / device 배경 |
| `--paper` | `#FFFFFF` | 카드·시트·네비 표면 (bg 와 동일값이나 의미 분리) |
| `--bg-2` | `#F4F4F6` | 인풋/칩/secondary 버튼/info 박스 채움 |
| `--bg-3` | `#FAFAFB` | locked 필드 / 테이블 헤더 미묘한 톤 |

### 색 — ink 스케일 (텍스트/전경 그라데이션)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--ink` | `#191919` | 본문/제목/primary(검정) 버튼 배경 |
| `--ink-2` | `#3D3D44` | 보조 본문 / secondary 버튼 텍스트 |
| `--ink-3` | `#76767D` | 캡션 / muted / placeholder 톤 |
| `--ink-4` | `#B5B5BC` | disabled / 가장 약한 보더·체크박스·핸들 |

### 색 — 라인 (구분선)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--line` | `#EDEDF0` | 카드/네비/cta-bottom 보더 |
| `--line-2` | `#F0F0F3` | 리스트 row 구분선 (더 약함) |

### 색 — semantic (accent + status)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--accent` | `#FF2D6F` | 브랜드 핑크. primary(accent) CTA, 활성 상태, dot |
| `--accent-soft` | `#FFE9EF` | accent 배경 칩/배너/whisper bubble |
| `--accent-deep` | `#E5215F` | accent 텍스트 강조 (배너 제목 등) |
| `--warn` | `#C8941A` | 경고 아이콘/보더 |
| `--warn-soft` | `#FFF6D9` | 경고 배너/시트 배경 |
| `--danger` | `#D62D2D` | 위험/삭제 텍스트·아이콘·thumb |
| `--danger-soft` | `#FFE9E9` | 위험 배너/실패 아이콘 배경 |
| `--info` | `#2A6BD9` | 정보 아이콘 |
| `--info-soft` | `#E4EEFC` | 정보 박스 배경 |
| `--success` | `#1F8A4F` | 성공 (정의만 있고 .sNN 내 직접 미사용 — 토큰만 노출) |

> 비표준 하드코딩 색(추출 시 주의, 토큰화 후보): `#7A8DB8`(중립 아바타), `#E07A4F`(내 아바타), empty-blob `#FF1B9D`/`#74E36A`/`#9A7AE8`, 셀 그라데이션 `bg-a~bg-h`, 배너 보더 `#f0c4d6`/`#e8d488`, 배너 텍스트 `#7a1d3e`/`#7a1818`/`#6c5610`/`#1a3f7c`/`#1f4380`. 이들은 토큰 미정의 → primitives 가 아니라 patterns 단계에서 처리하거나 토큰 확장 필요.

### radius
| 토큰 | 값 | 주 용도 |
|---|---|---|
| `--r-sm` | `10px` | 작은 박스/배너/멀티버튼 |
| `--r-md` | `14px` | 인풋/카드/버튼/배너 (가장 빈번) |
| `--r-lg` | `20px` | cta-entry 카드 / 모달 / flow-section |
| `--r-xl` | `24px` | (정의됨; 시트는 `24px` 리터럴 사용) |
| `--r-full` | `9999px` | pill/칩/토글/슬라이드/원형 |

> 시트(`.sheet`)는 `border-radius:24px 24px 0 0` 로 `--r-xl` 값을 **리터럴**로 씀 (토큰 미참조). primitives Sheet 에서 `--r-xl` 로 매핑 권장.

### shadow
| 토큰 | 값 | 비고 |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(0,0,0,.04)` | 토큰 정의됨 (.sNN 내 직접 참조 거의 없음) |

> 실사용 그림자는 리터럴: device `0 16px 40px rgba(0,0,0,.12)`, 메뉴/팝오버 `0 8px 24px rgba(0,0,0,.16)`, 토글 thumb `0 1px 3px rgba(0,0,0,.2)`. → shadow 스케일 토큰(`--shadow-2`, `--shadow-pop`) 추가 후보.

### font
| 토큰 | 값 |
|---|---|
| `--font` | `'Pretendard JP Variable','Pretendard JP','Pretendard Variable','Pretendard',-apple-system,sans-serif` |
| `--font-mono` | `"SF Mono",Menlo,monospace` |

> 타이포 스케일은 토큰화되지 않고 px 리터럴 분산. 관찰된 weight: 500/600/700/800/900. size 빈출: caption 10.5–12.5px, body 13–15px, title 18–26px, display 36/64/108px. letter-spacing: `-.04em ~ -.01em`(제목), `.04em ~ .16em`(kicker/label uppercase). → `tokens/typography` 로 정규화 권장(임의값 변경 금지, 관측값 그대로 토큰명만 부여).

---

## (2)+(3) 컴포넌트 패턴 → 토큰 매핑 → 등장 화면

### Buttons (primitives/Button)
| 변형 | 배경 / 텍스트 | radius | 등장 화면 |
|---|---|---|---|
| **ink (primary 검정)** | `--ink` / white, 16–18px pad, 700 | `--r-md` | S02 cta, S03f/S07a primary, S04/S06 cta-bottom, S23, sCC.keep, sPF primary, sCF primary |
| **accent (primary 핑크)** | `--accent` / white | `--r-md` | S09 cta, S16/S17/S21 cta-bottom, S18 boost, sQE cta, S13a send(원형) |
| **secondary** | `--bg-2` / `--ink-2`, 600 | `--r-md` | S03f/S07a secondary, sCC.cancel, sPF secondary, sCF secondary, S18 later |
| **tertiary/text** | transparent / `--ink-3`, 600 | — | sPF tertiary, S19 later, S21/S23 "나중에" |
| **mini pill CTA** | `--accent` / white, 7×12 | `--r-full` | S05 restrict-banner, S19 pass-card |
| **disabled 상태** | `opacity:.4`(S21/S23) / `.5`(S19 save) → `.on` 으로 활성 | — | S19, S21, S23 |
| **glass(영상 위)** | `rgba(255,255,255,.15)` + `backdrop-filter:blur(8px)` | `--r-md` | S11b secondary |

### Inputs / Fields (primitives/Input, primitives/Textarea, primitives/Select)
- 공통: `background:var(--bg-2); border:0; border-radius:var(--r-md); color:var(--ink); font-family:var(--font); outline:0`. pad 13–14px.
- locked 변형: `background:var(--bg-3); color:var(--ink-3)` (S04 `.field.locked`).
- label `.lbl`: 12px/700/`--ink-2`; helper `.helper`: 11.5px/`--ink-3`; charcount: 10.5px/`--ink-4`.
- select: `.chev` `--ink-4`.
- search variant: `--bg-2` + 좌측 아이콘, input 투명.
- 등장: S04(text/textarea/select), S06(search), S20(etc-input), S21(textarea), S23(input+textarea).

### Card (primitives/Card)
- 기본: `background:var(--paper); border:1px solid var(--line); border-radius:var(--r-md)`.
- cta-entry(큰 카드): `--r-lg`, 아이콘+텍스트+arr row (S05).
- compare card: `.cur`=`--bg-2`, `.now`=`--ink` + radial accent glow overlay (S17).
- info-rows 카드: row 구분 `--line-2`, k=`--ink-3`/v=`--ink` (S16).
- 등장: S05, S16, S17, S18 cta-card, S19 item, planning-panel.

### Sheet — 슬라이드업 (patterns/BottomSheet)
- 컨테이너: scrim `rgba(0,0,0,.55)` + `.behind`(filter:brightness .4~.5) + `.sheet`(`--paper`, `border-radius:24px 24px 0 0`, bottom:0).
- handle: `36×4`, `--ink-4`, radius 2, opacity .5.
- 등장: S13a(채팅), sCC(매칭취소 confirm), sLR(방나가기+reasons+slide), sBR(차단/신고 메뉴).

### Modal — 센터 (patterns/Modal / AlertDialog)
- `position:absolute; top:50%; transform:translateY(-50%)`, `--paper`, `--r-lg`(sPF) 또는 mini(`--r-md`).
- icon-circle: `--danger-soft`/`--danger` (실패), `--warn-soft`/`--warn`(경고).
- 등장: sPF(결제 실패), sCF(촬영 실패 3-mini-modal: permission=warn / hardware=danger / upload=info top-border).

### Toast / Banner (patterns/Banner)
- restrict-banner: `--accent-soft` bg + `#f0c4d6` border, icon-circle `--accent`/white (S05).
- warn-bar: `--warn-soft`, icon `--warn` (S06).
- danger box: `--danger-soft`, icon/b `--danger` (sLR, S20).
- info/assure: `--info-soft` (sPF assure, S23 reply-note, S22 info-card).
- (전용 transient toast 컴포넌트는 HTML 에 없음 — banner 패턴이 SSOT)

### Avatar (primitives/Avatar)
- 원형, 이니셜 텍스트 white/700. 사이즈: 18(item)/22(cell)/24(chip)/28(msg)/30(meta)/34(target)/36(sBR/hero-edit)/38(av-me)/90(hero S19)/120(hero S16).
- 색: `#E07A4F`(나), `#7A8DB8`(상대 중립). cell av 는 `box-shadow:0 0 0 1.5px var(--accent)` 링 + online dot.
- badge dot: `--accent`, border `--paper`/white.
- 등장: S05, S06 chip, S12 cell, S13a msg, S13b meta, S16/S19 hero, S21 target, sBR who.

### Badge / Chip / Pill (primitives/Badge, primitives/Chip)
- chip(S06): `--paper` + `--line` border, `--r-full`, av+name+x. 변형: `.me`(border `--accent`, bdg `--accent-soft`/`--accent`), `.busy`(border `--warn` dashed), `.add`(dashed `--ink-4`).
- tag/pill: `--bg-2`/`--ink-3` 기본; `.must`=`--accent-soft`/`--accent-deep`, `.opt`=`--bg-2`/`--ink-3` (planning-panel comp).
- price badge: `rgba(255,45,111,.12)` / `--accent` (S17).
- age-tag(S02): `--ink` bg/white + inner pill `--accent`.
- profile tag(S16): `--bg-2`/`--ink-2` `--r-full`.
- count pill(S06 nav): `--bg-2`/`--ink-3`.

### Tabbar / Nav (patterns/TopNav)
- top nav: back/close/more 32×32 아이콘 버튼, title 14.5–15px/700, padding `14px 16px 6px`.
- S12 header: ic-btn 원형 `1.5px --line` border + `--paper`.
- (하단 탭바 컴포넌트는 이 HTML 에 없음 — nav 는 상단 only)

### Progress bar (primitives/Progress)
- 멀티스텝 bar(S04): track `--bg-2` h4 r2, fill `--accent` width 33%/66%(`.f2`)/100%(`.f3`).
- video progress(S13b): track `rgba(255,255,255,.2)` h3, fill white 55%.
- story progress(S18): segment dots, `.done`=white .7, `.active`=white.
- ring(spinner): `--bg-2` border + `--accent` top, `@keyframes spin`. S01 pulse(36), S03 progress-ring(80).

### Checkbox / Radio / Pill-select (primitives/Checkbox, primitives/Radio)
- check-all(S02): 원형 24, `--ink` bg/white check.
- check req(S02): 원형 22, `1.5px --ink` border; `.opt`=`--ink-4`, `.opt.on`=`--ink`.
- comp checkbox(planning): 13×13 사각 `1.4px --ink-4` r3.
- radio `.rd`(S20/S21/sLR): 16–18 원형 `1.5px --ink-4`; selected=색 채움 + `box-shadow:inset 0 0 0 3px white`. 선택색: sLR/S20 `--ink`/`--danger`, S21 `--accent`.
- toggle(S22): 44×26 r13, on=`--accent` / off=`--ink-4`, thumb white 20 shadow.

### Pulse ring (patterns/PulseRing — 매칭 대기 모션)
- S07: `.pulse-area` 140, `.ring` radial `--accent-soft`→transparent, `@keyframes pulse{scale .6→1.4, opacity .7→0}`, `.r2` delay .7s, `.core` `--accent` solid.
- spin spinner 별도(위 Progress 참조).

### 8셀 그리드 (patterns/GridRoom — 일상 공유 방)
- S12: `.grid8` `grid-template-columns:1fr 1fr; gap:4px`. `.cell` `aspect-ratio:3/4; r14`.
- bg-a~bg-h: 8종 linear-gradient(리터럴 색쌍).
- `.cell.empty`: `#1A1A1A` + blob 얼굴(pink/green/purple `#FF1B9D`/`#74E36A`/`#9A7AE8`).
- timestrip: `.t.now`=`--ink`/white pill, 나머지 `--ink-4`.

### Chat bubble (patterns/ChatBubble — primitives/Avatar 의존)
- S13a: `.bub` `--bg-2`/`--ink` r14. `.me`=`--ink`/white(우측, nm 숨김). `.whisper`=`--accent-soft`/`--accent-deep` + `1px dashed --accent` italic. `.mention`=`--accent`/700.
- input-bar: input `--bg-2` r-full, send 32 원형 `--accent`/white.

### 권한 게이트 레이아웃 (patterns/PermissionGate / Centered-Hero)
- 공통 골격: topbar 우측 x(원형 `--bg-2`) → 중앙 icon-circle(64, status-soft 색) → h2(21px/800) → desc(`--ink-3`) → why/info box(`--bg-2` or status-soft) → ctas(primary ink + secondary `--bg-2`).
- 등장: S07a(알림 권한, info), S03f(인증 실패, danger), S03(인증 진행, spinner+brand-frame), sQE(큐 만료).

### 풀스크린 비디오 (patterns/FullscreenVideo)
- bg `#000` / 그라데이션 placeholder + `::after "▶"`. top-overlay(x 원형 `rgba(0,0,0,.45)` + meta glass pill). progress white. swipe-hint.
- 등장: S10(촬영 viewfinder+shutter 88+indicator dots), S11b(미리보기+bottom-ctas glass/accent), S13b(풀스크린 재생).

### Empty / Error / Loading (patterns/StateView)
- **Loading**: S01 splash(pulse spinner), S03 progress-ring(브랜드+포트원).
- **Error/Fail**: S03f(인증실패 danger icon), sPF(결제실패 modal), sCF(촬영실패 3종 mini), sQE(큐만료 — icon `--bg-2`/`--ink-3` 중립 86).
- **Empty**: S12 `.cell.empty`(blob 얼굴 — 빈 슬롯), S09 blur 미리보기 lock 상태(잠금 게이트).
- 패턴 공통: 중앙정렬 icon-circle + h(800) + desc(`--ink-3`) + CTA. icon 색이 상태 의미 전달(danger/warn/info/중립).

### 기타 식별 패턴
- **Slide-to-action**(patterns/SlideToConfirm): sLR/S20 — `--bg-2`(or `--danger-soft`) track r-full h54 + thumb 42 원형(`--danger`) + arrows `--ink-4`.
- **Settings row / list**(patterns/SettingsRow): S19/S22 — `--paper` row, `--line-2` 구분, k/v/arr, `.locked`/`.danger` 변형, sec-t uppercase `--ink-3`.
- **Reasons list**(patterns/ChoiceList): S20/S21/sLR radio rows, `.sel` 강조색 = 맥락별(danger/accent/ink).
- **Photo upload**(primitives/PhotoUpload): S04 — dashed `--ink-4` frame 140×180, `.filled` 그라데이션+`--ink` border.
- **Menu / Popover**(primitives/Popover): S16 `.menu` `--paper` r-md shadow `0 8px 24px rgba(0,0,0,.16)`, `.it.danger`=`--danger`.

---

## 권장 `@dei/ui` 인벤토리 초안

```
tokens/
  colors.ts      # surface(bg/paper/bg-2/bg-3), ink(1-4), line(1-2), semantic(accent±/warn/danger/info/success ±soft)
  radius.ts      # sm10 md14 lg20 xl24 full
  shadow.ts      # shadow-1(정의됨) + 관측 리터럴 → shadow-2/pop 토큰화
  typography.ts  # font/font-mono + 관측 size·weight·tracking 스케일(값 그대로)

primitives/
  Button(ink|accent|secondary|tertiary|mini|glass) · Input · Textarea · Select
  Card · Avatar · Badge · Chip · Checkbox · Radio · Toggle · Progress · Spinner
  PhotoUpload · Popover

patterns/
  BottomSheet · Modal/AlertDialog · Banner(accent|warn|danger|info)
  TopNav · ChatBubble · PulseRing · GridRoom(8셀) · FullscreenVideo
  PermissionGate/CenteredHero · StateView(loading|empty|error)
  SlideToConfirm · SettingsRow · ChoiceList(radio)
```

**주의(추출 충실도)**: ① `--success`·`--shadow-1`·`--r-xl` 은 토큰 정의는 있으나 .sNN 직접참조 거의 없음(시트 radius·그림자는 리터럴) → primitives 가 토큰으로 끌어오도록 매핑하되 값 변경 금지. ② 아바타/셀 그라데이션/배너 서브색은 토큰 미정의 리터럴 → 토큰 확장 시 별도 합의 필요(임의 토큰화 금지). ③ 타이포·간격은 px 리터럴 분산 — 토큰명만 부여하고 값은 관측치 그대로.

SSOT 파일: `/Users/susan/Downloads/all-screens (3).html` (tokens L12–25, 컴포넌트 CSS L223–851).