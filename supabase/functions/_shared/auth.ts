import { createClient } from 'jsr:@supabase/supabase-js@2';

function env() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service environment is not configured');
  }
  return { supabaseUrl, serviceRoleKey, anonKey };
}

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = env();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  const token = authorization?.replace('Bearer ', '').trim();

  if (!token) {
    throw new Error('authentication required');
  }

  const { supabaseUrl, serviceRoleKey, anonKey } = env();

  // 토큰 검증 + 기본 클라이언트는 service-role 로.
  //
  // `supabase` 는 service-role (RLS 우회). identity-verification /
  // sync-refresh-purchase 처럼 *다른 사용자 행 접근* 또는 service_role 에만
  // grant 된 RPC(transfer_existing_member_account, grant_refresh_item) 와
  // `auth.admin.*` 를 쓰는 함수가 이 클라이언트에 의존한다 — 이 계약을
  // 바꾸면 그 함수들이 permission denied 로 조용히 깨진다.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('authentication required');
  }

  // `supabaseAsUser` 는 *호출 사용자의 JWT* 를 단 클라이언트 — RLS +
  // auth.uid() 가 그 사용자로 평가된다. send_message / leave_conversation
  // 같이 `authenticated` 에 grant 되고 내부에서 auth.uid() 를 쓰는
  // SECURITY DEFINER RPC 는 *반드시* 이 클라이언트로 호출해야 한다
  // (service-role 로 부르면 auth.uid() 가 NULL → 'authentication required'
  // 거절. 이게 실제 채팅 전송실패 결함이었다).
  const supabaseAsUser = createClient(supabaseUrl, anonKey ?? serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return { supabase, supabaseAsUser, user: data.user };
}
