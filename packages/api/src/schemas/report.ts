/**
 * Shared schema example for the admin ↔ mobile contract layer.
 *
 * Pattern: declare zod schemas here, derive TS types via z.infer, then have
 * both the mobile app and the (future) admin service import this single
 * source of truth. If the DB shape changes, regenerate types via
 * `pnpm db:gen-types` and update the schema in lock-step.
 */
import { z } from 'zod';

export const ReportStatus = z.enum(['draft', 'submitted', 'reviewed', 'closed']);

export const ReportCreateInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  category: z.string().min(1).max(50),
});

export const Report = ReportCreateInput.extend({
  id: z.string().uuid(),
  status: ReportStatus,
  createdAt: z.string().datetime(),
  authorId: z.string().uuid(),
});

export type ReportStatus = z.infer<typeof ReportStatus>;
export type ReportCreateInput = z.infer<typeof ReportCreateInput>;
export type Report = z.infer<typeof Report>;
