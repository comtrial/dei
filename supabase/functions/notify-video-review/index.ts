import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Source = "logs" | "profile_videos";

interface IncomingPayload {
  source: Source;
  record: Record<string, unknown> & { id?: string; user_id?: string };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface RuntimeConfig {
  slackWebhookUrl: string;
  adminBaseUrl: string;
  sharedSecret: string;
}

let cachedConfig: RuntimeConfig | null = null;

async function loadConfig(client: SupabaseClient): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  const { data, error } = await client.rpc("_video_review_notify_config");
  if (error) throw new Error(`config rpc failed: ${error.message}`);

  const map = (data ?? {}) as Record<string, string>;
  const slackWebhookUrl = map.slack_video_review_webhook_url ?? "";
  if (!slackWebhookUrl) {
    throw new Error("vault secret slack_video_review_webhook_url is not set");
  }

  cachedConfig = {
    slackWebhookUrl,
    adminBaseUrl: (map.video_review_admin_base_url ?? "https://dei-admin.vercel.app").replace(/\/$/, ""),
    sharedSecret: map.video_review_notify_secret ?? "",
  };
  return cachedConfig;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function durationLabel(source: Source, record: IncomingPayload["record"]): string | null {
  if (source === "logs" && typeof record.duration_sec === "number") {
    return `${record.duration_sec}초`;
  }
  if (source === "profile_videos" && typeof record.duration_ms === "number") {
    return `${(record.duration_ms / 1000).toFixed(1)}초`;
  }
  return null;
}

function reviewLink(adminBaseUrl: string, source: Source, recordId: string): string {
  return source === "logs"
    ? `${adminBaseUrl}/reviews/${recordId}`
    : `${adminBaseUrl}/reviews?tab=photo`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "supabase env not configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let config: RuntimeConfig;
  try {
    config = await loadConfig(supabase);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  if (config.sharedSecret) {
    const provided = req.headers.get("x-notify-secret");
    if (provided !== config.sharedSecret) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  }

  let payload: IncomingPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const { source, record } = payload;
  if (source !== "logs" && source !== "profile_videos") {
    return jsonResponse({ error: "unknown source" }, 400);
  }
  if (!record?.id || !record?.user_id) {
    return jsonResponse({ error: "missing record fields" }, 400);
  }

  let nickname = `user:${String(record.user_id).slice(0, 8)}`;
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", record.user_id)
    .maybeSingle();
  if (profile?.nickname) nickname = profile.nickname as string;

  const title =
    source === "logs"
      ? "신규 일일 영상 검수 요청"
      : "신규 프로필 영상 검수 요청";

  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*닉네임*\n${nickname}` },
    { type: "mrkdwn", text: `*영상 ID*\n\`${record.id}\`` },
  ];
  const dur = durationLabel(source, record);
  if (dur) fields.push({ type: "mrkdwn", text: `*길이*\n${dur}` });
  fields.push({
    type: "mrkdwn",
    text: `*업로드*\n<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|just now>`,
  });

  const slackMessage = {
    text: `${title} — ${nickname}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: title } },
      { type: "section", fields },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "검수 페이지로 이동" },
            url: reviewLink(config.adminBaseUrl, source, String(record.id)),
            style: "primary",
          },
        ],
      },
    ],
  };

  const slackRes = await fetch(config.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slackMessage),
  });

  if (!slackRes.ok) {
    const body = await slackRes.text();
    return jsonResponse(
      { error: "slack post failed", status: slackRes.status, body },
      502,
    );
  }

  return jsonResponse({ ok: true });
});
