// @dei/ui 배럴(index) export 해소 검증 — S13a 신규 컴포넌트가
// `@dei/ui` 루트에서 import 가능한지 보장한다(화면이 deep path 가 아닌
// 배럴로 가져오므로, 배럴 누락이면 화면 import 가 런타임에 깨진다).
//
// 배럴은 RN 컴포넌트 트리 전체를 끌어오므로 Jest(jest-expo, RN 변환)로만
// 로드 가능하다 — Vitest(node env)는 RN 소스 변환 불가. 따라서 이 파일은
// 의도적으로 `.test.tsx`(Jest 소유)다.
import * as UI from '../index';

describe('@dei/ui barrel exports (S13a)', () => {
  it('exports MentionAutocomplete from the package root', () => {
    expect(UI.MentionAutocomplete).toBeDefined();
  });

  it('exports NewMessageJumpButton from the package root', () => {
    expect(UI.NewMessageJumpButton).toBeDefined();
  });
});
