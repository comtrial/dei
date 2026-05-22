import type { IdentityVerificationResponse } from '@portone/browser-sdk/v2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const functionsInvoke = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => functionsInvoke(...args),
    },
  },
}));

import {
  confirmIdentityVerification,
  startIdentityVerification,
} from '../identity-verification';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('identity verification client', () => {
  it('starts verification with the server-issued request fields', async () => {
    functionsInvoke.mockResolvedValueOnce({
      data: {
        channelKey: 'channel-key',
        customData: '{"userId":"u1"}',
        identityVerificationId: 'dei-request-id',
        storeId: 'store-id',
      },
      error: null,
    });

    await expect(startIdentityVerification()).resolves.toEqual({
      channelKey: 'channel-key',
      customData: '{"userId":"u1"}',
      identityVerificationId: 'dei-request-id',
      storeId: 'store-id',
    });
    expect(functionsInvoke).toHaveBeenCalledWith('start-identity-verification');
  });

  it('confirms verification with the response id when PortOne returns it', async () => {
    functionsInvoke.mockResolvedValueOnce({
      data: { identityVerifiedAt: '2026-05-22T02:00:00.000Z' },
      error: null,
    });

    await confirmIdentityVerification({
      identityVerificationId: 'response-id',
      identityVerificationTxId: 'tx-id',
      transactionType: 'IDENTITY_VERIFICATION',
    });

    expect(functionsInvoke).toHaveBeenCalledWith('confirm-identity-verification', {
      body: {
        identityVerificationId: 'response-id',
        identityVerificationTxId: 'tx-id',
      },
    });
  });

  it('falls back to the started request id when the native redirect response omits it', async () => {
    functionsInvoke.mockResolvedValueOnce({
      data: { identityVerifiedAt: '2026-05-22T02:00:00.000Z' },
      error: null,
    });

    await confirmIdentityVerification(
      {
        identityVerificationTxId: 'tx-id',
        transactionType: 'IDENTITY_VERIFICATION',
      } as IdentityVerificationResponse,
      'started-request-id',
    );

    expect(functionsInvoke).toHaveBeenCalledWith('confirm-identity-verification', {
      body: {
        identityVerificationId: 'started-request-id',
        identityVerificationTxId: 'tx-id',
      },
    });
  });

  it('fails before calling the server when no verification id is available', async () => {
    await expect(
      confirmIdentityVerification({
        identityVerificationTxId: 'tx-id',
        transactionType: 'IDENTITY_VERIFICATION',
      } as IdentityVerificationResponse),
    ).rejects.toThrow('본인확인 결과 식별자를 확인할 수 없어요.');

    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});
