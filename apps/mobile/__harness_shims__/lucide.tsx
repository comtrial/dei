/**
 * lucide-react-native stub — Playwright web harness only.
 *
 * Real icons aren't load-bearing for the chat spec DOM assertions (those are
 * testID / text / a11y-state based). lucide's `.mjs` pulls react-native-svg
 * which doesn't resolve cleanly under react-native-web in Vite, so every icon
 * the chat tree imports by name resolves to a tiny no-op view here.
 *
 * esbuild's dep scanner needs *static* named exports, so each icon used in the
 * chat component tree is exported explicitly. Add new ones here if a chat
 * component starts importing another lucide icon.
 */
import { View } from 'react-native';

function StubIcon(props: Record<string, unknown>) {
  // Honor `size` (chat passes size=20..22) so icon-only Pressables keep a
  // non-zero hit box. NativeWind classNames aren't compiled in the harness, so
  // without this an icon button would collapse to 0px and Playwright would
  // treat it as not visible.
  const size = typeof props.size === 'number' ? (props.size as number) : 20;
  return (
    <View
      accessibilityElementsHidden
      style={{ width: size, height: size }}
      testID={(props.testID as string) ?? 'stub-icon'}
    />
  );
}

// Icons referenced anywhere in the rendered chat tree (composer, more-sheet,
// leave-dialog → ui/dialog, message-bubble, ui/icon).
export const X = StubIcon;
export const SendHorizontal = StubIcon;
export const MoreVertical = StubIcon;
export const LogOut = StubIcon;
export const UserRound = StubIcon;
export const Users = StubIcon;
export const AlertCircle = StubIcon;
export const ChevronDown = StubIcon;
export const ChevronLeft = StubIcon;
export const ChevronRight = StubIcon;
export const Check = StubIcon;
export const House = StubIcon;
export const Heart = StubIcon;
export const MessageCircle = StubIcon;
export const Video = StubIcon;
// S13a 전체화면 채팅: InputBar 전송(↑) / NewMessageJumpButton(↓).
export const ArrowUp = StubIcon;
export const ArrowDown = StubIcon;
// @dei/ui 트리에서 전이적으로 끌려오는 아이콘들(StateView/Input/PhotoUpload 등).
export const RefreshCw = StubIcon;
export const Pencil = StubIcon;
export const Search = StubIcon;
export const Plus = StubIcon;
export const Camera = StubIcon;

export default StubIcon;
export const __isLucideStub = true;
