let _uri: string | null = null;

export function setRecordingUri(uri: string) { _uri = uri; }
export function getRecordingUri(): string | null { return _uri; }
export function clearRecordingUri() { _uri = null; }
export function consumeRecordingUri(): string | null {
  const uri = _uri;
  _uri = null;
  return uri;
}
