// packages/api/src/schemas/sendMessage.ts
import { z } from 'zod';

/** 글자수 = code point (char_length 와 동일 단위). [...s].length 로 측정. */
function codePointLength(s: string): number {
  return [...s].length;
}

export const sendMessageRequestSchema = z.object({
  room_id: z.string().uuid(),
  body: z
    .string()
    .refine((s) => codePointLength(s.trim()) >= 1, { message: 'body_length' })
    .refine((s) => codePointLength(s.trim()) <= 500, { message: 'body_length' }),
  whisper_to_user_id: z.string().uuid().nullable().optional(),
  client_msg_id: z.string().uuid(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const sendMessageResponseSchema = z.object({
  ok: z.literal(true),
  deduped: z.boolean(),
  message: z.object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    user_id: z.string().uuid(),
    body: z.string(),
    whisper_to_user_id: z.string().uuid().nullable(),
    created_at: z.string(),
  }),
});
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

export const SEND_MESSAGE_ERROR = {
  invalid_payload: 400,
  unauthenticated: 401,
  not_room_member: 403,
  room_not_active: 409,
  invalid_whisper_target: 422,
  body_length: 422,
} as const;
export type SendMessageErrorCode = keyof typeof SEND_MESSAGE_ERROR;
