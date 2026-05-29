I now have complete, verified data across all 31 screens. Note S12/S13 IDs in `dsPatterns` map oddly (S12="촬영 실패 alert", S13="8셀 방") — the JSON IDs are authoritative. I have everything needed: the token inventory (grounded), per-screen `dsPatterns` with CSS and canonical names, and the aliasing relationships. Synthesizing the final consolidated design system now.

---

# dei `@dei/ui` — 통합 디자인 시스템 인벤토리 (전수 통합 · READ-ONLY)

SSOT: `/Users/susan/personal/dei/docs/handoff/_analysis/screens-extracted.json` (31화면 × dsPatterns) + `01-design-tokens-inventory.md` (토큰 원본값). 입력으로 받은 258 인스턴스(S01~S09 일부에서 잘림)는 이 전수 추출본으로 보강·검증했다. **화면 개발자(B·C)가 raw 로 만들 요소 = 0** (미커버 항목은 §6에 명시 플래그).

> 정규화 원칙: dsPatterns 에서 167개 distinct 이름이 나왔으나 대부분 **CSS 프래그먼트 별칭**(같은 컴포넌트의 다른 호칭). 동일 reducesTo 로 환원되는 것은 하나로 묶고, 등장 화면은 합집합. 토큰값은 관측치 그대로(임의 변경 금지).

---

## 1. 별칭 통합 맵 (167 names → 38 컴포넌트)

