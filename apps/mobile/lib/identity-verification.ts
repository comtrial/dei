import type {
  IdentityVerificationRequest,
  IdentityVerificationResponse,
} from '@portone/browser-sdk/v2';

import { supabase } from '@/lib/supabase';

type StartIdentityVerificationResponse = {
  channelKey: string;
  customData?: string;
  identityVerificationId: string;
  storeId: string;
};

type ConfirmIdentityVerificationResponse = {
  identityVerifiedAt: string;
};

type FunctionInvokeError = {
  context?: Response;
  message?: string;
};

const getFriendlyFunctionErrorMessage = (message: string) => {
  if (message === '이미 가입된 본인확인 정보입니다.') {
    return '이미 가입된 본인확인 정보예요. 기존 계정 복구/연결 흐름으로 이어가야 합니다.';
  }

  if (/PORTONE_|PHONE_HASH_SALT/.test(message) && /configured/.test(message)) {
    return 'PortOne 설정값이 아직 없어요. 로컬 .env에 PORTONE_STORE_ID, PORTONE_IDENTITY_CHANNEL_KEY, PORTONE_API_SECRET, PHONE_HASH_SALT를 넣고 Supabase를 재시작해 주세요.';
  }

  return message;
};

const getFunctionErrorMessage = async (
  fallback: string,
  error?: FunctionInvokeError | null,
) => {
  if (!error) {
    return fallback;
  }

  if (error.context) {
    try {
      const payload = await error.context.clone().json() as {
        error?: string;
        message?: string;
        msg?: string;
      };
      const message = payload.error ?? payload.message ?? payload.msg;

      if (message) {
        return getFriendlyFunctionErrorMessage(message);
      }
    } catch {
      // Keep the SDK message below when the function body is not JSON.
    }
  }

  return getFriendlyFunctionErrorMessage(error.message || fallback);
};

export async function startIdentityVerification(): Promise<IdentityVerificationRequest> {
  const { data, error } = await supabase.functions.invoke<StartIdentityVerificationResponse>(
    'start-identity-verification',
  );

  if (error || !data) {
    throw new Error(await getFunctionErrorMessage('본인확인을 시작할 수 없어요.', error));
  }

  return {
    channelKey: data.channelKey,
    customData: data.customData,
    identityVerificationId: data.identityVerificationId,
    storeId: data.storeId,
  };
}

export async function confirmIdentityVerification(response: IdentityVerificationResponse) {
  if (response.code) {
    throw new Error(response.message || '본인확인이 완료되지 않았어요.');
  }

  const { data, error } = await supabase.functions.invoke<ConfirmIdentityVerificationResponse>(
    'confirm-identity-verification',
    {
      body: {
        identityVerificationId: response.identityVerificationId,
        identityVerificationTxId: response.identityVerificationTxId,
      },
    },
  );

  if (error || !data) {
    throw new Error(await getFunctionErrorMessage('본인확인 결과를 저장할 수 없어요.', error));
  }

  return data;
}
