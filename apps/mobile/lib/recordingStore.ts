let _uri: string | null = null;
let _overwriteAck = false;

export function setRecordingUri(uri: string) { _uri = uri; }
export function getRecordingUri(): string | null { return _uri; }
export function clearRecordingUri() { _uri = null; }
export function consumeRecordingUri(): string | null {
  const uri = _uri;
  _uri = null;
  return uri;
}

/**
 * 사용자가 record 화면에서 "이미 ○○시에 촬영된 로그가 있습니다" overwrite dialog 를
 * 한 번 confirm 한 직후 result(검수) 화면의 "다시 촬영" 으로 record 에 돌아올 때,
 * 같은 dialog 를 다시 띄우지 않기 위한 1회성 flag.
 *
 * - result.handleRedo 에서 set
 * - record 의 useFocusEffect 에서 consume (다음 진입에서 한 번만 적용 후 자동 초기화)
 */
export function setOverwriteAcknowledged() { _overwriteAck = true; }
export function consumeOverwriteAcknowledged(): boolean {
  const ack = _overwriteAck;
  _overwriteAck = false;
  return ack;
}
