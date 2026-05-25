/**
 * Playwright web harness app.
 *
 * Phase 1 정리: 옛 채팅(1:1) 화면 마운트 로직 제거.
 * 옛 채팅 spec 들도 같이 삭제되어 현재 e2e-web 게이트는 새 도메인 spec 추가
 * (Phase 4) 까지 일시적으로 비어있다.
 *
 * Phase 4 에서 다음 형태로 재작성 예정:
 *   - 방 분할 피드 (`/room/[roomId]`)
 *   - 방 채팅 (`/room/[roomId]/chat`)
 *   - 묶음 구성 (`/group/new`)
 *   - 부스터 (`/booster`)
 * 등의 화면을 `?screen=` 쿼리로 마운트.
 *
 * 지금은 빈 placeholder 만 둬서 빌드/타입체크 깨짐 방지.
 */
import { View } from 'react-native';

export default function HarnessApp() {
  return (
    <View
      style={{ height: '100vh' as unknown as number, width: '100%', maxWidth: 480, alignSelf: 'center' }}
      testID="harness-root"
    />
  );
}
