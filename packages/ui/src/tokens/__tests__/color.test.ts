import { describe, it, expect } from 'vitest';
import { color } from '../color';
import { radius } from '../radius';
import { fontFamily } from '../typography';

// HTML SSOT 값이 임의로 바뀌지 않았는지 보존(regression) 검증.
// all-screens 와이어프레임 `:root` 의 값 그대로여야 한다.
describe('v4 design tokens — HTML SSOT 보존', () => {
  it('accent 핫핑크 계열', () => {
    expect(color.accent).toBe('#FF2D6F');
    expect(color['accent-soft']).toBe('#FFE9EF');
    expect(color['accent-deep']).toBe('#E5215F');
  });

  it('ink 스케일', () => {
    expect(color.ink).toBe('#191919');
    expect(color['ink-2']).toBe('#3D3D44');
    expect(color['ink-3']).toBe('#76767D');
    expect(color['ink-4']).toBe('#B5B5BC');
  });

  it('surface / line', () => {
    expect(color['bg-2']).toBe('#F4F4F6');
    expect(color['bg-3']).toBe('#FAFAFB');
    expect(color.line).toBe('#EDEDF0');
    expect(color['line-2']).toBe('#F0F0F3');
  });

  it('status semantic', () => {
    expect(color.warn).toBe('#C8941A');
    expect(color.danger).toBe('#D62D2D');
    expect(color.info).toBe('#2A6BD9');
    expect(color.success).toBe('#1F8A4F');
  });

  it('radius 스케일', () => {
    expect(radius.sm).toBe(10);
    expect(radius.md).toBe(14);
    expect(radius.lg).toBe(20);
    expect(radius.xl).toBe(24);
    expect(radius.full).toBe(9999);
  });

  it('Pretendard 폰트 패밀리', () => {
    expect(fontFamily.sans).toBe('Pretendard JP Variable');
    expect(fontFamily.mono).toBe('SF Mono');
  });
});
