/**
 * Playwright web harness app — S13a 방 내부 채팅 (전체화면).
 *
 * Mounts the *real* production view `RoomChatView` against react-native-web so
 * a real browser exercises the production UI at the DOM level. RoomChatView is
 * a *pure view* (props-driven; supabase/router/realtime live in the route file
 * `(app)/room/[roomId]/chat.tsx`), so the harness needs no Supabase/Docker —
 * it feeds deterministic fixture props per scenario.
 *
 * Scenario via `?scenario=` query param. NativeWind className styling is NOT
 * compiled here — assertions are testID / text / a11y-state based, which hold
 * regardless of CSS (keeps the harness hermetic and fast).
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { RoomChatView } from '@/components/chat/RoomChatView';
import { SCENARIOS, type ScenarioName } from './scenarios';

function readScenario(): ScenarioName {
  const p = new URLSearchParams(window.location.search);
  const s = p.get('scenario') as ScenarioName | null;
  return s != null && s in SCENARIOS ? s : 'room-basic';
}

export default function HarnessApp() {
  const scenario = useMemo(readScenario, []);
  const fixture = SCENARIOS[scenario];

  // 입력/귓속말 대상은 controlled — 컴포저 타이핑·멘션 자동완성 흐름을 실제로 검증.
  const [input, setInput] = useState(fixture.input ?? '');
  const [whisperTarget, setWhisperTarget] = useState(fixture.whisperTarget ?? null);

  // Explicit pixel height: RN-web resolves `flex:1` chains only when an ancestor
  // has a concrete height. Mirror the viewport so SafeAreaView/KeyboardAvoidingView
  // don't collapse to 0.
  return (
    <View
      style={{ height: '100vh' as unknown as number, width: '100%', maxWidth: 480, alignSelf: 'center' }}
      testID="harness-root"
    >
      <RoomChatView
          memberCount={fixture.members.filter((m) => m.status === 'active').length}
          selfId={fixture.selfId}
          messages={fixture.messages}
          members={fixture.members}
          input={input}
          whisperTarget={whisperTarget}
          onChangeInput={setInput}
          onSend={() => {
            setInput('');
            setWhisperTarget(null);
          }}
          onRetry={() => {}}
          onSelectMention={(m) => {
            setInput((prev) => prev.replace(/(?:^|\s)@+\S*$/, '').replace(/\s+$/, ''));
            setWhisperTarget({ userId: m.userId, name: m.name, avatarInitial: m.avatarInitial });
          }}
          onClearWhisper={() => setWhisperTarget(null)}
          onAvatarPress={() => {}}
          onClose={() => {}}
          newCount={fixture.newCount ?? 0}
          onJump={() => {}}
          blockedIds={fixture.blockedIds}
          roomEnded={fixture.roomEnded}
          overlay={fixture.overlay}
          visible
        />
    </View>
  );
}