| 통합 컴포넌트 | 흡수한 별칭 (dsPatterns 원문) |
|---|---|
| **Button** | PrimaryCTA, BottomCTA, Primary accent CTA, CtaMiniPill, Pill/CTA-mini, MiniPillCTA, VerifyCta, TextLinkAction, CancelButton, Camera flip 버튼, 2-CTA ButtonRow(내부 .b), 동적 가격 CTA 라벨 |
| **Input / Textarea / Select** | FormField(내부), TextInput, SearchInput, ConditionalInput, ConditionalTextarea, Textarea+CharCount, ReadonlyClassificationField, CharCount, CodeBox(readonly) |
| **Spinner** | Spinner, ProgressRing, PulseRing(코어 스핀부), SpinnerPulse, 결제 inline progress, Upload progress 오버레이, ProgressModal(내부 spinner) |
| **ProgressBar** | ProgressBar, StepMeta(라벨부), 녹화 Progress Indicator, 세그먼트 도트 indicator |
| **Avatar** | Avatar, AvatarInitial, PresenceAvatar, HeroAvatar, ProfileHero, MemberChip(av부), MyAvatarWithBadge, TargetMemberChip(av부) |
| **Badge / Tag** | AgeTag, RequiredTag, LockBadge, OptionalFieldLabel, EditBadge, NotificationDot, ProfileIncompleteDot, NewMessageBadge, Duration 배지, DiscountBadge, price badge, CountPill, NicknameChip, Lock pill, EditBadge, IconBadge/ErrorIconBadge/StatusIcon/WarnIcon(원형 아이콘 배지 계열), 원형 아이콘 배지(S11a) |
| **Chip** | Chip variant, ChipGroup(컨테이너), MemberChip, TargetMemberChip, NicknameChip, who 칩(VideoCell 내부), MentionToken |
| **Checkbox** | Checkbox, CheckAll 카드, CheckRow, MasterRow(체크 변형) |
| **Radio / ChoiceList** | RadioReasonList, RadioCategoryList, PriceOptionRow(라디오 대체), Stacked alert list(선택형 아님—제외) |
| **Toggle** | Toggle/Switch, Mic toggle pill(상태 토글) |
| **Card** | EntryCard, BioCard, InfoCard, CompareCard, PassCard, InfoRows, SectionGroup(grouped 컨테이너) |
| **Text** | LogoMark, BrandLogo, CoreMark, Caption, MicroCopy, HelperTip, Eyebrow Label, SectionLabel, MetaText, SettingDescriptionSub, InfoNote, ReplyNote, Heading 계열(H1/H2), SwipeHint, 오버레이 힌트 텍스트, tabular-nums(숫자 변형), CountdownTimerText |
| **TopNav** | NavBar, NavBar with right-action, TopBar, RoomHeader, MemberHeaderRow, Floating overlay 컨트롤 바, 우상단 원형 닫기 |
| **IconButton** | CloseButton, CloseNavButton, BackButton, BackNavButton, CircleIconButton, CircleCloseButton, OverflowMenu(트리거), Camera flip, ViewChevron(아이콘) |
| **BottomActionBar** | BottomCtaBar, BottomFixedCTA, CTABottomBar, 나란히 2-CTA 바, 세로 스택 2-CTA, StackedCTA, StackedCtaList, TwoButtonRow, DualCTAStack |
| **BottomSheet** | BottomSheet, Sheet, SheetHandle, SlideHandle, Scrim, ScrimOverlay, Overlay, behind |
| **Modal / AlertDialog** | Alert, AlertModal, ConfirmModal, DiscardConfirm 다이얼로그, Alert/Dialog 카드(mini), Severity TopBorder, ProgressModal, 2-CTA ButtonRow(모달 내부) |
| **Banner** | RestrictBanner, WarnBar, DangerBox, DangerInfoBox, AssuranceBox, PolicyInfoBox, InfoNote/ReplyNote(info 배너), '왜 필요한가요?' info 박스, WhyBox, EstimateBox, ProgressInfoStrip, TrustSignalBlock |
| **StateView** | EmptyStateLayout, CenteredErrorBody, CenteredStatusBody, CenteredHeroBody, CenteredHeroLayout, EmptyCell Blob, BlurGate |
| **PermissionGate** | PermissionGate 화면, PermissionGateLayout, IconBadge(중앙), why/info box, StackedCTA — (StateView + Banner + BottomActionBar 합성) |
| **PulseRing** | PulseRing(ring/core), CoreMark, FAB(매칭 진입 버튼은 Button) |
| **ChatBubble** | ChatBubble, WhisperBubble, MentionToken(텍스트 변형), InputBar(별도) |
| **GridRoom** | 8-Cell Grid, VideoCell, TimeStrip, EmptyCell Blob, PresenceAvatar — (Avatar/Card/Text 합성) |
| **FullscreenVideo** | FullscreenVideo, Fullscreen Viewfinder, Looping Video Preview, Shutter 버튼, PauseIndicator, Glass, Floating overlay, Duration 배지, BlurGate, 다크 룸 배경 |
| **SlideToConfirm** | SlideToAction, SlideHandle(별개) |
| **SettingsRow** | SettingsRow, LockRow, MasterRow, DestructiveActionRow, ActionListRow/SheetMenuItem, MemberHeaderRow |
| **PhotoUpload** | PhotoUploadFrame, PhotoChangePill |
| **BrandTransitionFrame** | BrandTransitionFrame |
| **DeviceFrame / Notch / StatusBar** | DeviceFrame, Notch, StatusBar — (목업 chrome, §3 참조) |

---

## 2. `@dei/ui` 최종 목록

### primitives[] (22)

