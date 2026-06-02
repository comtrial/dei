// apps/mobile/lib/chat/send-message.ts
import { supabase } from '@/lib/supabase';

export interface SendArgs {
  roomId: string;
  body: string;
  whisperToUserId: string | null;
  clientMsgId: string;
}
export interface SentMessage {
  id: string; room_id: string; user_id: string;
  body: string; whisper_to_user_id: string | null; created_at: string;
}
export class SendMessageError extends Error {
  constructor(public code: string, public reason?: string) {
    super(code);
    this.name = 'SendMessageError';
  }
}

function isFetchError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError';
}

// `send_room_message` RPC 는 마이그레이션(Task 7) 적용 후 db:gen-types 로
// database.types.ts 에 반영된다. 타입 산출이 아직 안 된 환경에서도 이 글루의
// 런타임 계약(인자·반환)을 명시적으로 고정해 typecheck 를 유지한다.
interface SendRoomMessageRpcArgs {
  p_room_id: string;
  p_body: string;
  p_whisper_to_user_id: string | null;
  p_client_msg_id: string;
}
type RpcCaller = (
  fn: 'send_room_message',
  args: SendRoomMessageRpcArgs,
) => Promise<{ data: SentMessage | null; error: { message?: string } | null }>;

export async function sendRoomMessage(args: SendArgs): Promise<{ message: SentMessage; deduped: boolean }> {
  const { data, error } = await supabase.functions.invoke('send-message', {
    body: {
      room_id: args.roomId,
      body: args.body,
      whisper_to_user_id: args.whisperToUserId,
      client_msg_id: args.clientMsgId,
    },
  });

  // 1차: Edge 성공
  if (!error && data?.ok) {
    return { message: data.message as SentMessage, deduped: Boolean(data.deduped) };
  }
  // Edge가 닿았지만 4xx 구조화 에러를 본문에 실어준 경우
  if (data?.error && !isFetchError(error)) {
    throw new SendMessageError(String(data.error), data.reason as string | undefined);
  }
  // 네트워크/relay 실패 → RPC 폴백 (Edge 미배포·일시 장애 흡수)
  if (error && isFetchError(error)) {
    const callRpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
    const { data: rpcData, error: rpcErr } = await callRpc('send_room_message', {
      p_room_id: args.roomId, p_body: args.body,
      p_whisper_to_user_id: args.whisperToUserId, p_client_msg_id: args.clientMsgId,
    });
    if (rpcErr) {
      const reason = rpcErr.message?.startsWith('invalid_whisper_target')
        ? rpcErr.message.split(':')[1] : undefined;
      throw new SendMessageError(rpcErr.message ?? 'send_failed', reason);
    }
    return { message: rpcData as SentMessage, deduped: false };
  }
  throw new SendMessageError(error?.message ?? 'send_failed');
}
