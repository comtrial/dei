import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  try {
    const storeId = getRequiredEnv('PORTONE_STORE_ID');
    const channelKey = getRequiredEnv('PORTONE_IDENTITY_CHANNEL_KEY');
    const { supabase, user } = await getAuthenticatedUser(req);
    const identityVerificationId = `dei-${crypto.randomUUID()}`;
    const customData = JSON.stringify({ userId: user.id });

    const { error } = await supabase.from('identity_verifications').insert({
      provider: 'portone',
      provider_metadata: {
        source: 'mobile',
      },
      provider_verification_id: identityVerificationId,
      status: 'pending',
      user_id: user.id,
    });

    if (error) {
      throw error;
    }

    return jsonResponse({
      channelKey,
      customData,
      identityVerificationId,
      storeId,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'failed to start verification');
  }
});