| # | 컴포넌트 | props / variants | 토큰 | 등장 화면 |
|---|---|---|---|---|
| P1 | **Button** | `variant: ink \| accent \| secondary \| tertiary \| mini-pill \| glass`, `disabled`, `fullWidth`, `size` | ink, accent, bg-2, ink-2, ink-3, r-md, r-full | S02,S03f,S04,S04b,S04c,S05,S06,S07a,S09,S10,S11b,S13a,S16,S17,S18,S19,S20,S21,S23 |
| P2 | **Input** | `state: default \| focus \| locked \| error`, `prefixIcon`(search), `readonly` | bg-2, bg-3(locked), ink, ink-3, r-md, danger | S04,S06,S16,S23,S20 |
| P3 | **Textarea** | `maxLength`, `showCount`, `state` | bg-2, ink, ink-4(count), r-md | S04b,S21,S23 |
| P4 | **Select** | `placeholder`, `locked`, chevron | bg-2, ink/ink-4, r-md | S04,S04c |
| P5 | **Card** | `variant: default \| cta-entry \| compare \| info-rows \| section`, `r-lg` opt | paper, line, line-2, bg-2, ink(now-glow), r-md/r-lg | S05,S14,S16,S17,S18,S19,S22 |
| P6 | **Avatar** | `size: 18–120`, `initial`, `bg`, `ring`(accent), `presenceDot`, `badge` | accent(ring/badge), paper(border), raw #E07A4F/#7A8DB8(§3) | S05,S06,S13a,S13b,S14,S16,S19,S21 |
| P7 | **Badge** | `variant: age \| required \| lock \| count \| dot \| discount \| icon`, `tone: accent\|warn\|danger\|info` | accent/-soft/-deep, ink, bg-2, ink-3, danger-soft, warn-soft, info-soft, r-full | S02,S04,S04c,S05,S06,S07a,S11b,S13,S17,S18,S19 |
| P8 | **Chip** | `variant: default \| me \| busy \| add`, `removable`, `avatar` | paper, line, accent(me), warn(busy dashed), ink-4(add), bg-2, r-full | S06,S13a,S13b,S21 |
| P9 | **Checkbox** | `variant: round \| square \| master`, `checked`, `optional` | ink(fill), ink-4(off), bg-2, r-full/r3 | S02,S21,S22 |
| P10 | **Radio** | `selected`, `tone: ink\|accent\|danger`, inset-fill | ink-4(border), ink/accent/danger(fill), white(inset) | S16,S17,S20,S21 |
| P11 | **Toggle** | `on/off`, thumb shadow | accent(on), ink-4(off), white(thumb), r-full | S22,S11(mic) |
| P12 | **ProgressBar** | `value`, `segmented`(dots), `track`/`fill` color | bg-2(track), accent(fill), white(video) | S04,S04b,S04c,S11,S13b |
| P13 | **Spinner** | `size: 36 \| 80`, inline/overlay | bg-2(track), accent(head), r-full | S01,S03,S04b,S11b,S17 |
| P14 | **Text** | `variant: logo \| display \| h1 \| h2 \| body \| caption \| micro \| eyebrow \| meta`, `tone`, `tabularNums` | ink, ink-2, ink-3, ink-4, accent(dot/highlight) | 전 31화면 |
| P15 | **IconButton** | `variant: ghost \| filled-circle \| glass`, `glyph`, `size:32\|36` | ink, bg-2, rgba glass, r-full | S02,S03,S03f,S07a,S09,S11,S11a,S11b,S13,S13b,S14,S19 |
| P16 | **PhotoUpload** | `state: empty \| filled`, `changePill` | bg-2, ink-4(dashed), ink(filled border), paper/line(pill), r-md, raw gradient(§3) | S04b |
| P17 | **Popover / Menu** | `items`, `danger` item | paper, line, danger, shadow `0 8px 24px rgba(0,0,0,.16)`, r-md | S14,S16 |
| P18 | **SlideToConfirm** | `tone: danger\|ink`, `label`, thumb+arrows | bg-2/danger-soft(track), danger(thumb), ink-4(arrows), r-full | S16,S20 |
| P19 | **SheetHandle** | (36×4) | ink-4, r2 | S08,S13a,S15,S16 |
| P20 | **PulseRing** | `rings:2`, `core`, `delay` | accent-soft(ring), accent(core), keyframes pulse | S07 |
| P21 | **EmptyBlob** | `tone: pink\|green\|purple`(blob 얼굴) | raw #1A1A1A(cell), #FF1B9D/#74E36A/#9A7AE8(§3) | S13 |
| P22 | **DeviceChrome** (StatusBar/Notch) | 목업/네이티브 경계 — **앱 구현 = SafeAreaView + expo-status-bar** | ink/white, raw #1a1a1a(§3) | 전 31화면(목업) |

### patterns[] (16)

