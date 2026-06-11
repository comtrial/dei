import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock('@dei/shared', () => ({
  logger: { captureMessage: vi.fn() },
}));

describe('enqueueMatchQueue', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: {
        enqueuedAt: '2026-06-11T00:00:00.000Z',
        expiresAt: null,
        memberCount: 2,
        queueId: 'queue-1',
        reused: false,
        teamId: 'team-1',
      },
      error: null,
    });
  });

  it('sends normal mode by default', async () => {
    const { enqueueMatchQueue } = await import('./matching');

    await enqueueMatchQueue(['u1']);

    expect(invokeMock).toHaveBeenCalledWith('enqueue-match-queue', {
      body: { memberIds: ['u1'], mode: 'normal' },
    });
  });

  it('sends college mode for gwating queues', async () => {
    const { enqueueMatchQueue } = await import('./matching');

    await enqueueMatchQueue(['u1', 'u2'], { mode: 'college' });

    expect(invokeMock).toHaveBeenCalledWith('enqueue-match-queue', {
      body: { memberIds: ['u1', 'u2'], mode: 'college' },
    });
  });

  it('preserves college eligibility error codes from edge functions', async () => {
    const { enqueueMatchQueue, MatchQueueError } = await import('./matching');
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            code: 'COLLEGE_PROFILE_REQUIRED',
            error: '과팅은 대학생 프로필을 완료한 친구만 참여할 수 있어요.',
          }),
          { status: 403 },
        ),
      },
    });

    await expect(enqueueMatchQueue(['u1', 'u2'], { mode: 'college' })).rejects.toMatchObject({
      code: 'COLLEGE_PROFILE_REQUIRED',
      message: '과팅은 대학생 프로필을 완료한 친구만 참여할 수 있어요.',
      name: MatchQueueError.name,
    });
  });
});
