/**
 * 앱의 FLAG_CATALOG 를 Supabase feature_flags 에 등록(메타만).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm register-flags
 *
 * 각 flag 의 kind/options 만 UPDATE. default_value/enabled/rollout_* 는 절대
 * 건드리지 않는다. flag row 가 없으면 건너뛴다(생성은 admin 책임).
 */
import { createClient } from "@supabase/supabase-js";
import { FLAG_CATALOG } from "../lib/feature-flags-catalog";

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  for (const [key, entry] of Object.entries(FLAG_CATALOG)) {
    const { data, error } = await supabase
      .from("feature_flags")
      .update({ kind: entry.kind, options: entry.options })
      .eq("key", key)
      .select("key");
    if (error) {
      console.error(`✗ ${key}: ${error.message}`);
      process.exitCode = 1;
    } else if (!data || data.length === 0) {
      console.warn(`- ${key}: row 없음 (admin 에서 먼저 생성 필요) — 건너뜀`);
    } else {
      console.log(`✓ ${key}: kind=${entry.kind}, options=${entry.options.length}개`);
    }
  }
}

main();