| # | 패턴 | 의존 primitives | props / variants | 토큰 | 등장 화면 |
|---|---|---|---|---|---|
| X1 | **TopNav** | IconButton, Text, Avatar, Badge | `left: back\|close\|none`, `title`, `rightActions[]` | paper, line, ink, ink-3 | S03,S03f,S05,S06,S11,S11a,S11b,S13,S13b,S14,S19 |
| X2 | **BottomActionBar** | Button | `layout: single \| row \| stacked`, `borderTop`, `fixed` | paper, line, ink/accent, r-md | S02,S04,S04b,S04c,S06,S07a,S08,S11a,S11b,S17,S18,S21,S23 |
| X3 | **BottomSheet** | SheetHandle, (any) | `height%`, `scrim`, `behind-blur` | scrim rgba(.55), paper, r-xl(24), ink-4 | S08,S13a,S15,S16 |
| X4 | **Modal / AlertDialog** | Badge(icon), Text, Button | `tone: danger\|warn\|info`, `severityTopBorder`, `mini\|r-lg` | danger-soft/warn-soft/info-soft, paper, r-lg/r-md, line | S03,S04c,S05,S11b,S12,S15,S18 |
| X5 | **Banner** | Badge(icon), Text, Button(mini) | `tone: accent\|warn\|danger\|info`, `cta`, `countdown` | *-soft bg, raw 보더/텍스트(§3), r-md | S05,S06,S07a,S08,S09,S15,S16,S17,S18,S20,S21,S22,S23 |
| X6 | **StateView** | Spinner/Badge(icon), Text, Button | `kind: loading \| empty \| error`, `tone` | bg-2, ink-3, status-soft 색, accent | S01,S03,S03f,S07,S09,S13(blob) |
| X7 | **PermissionGate** | StateView + Banner + BottomActionBar | `status: info\|danger\|spinner`, why-box | bg-2/status-soft, ink-3, ink/bg-2(cta) | S03,S03f,S07a,S11a |
| X8 | **ChatBubble** | Avatar, Text | `variant: them \| me \| whisper \| mention` | bg-2/ink(반전), accent-soft+dashed accent(whisper), accent(mention), r-md | S13a |
| X9 | **InputBar** (채팅 컴포저) | Input, IconButton | `sendDisabled`, charcount | bg-2(input), accent(send 원형), r-full | S13a |
| X10 | **GridRoom** (8셀 시그니처) | Avatar(presence), Card/cell, Text, EmptyBlob | `cells:8`, `bg-a~h`, `timeStrip` | raw gradient ×8(§3), ink(now pill), ink-4, r14 | S13 |
| X11 | **FullscreenVideo** | IconButton(glass), Badge, ProgressBar, Text | `mode: viewfinder \| preview \| playback`, shutter, swipeHint | #000/raw gradient, rgba glass, white(progress), accent | S11,S11b,S13b |
| X12 | **SettingsRow / List** | Text, Toggle, IconButton, Avatar | `variant: nav \| locked \| danger \| master \| member`, `k/v/arr` | paper, line-2, ink/ink-3/ink-4, danger, accent(toggle) | S14,S15,S19,S22 |
| X13 | **ChoiceList** (사유/카테고리) | Radio, Text, Input(기타) | `tone: danger\|accent\|ink`, conditional input | bg-2, ink/accent/danger(sel), r-md | S16,S20,S21 |
| X14 | **CompareCard** (결제 비교) | Card, Badge, Text | cur(bg-2) / now(ink+radial accent glow), tabular | bg-2, ink, accent(glow), r-lg | S17 |
| X15 | **BrandTransitionFrame** | Text, Badge | dei.→PortOne 칩 row | ink, accent(dot), ink-4(arrow), ink-3+bg-2(pill), r-sm | S03 |
| X16 | **ProfileHero** | Avatar, IconButton(edit badge) | 90/120px avatar + edit anchor | accent, ink(edit badge), paper | S14,S16,S19 |

---

## 3. 비표준 하드코딩 색 처리

### A. 토큰 확장 후보 (의미 안정 · 재사용 多 → `tokens/` 승격 권장)

