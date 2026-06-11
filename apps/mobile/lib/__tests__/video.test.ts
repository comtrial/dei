/* eslint-disable import/first -- vitest 의 vi.mock hoisting 을 위해 mock 선언 후 import 배치 필요 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('expo-camera', () => ({
  CameraView: {},
}));

vi.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  downloadAsync: vi.fn(),
  deleteAsync: vi.fn(),
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    storage: {
      from: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@dei/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dei/shared')>();
  return {
    ...actual,
    getCurrentHourSlotKst: vi.fn(() => 14),
  };
});

import * as FileSystem from 'expo-file-system/legacy';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { POLICY, getCurrentHourSlotKst } from '@dei/shared';

import { supabase } from '@/lib/supabase';

import { recordClip, uploadClip, isClipVisible } from '../video';

const mockGetInfoAsync = FileSystem.getInfoAsync as ReturnType<typeof vi.fn>;
const mockGetThumbnailAsync = getThumbnailAsync as ReturnType<typeof vi.fn>;
const mockGetCurrentHourSlotKst = getCurrentHourSlotKst as ReturnType<typeof vi.fn>;

const mockSupabase = supabase as {
  auth: { getUser: ReturnType<typeof vi.fn> };
  functions: { invoke: ReturnType<typeof vi.fn> };
  storage: { from: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

describe('recordClip', () => {
  it('cameraRef null 이면 CAMERA_NOT_READY throw', async () => {
    const ref = { current: null };
    await expect(recordClip(ref)).rejects.toThrow('CAMERA_NOT_READY');
  });

  it('record() 결과 없으면 RECORD_FAILED throw', async () => {
    const ref = { current: { recordAsync: vi.fn().mockResolvedValue(undefined) } };
    await expect(recordClip(ref as never)).rejects.toThrow('RECORD_FAILED');
  });

  it('파일 크기 > maxFileSizeBytes 이면 VIDEO_TOO_LARGE throw', async () => {
    const ref = {
      current: {
        recordAsync: vi.fn().mockResolvedValue({ uri: 'file:///video.mp4' }),
      },
    };
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      size: POLICY.video.maxFileSizeBytes + 1,
      isDirectory: false,
      uri: 'file:///video.mp4',
    });

    await expect(recordClip(ref as never)).rejects.toThrow('VIDEO_TOO_LARGE');
  });

  it('파일 크기 <= maxFileSizeBytes 이면 localUri + durationMs 반환', async () => {
    const ref = {
      current: {
        recordAsync: vi.fn().mockResolvedValue({ uri: 'file:///video.mp4' }),
      },
    };
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      size: POLICY.video.maxFileSizeBytes - 1,
      isDirectory: false,
      uri: 'file:///video.mp4',
    });

    const result = await recordClip(ref as never);
    expect(result.localUri).toBe('file:///video.mp4');
    expect(result.durationMs).toBe(POLICY.video.maxDurationMs);
  });
});

describe('uploadClip', () => {
  const mockStorageUpload = vi.fn();
  const mockStorageSignedUrl = vi.fn();
  const mockDbInsert = vi.fn();

  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      size: 1000,
      isDirectory: false,
      uri: 'file:///thumb.jpg',
    });

    mockGetThumbnailAsync.mockResolvedValue({
      uri: 'file:///thumb.jpg',
      width: 1280,
      height: 720,
    });

    (FileSystem.readAsStringAsync as ReturnType<typeof vi.fn>).mockResolvedValue('AAAA');

    mockStorageUpload.mockResolvedValue({ data: {}, error: null });
    mockStorageSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/thumb.jpg' },
      error: null,
    });

    mockSupabase.storage.from.mockReturnValue({
      upload: mockStorageUpload,
      createSignedUrl: mockStorageSignedUrl,
    });

    mockDbInsert.mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue({ insert: mockDbInsert });
    mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('성공 시 videoId + thumbnailUrl 반환', async () => {
    const result = await uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' });
    expect(result.videoId).toBeTruthy();
    expect(result.thumbnailUrl).toBe('https://example.com/thumb.jpg');
  });

  it('video INSERT 시 hour_slot = getCurrentHourSlotKst() 값', async () => {
    mockGetCurrentHourSlotKst.mockReturnValue(23);
    await uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' });

    const insertCall = mockDbInsert.mock.calls[0][0];
    expect(insertCall.hour_slot).toBe(23);
    expect(insertCall.status).toBe('ready');
  });

  it('hour_slot 경계: 0시', async () => {
    mockGetCurrentHourSlotKst.mockReturnValue(0);
    await uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' });

    const insertCall = mockDbInsert.mock.calls[0][0];
    expect(insertCall.hour_slot).toBe(0);
  });

  it('storage upload 실패 시 throw + 로컬 큐 저장', async () => {
    mockStorageUpload.mockResolvedValue({ data: null, error: new Error('UPLOAD_FAIL') });

    const mockWriteAs = FileSystem.writeAsStringAsync as ReturnType<typeof vi.fn>;
    mockWriteAs.mockResolvedValue(undefined);
    (FileSystem.readAsStringAsync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.includes('video_upload_queue')) return Promise.resolve('[]');
      return Promise.resolve('AAAA');
    });

    await expect(
      uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' }),
    ).rejects.toThrow();

    expect(mockWriteAs).toHaveBeenCalled();
  });

  it('onProgress callback 호출됨', async () => {
    const onProgress = vi.fn();
    await uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' }, { onProgress });

    expect(onProgress).toHaveBeenCalledWith(0.1);
    expect(onProgress).toHaveBeenCalledWith(0.3);
    expect(onProgress).toHaveBeenCalledWith(0.8);
    expect(onProgress).toHaveBeenCalledWith(1.0);
  });

  it('업로드 성공 후 같은 방 참가자 영상 업로드 알림 Edge Function 호출', async () => {
    const result = await uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' });

    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('notify-video-uploaded', {
      body: { room_id: 'room-1', video_id: result.videoId },
    });
  });

  it('영상 업로드 알림 실패는 업로드 성공 결과를 깨지 않음', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('NOTIFY_FAILED'),
    });

    const result = await uploadClip({ roomId: 'room-1', localUri: 'file:///video.mp4' });

    expect(result.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('notify-video-uploaded', {
      body: { room_id: 'room-1', video_id: result.videoId },
    });
  });
});

describe('isClipVisible', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('24h 내 ready row 존재 시 true', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'v1' }], error: null }),
    });

    const result = await isClipVisible({
      videoId: 'v1',
      viewerId: 'user-1',
      roomId: 'room-1',
    });
    expect(result).toBe(true);
  });

  it('24h 내 row 없으면 false', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await isClipVisible({
      videoId: 'v1',
      viewerId: 'user-1',
      roomId: 'room-1',
    });
    expect(result).toBe(false);
  });

  it('DB 에러 시 false 반환 (throw 안 함)', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB_ERR') }),
    });

    const result = await isClipVisible({
      videoId: 'v1',
      viewerId: 'user-1',
      roomId: 'room-1',
    });
    expect(result).toBe(false);
  });

  it('visibilityWindowHours = POLICY.blurGate.visibilityWindowHours (24) 기준', async () => {
    const selectMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const gteMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });

    mockSupabase.from.mockReturnValue({
      select: selectMock,
      eq: eqMock,
      gte: gteMock,
      limit: limitMock,
    });

    const before = Date.now();
    await isClipVisible({ videoId: 'v1', viewerId: 'user-1', roomId: 'room-1' });
    const after = Date.now();

    const gteCall = gteMock.mock.calls[0];
    expect(gteCall[0]).toBe('created_at');

    const sinceMs = new Date(gteCall[1] as string).getTime();
    const expectedWindowMs = POLICY.blurGate.visibilityWindowHours * 60 * 60 * 1000;
    expect(before - sinceMs).toBeGreaterThanOrEqual(expectedWindowMs - 100);
    expect(after - sinceMs).toBeLessThanOrEqual(expectedWindowMs + 100);
  });
});
