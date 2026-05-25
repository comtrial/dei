import { describe, expect, it } from 'vitest';

import { Report, ReportCreateInput } from '../report';

describe('ReportCreateInput (rooms-pivot)', () => {
  const baseInput = {
    reportedId: '00000000-0000-4000-8000-000000000002',
    roomId: null,
  };

  it('accepts a valid input with a fixed reason code', () => {
    const result = ReportCreateInput.safeParse({
      ...baseInput,
      reasonCode: 'harassment',
    });
    expect(result.success).toBe(true);
  });

  it('requires reasonDetail when reasonCode is "other"', () => {
    expect(
      ReportCreateInput.safeParse({
        ...baseInput,
        reasonCode: 'other',
      }).success,
    ).toBe(false);

    expect(
      ReportCreateInput.safeParse({
        ...baseInput,
        reasonCode: 'other',
        reasonDetail: '   ',
      }).success,
    ).toBe(false);

    const ok = ReportCreateInput.safeParse({
      ...baseInput,
      reasonCode: 'other',
      reasonDetail: '실제 사유 설명',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown reason codes', () => {
    expect(
      ReportCreateInput.safeParse({
        ...baseInput,
        reasonCode: 'bogus',
      }).success,
    ).toBe(false);
  });

  it('rejects oversize reasonDetail', () => {
    expect(
      ReportCreateInput.safeParse({
        ...baseInput,
        reasonCode: 'spam',
        reasonDetail: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
  });
});

describe('Report (full record)', () => {
  const sample = {
    id: '00000000-0000-4000-8000-000000000001',
    reporterId: '00000000-0000-4000-8000-000000000002',
    reportedId: '00000000-0000-4000-8000-000000000003',
    roomId: null,
    reasonCode: 'spam' as const,
    reasonDetail: null,
    status: 'open' as const,
    reviewedBy: null,
    reviewedAt: null,
    resolutionNote: null,
    createdAt: '2026-05-26T12:00:00.000Z',
  };

  it('round-trips a valid record', () => {
    expect(Report.parse(sample)).toEqual(sample);
  });

  it('rejects an invalid status enum value', () => {
    expect(
      Report.safeParse({
        ...sample,
        status: 'bogus',
      }).success,
    ).toBe(false);
  });
});