| raw 값 | 출처 | 제안 토큰 | 근거 |
|---|---|---|---|
| `#E07A4F` | 내 아바타 bg (S05) | `--avatar-self` | 사용자 정체성 색, 여러 화면 재등장 |
| `#7A8DB8` | 상대 아바타 bg (중립) | `--avatar-peer` | 상동 |
| `0 16px 40px rgba(0,0,0,.12)` | device frame | (목업 한정 — §token 불필요) | 앱 비포함 |
| `0 8px 24px rgba(0,0,0,.16)` | Popover/Menu (S14,S16) | `--shadow-pop` | 메뉴·팝오버 공통 |
| `0 1px 3px rgba(0,0,0,.2)` | Toggle thumb | `--shadow-thumb` | 토글 thumb 공통 |
| scrim `rgba(0,0,0,.55)` | 모든 BottomSheet/Modal | `--scrim` | 시트·모달 공통 |
| glass `rgba(255,255,255,.15)`+blur8 / `rgba(0,0,0,.4~.45)` | FullscreenVideo overlay | `--glass-light` / `--glass-dark` | 영상 오버레이 공통 |

### B. pattern 국소 처리 (의미 1회성 / 장식 → 토큰화 금지, 패턴 내부 상수)

| raw 값 | 출처 | 처리 |
|---|---|---|
| `bg-a ~ bg-h` 8종 linear-gradient | GridRoom 셀 (S13) | **GridRoom 내부 상수 배열** (장식, 의미 없음) |
| `#FF1B9D / #74E36A / #9A7AE8` | EmptyBlob 얼굴 (S13) | **EmptyBlob `tone` prop** 3종 enum |
| 셀/영상 placeholder gradient `#d4a3b8→#7a5a8a` 등 | PhotoUpload filled, FullscreenVideo | **패턴 내부** (실데이터 시 이미지로 대체) |
| 배너 보더 `#f0c4d6`(accent) / `#e8d488`(warn) | RestrictBanner / WarnBar | **Banner `tone` 별 보더 상수** (각 *-soft 의 진한 변형) |
| 배너 텍스트 `#7a1d3e / #7a1818 / #6c5610 / #1a3f7c / #1f4380` | Banner desc 톤 | **Banner `tone` 별 텍스트 상수** (accent-deep 류와 통합 검토) |
| `#1A1A1A` (device bezel / empty cell / dark camera) | Notch, EmptyBlob, S12 배경 | **목업 chrome + 패턴 dark 배경** (`--ink` `#191919` 와 별개 — 통합 시 미세 톤차 합의 필요) |

> **결정 필요(개발자)**: 배너 보더/텍스트 다톤(§B 5색)을 `tone` 별 상수로 둘지, semantic 토큰을 `*-border`/`*-text` 까지 확장할지. 현재 권장 = Banner 패턴 내부 상수(토큰 폭발 방지). 아바타 2색·shadow 3종·scrim·glass 2종은 `tokens/` 승격 권장(§A).

---

## 4. 커버리지 매트릭스 (31화면 × 컴포넌트, 미커버=0)

요소가 **어떤 컴포넌트로 커버되는지** 화면별 확인. `P`=primitive, `X`=pattern.

