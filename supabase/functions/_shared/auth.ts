import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

export function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service environment is not configured');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  const token = authorization?.replace('Bearer ', '').trim();

  if (!token) {
    throw new Error('authentication required');
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error('authentication required');
  }

  return { supabase, user: data.user };
}
