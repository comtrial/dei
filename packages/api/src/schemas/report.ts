/**
 * Shared schema for the admin ↔ mobile contract layer — 신고(Report) 도메인.
 *
 * 새 도메인(rooms-pivot) 의 `public.reports` 테이블과 1:1 매핑.
 * 컬럼:
 *   - reason_code (enum)
 *   - reason_detail (자유 입력, 'other' 일 때 필수)
 *   - status (open / under_review / resolved / dismissed)
 *
 * 둘 다 import (mobile + admin) 해서 단일 source of truth.
 * DB 스키마 변경 시 `pnpm db:gen-types` 와 함께 이 파일도 lock-step 으로 갱신.
 *
 * 결정 source: docs/rooms-spec/decisions.md D10
 */
import { z } from 'zod';

export const ReportReasonCode = z.enum([
  'verbal_abuse',
  'spam',
  'fake_profile',
  'inappropriate_video',
  'harassment',
  'other',
]);

export const ReportStatus = z.enum(['open', 'under_review', 'resolved', 'dismissed']);

export const ReportCreateInput = z
  .object({
    reportedId: z.string().uuid(),
    roomId: z.string().uuid().nullable().optional(),
    reasonCode: ReportReasonCode,
    reasonDetail: z.string().max(2000).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.reasonCode === 'other') {
      const detail = (input.reasonDetail ?? '').trim();
      if (detail.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reasonDetail'],
          message: 'reasonDetail is required when reasonCode is "other"',
        });
      }
    }
  });

export const Report = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid(),
  reportedId: z.string().uuid(),
  roomId: z.string().uuid().nullable(),
  reasonCode: ReportReasonCode,
  reasonDetail: z.string().nullable(),
  status: ReportStatus,
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type ReportReasonCode = z.infer<typeof ReportReasonCode>;
export type ReportStatus = z.infer<typeof ReportStatus>;
export type ReportCreateInput = z.infer<typeof ReportCreateInput>;
export type Report = z.infer<typeof Report>;