| 화면 | 커버 컴포넌트 |
|---|---|
| **S01** splash | Text(logo/copy)P14, Spinner P13, StateView(loading)X6, DeviceChrome P22 |
| **S02** 약관/19+ | IconButton P15, Badge(age/required)P7, Text P14, Checkbox(master/round)P9, IconButton(view chevron)P15, BottomActionBar X2, Button P1 |
| **S03** 인증 진행 | IconButton(close circle)P15, Spinner(80)P13, BrandTransitionFrame X15, Text P14, Modal(조건부)X4, PermissionGate(spinner)X7 |
| **S03f** 인증 실패 | IconButton P15, Badge(error icon)P7, Text P14, BottomActionBar(dual)X2, Button P1, StateView(error)X6 |
| **S04** 프로필1/3 | ProgressBar P12, Input P2, Select P4, Badge(lock)P7, Text(helper/count)P14, Spinner(validation)P13, BottomActionBar X2 |
| **S04b** 프로필2/3 | ProgressBar P12, PhotoUpload P16, IconButton(back)P15, Textarea P3, Modal(progress)X4, Text(tip)P14, BottomActionBar X2 |
| **S04c** 프로필3/3 | ProgressBar P12, Select(placeholder)P4, Text(optional label)P14, IconButton(back)P15, Modal(조건부)X4, BottomActionBar X2 |
| **S05** 홈 | Text(brand/heading)P14, Avatar(badge)P6, Badge(dot)P7, Card(entry)P5, Banner(restrict+countdown)X5, Button(mini)P1, TopNav X1 |
| **S06** 멤버 초대 | TopNav X1, Input(search)P2, Avatar P6, Chip(me/busy/add)P8, Badge(count)P7, Text(section)P14, Banner(warn)X5, BottomActionBar X2 |
| **S07** 매칭 중 | StateView(hero)X6, PulseRing P20, Text P14, Banner(estimate)X5, Button(FAB)P1 |
| **S07a** 알림 권한 | IconButton(close)P15, Badge(icon)P7, Text P14, Banner(why)X5, BottomActionBar(stacked)X2, PermissionGate X7 |
| **S08** 매칭 대기/시간 | BottomSheet X3, SheetHandle P19, Badge(warn icon)P7, Banner(progress strip)X5, Text(countdown)P14, BottomActionBar(2btn)X2 |
| **S09** 매칭 CTA | IconButton(close)P15, StateView(empty)X6, Banner(why)X5, Button P1, Text(link)P14, PermissionGate(레이아웃 공유)X7 |
| **S10** 멤버 그리드(잠금) | TopNav X1(추정), Avatar P6, Chip(nickname)P8, Badge(lock pill)P7, StateView(blur gate)X6, Button(accent)P1, dark bg(패턴)X11 |
| **S11a** 카메라 권한 | IconButton(close circle)P15, Badge(icon)P7, Text(heading/desc)P14, Banner(why)X5, BottomActionBar(stacked)X2, PermissionGate X7 |
| **S11** 촬영 | FullscreenVideo(viewfinder)X11, ProgressBar(segment)P12, IconButton(shutter/flip/glass)P15, Toggle(mic)P11, Text(hint)P14, TopNav(overlay)X1 |
| **S11b** 미리보기 | FullscreenVideo(preview)X11, Button(glass/accent)P1, Badge(duration)P7, Modal(discard)X4, Spinner(upload)P13, BottomActionBar(2btn)X2 |
| **S13(JSON)** 8셀 방 ★ | GridRoom X10, Avatar(presence)P6, EmptyBlob P21, Text(timestrip)P14, TopNav(room header)X1, Badge(new msg)P7, Banner/Toast(조건부)X5, DeviceChrome P22 |
| **S13a** 채팅 시트 | BottomSheet X3, SheetHandle P19, ChatBubble X8, Avatar(28)P6, InputBar X9, Badge(new msg)P7, Text(mention)P14 |
| **S13b** 풀스크린 재생 | FullscreenVideo(playback)X11, Avatar(meta)P6, ProgressBar(video)P12, Chip(member)P8, IconButton P15, Text(swipe hint)P14 |
| **S14** 멤버 프로필 | TopNav X1, ProfileHero X16, Avatar(hero)P6, Card(bio/info-rows)P5, Text(meta)P14, Popover(overflow)P17, IconButton P15 |
| **S15** 차단/신고 시트 | BottomSheet X3, SheetHandle P19, SettingsRow(member/action/danger)X12, Banner(policy)X5, Button(cancel)P1, Modal(confirm)X4, Avatar P6 |
| **S16** 방나가기 시트 | BottomSheet X3, SheetHandle P19, Banner(danger info)X5, ChoiceList(reasons)X13, Radio P10, SlideToConfirm P18, Input(기타)P2 |
| **S17** 결제 비교 | CompareCard X14, Card P5, Badge(price/discount)P7, Radio(price row)P10, Banner(trust)X5, BottomActionBar X2, Text(tabular)P14, Spinner(inline)P13 |
| **S18** 부스터/코드 | Card(cta)P5, Badge(status icon)P7, Banner(assurance)X5, Input(code box)P2, Modal(alert)X4, BottomActionBar(stacked)X2, Button(boost/later)P1 |
| **S19** 프로필 수정 허브 | TopNav(right-action)X1, SettingsRow(locked/section)X12, ProfileHero X16, Avatar(90)P6, Badge(edit)P7, Card(pass)P5, Button(mini pill)P1 |
| **S20** 신고 사유 | ChoiceList(reasons)X13, Radio P10, Input(conditional)P2, Banner(danger)X5, Text(destructive heading)P14, SlideToConfirm P18, Button(verify)P1 |
| **S21** 신고 입력 | TargetMember Chip P8, Avatar P6, ChoiceList(category)X13, Radio P10, Checkbox P9, Textarea(conditional)P3, Banner(info note)X5, BottomActionBar X2, Toast(조건부)X5 |
| **S22** 알림 설정 | SettingsRow(master)X12, Toggle P11, Card(info)P5, Text(sub desc)P14 |
| **S23** 답변/신고 | FormField(Input/Textarea)P2/P3, CharCount(Text)P14, Banner(reply note/assure)X5, ReadonlyField(Input)P2, BottomActionBar X2, Toast(조건부)X5 |
| **S12(JSON)** 촬영 실패 alert | Modal(mini/severity)X4, Badge(severity top border)P7, Text(eyebrow)P14, BottomActionBar(2-CTA row)X2, dark bg(패턴)X11, DeviceChrome P22 |

**미커버 = 0.** 모든 31화면의 모든 dsPattern 요소가 22 primitives + 16 patterns 안에 환원됨. (주의: JSON 의 `S12`=촬영실패 alert, `S13`=8셀 방 — ID 가 라벨과 어긋나 있으나 JSON ID 를 권위값으로 사용.)

---

## 5. Phase 3 구현 작업목록 (공통 빈도순 · 의존관계)

**Tier 0 — 토큰 (전 컴포넌트 선행 의존, 1순위)**
1. `tokens/color` · `radius` · `shadow`(+shadow-pop/thumb) · `typography` · `scrim`/`glass`/`avatar-self`/`avatar-peer`(§3A 승격분). **이거 없이는 아무것도 시작 불가.**

**Tier 1 — 고빈도 무의존 primitives (병렬 가능)**
2. **Text** P14 (31화면) — 무의존
3. **Button** P1 (19화면) — 무의존
4. **Badge** P7 (11화면) — 무의존
5. **IconButton** P15 (12화면) — 무의존
6. **Avatar** P6 (8화면) — §3A 토큰 의존
7. **Card** P5 (7화면) — 무의존
8. **Input / Textarea / Select** P2/P3/P4 (6/3/2화면) — 무의존
9. **Spinner** P13 (5화면) · **ProgressBar** P12 (5화면) — 무의존
10. **Checkbox** P9 · **Radio** P10 · **Toggle** P11 (폼 입력군) — 무의존
11. **Chip** P8 — Avatar 의존
12. **SheetHandle** P19 — 무의존 (BottomSheet 선행 부품)

**Tier 2 — patterns (Tier 1 의존)**
13. **BottomActionBar** X2 (13화면) ← Button
14. **Banner** X5 (13화면) ← Badge(icon), Text, Button(mini) · §3B 보더/텍스트 상수
15. **TopNav** X1 (11화면) ← IconButton, Text, Avatar, Badge
16. **Modal/AlertDialog** X4 (7화면) ← Badge(icon), Text, Button
17. **StateView** X6 (6화면) ← Spinner/Badge, Text, Button
18. **SettingsRow/List** X12 (4화면) ← Text, Toggle, IconButton, Avatar
19. **BottomSheet** X3 (4화면) ← SheetHandle
20. **ChoiceList** X13 (3화면) ← Radio, Text, Input

**Tier 3 — 합성/시그니처 patterns (Tier 1+2 의존)**
21. **PermissionGate** X7 (4화면) ← StateView + Banner + BottomActionBar
22. **FullscreenVideo** X11 (3화면) ← IconButton(glass), Badge, ProgressBar, Text + glass 토큰
23. **ProfileHero** X16 (3화면) ← Avatar, IconButton
24. **SlideToConfirm** P18 (2화면) — 단독 (제스처 로직)
25. **Popover/Menu** P17 (2화면) ← shadow-pop 토큰
26. **CompareCard** X14 (1, 결제) ← Card, Badge, Text
27. **ChatBubble** X8 + **InputBar** X9 (S13a) ← Avatar, Input, IconButton
28. **PulseRing** P20 (S07) — 단독 (애니메이션)
29. **BrandTransitionFrame** X15 (S03) ← Text, Badge

**Tier 4 — 1회성 시그니처 (가장 무겁고 의존 多, 마지막)**
30. **GridRoom** X10 (S13 8셀 ★시그니처) ← Avatar(presence), Card, Text, EmptyBlob P21 + gradient 상수 8종
31. **EmptyBlob** P21 (GridRoom 부품, 동반 구현)

**의존 그래프 핵심**: `tokens → Tier1 primitives → {BottomActionBar, Banner, TopNav, Modal, StateView, BottomSheet} → {PermissionGate(=StateView+Banner+BottomActionBar 합성), FullscreenVideo, GridRoom(=Avatar+Card+Text+EmptyBlob)}`. PermissionGate 와 GridRoom 이 합성 깊이가 가장 깊다(3겹).

---

## 6. 누락 / 플래그 (raw 제작 위험 항목)

1. **DeviceChrome(StatusBar/Notch/DeviceFrame) P22 — 컴포넌트 아님.** 목업 chrome 으로, 앱에선 `SafeAreaView` + `expo-status-bar` 가 대체. `@dei/ui` 에 만들지 말 것. **B·C 가 raw 로 만들 필요 없음**(네이티브 제공).
2. **Toast — 전용 transient 컴포넌트가 HTML 에 없음.** dsPatterns 의 6개 "Toast"(S13/15/16/18/21/23)는 전부 "조건부 안내 카피, 디바이스 미렌더" 주석. 현재 SSOT 는 Banner 패턴. → **결정 필요**: 실제 transient Toast 가 필요하면 신규 컴포넌트(Banner 재사용 or RN `Snackbar`). 지금 raw 로 흩어지면 일관성 깨짐. **명시 플래그.**
3. **하단 탭바 없음** — 원본 HTML 은 상단 nav only. 5분기 라우팅(splash→홈/매칭/방)이므로 글로벌 탭바 부재가 의도된 것일 수 있으나, 정보구조상 추가될 경우 `@dei/ui` 에 `TabBar` 신설 필요. **현재 인벤토리엔 없음 — 플래그.**
4. **배너 다톤 보더/텍스트 5색(§3B)** — semantic 토큰 미정의. Banner 패턴 내부 상수로 막아 raw 누수는 0 이나, 톤 확장 시 합의 필요.
5. **`#1A1A1A` vs `--ink #191919`** — device bezel/empty cell/dark camera 가 `#1A1A1A` 리터럴. `--ink` 와 미세 톤차. 통합할지 별도 둘지 합의 필요(현재는 패턴 dark-bg 상수로 격리).
6. **JSON ID 라벨 불일치**(S12=촬영실패, S13=8셀방) — 구현 시 route/파일명 매핑에서 혼동 주의. JSON `id` 가 권위값.

**결론**: 위 6건만 명시 결정하면(특히 #2 Toast, #3 TabBar) **화면 개발자가 raw 로 만들 시각 요소 = 0**. 22 primitives + 16 patterns 가 31화면 전 요소를 커버한다.