import { describe, expect, it } from 'vitest';

import { Report, ReportCreateInput } from '../report';

describe('ReportCreateInput', () => {
  it('accepts a valid input', () => {
    const result = ReportCreateInput.safeParse({
      title: 'broken',
      body: 'door does not lock',
      category: 'safety',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty fields', () => {
    expect(ReportCreateInput.safeParse({ title: '', body: 'x', category: 'c' }).success).toBe(
      false,
    );
    expect(ReportCreateInput.safeParse({ title: 'x', body: '', category: 'c' }).success).toBe(
      false,
    );
  });

  it('rejects oversize fields', () => {
    expect(
      ReportCreateInput.safeParse({
        title: 'x'.repeat(201),
        body: 'ok',
        category: 'c',
      }).success,
    ).toBe(false);
  });
});

describe('Report (full)', () => {
  it('round-trips a valid record', () => {
    const sample = {
      id: '00000000-0000-4000-8000-000000000001',
      authorId: '00000000-0000-4000-8000-000000000002',
      title: 't',
      body: 'b',
      category: 'safety',
      status: 'submitted' as const,
      createdAt: '2026-05-04T12:00:00.000Z',
    };
    expect(Report.parse(sample)).toEqual(sample);
  });

  it('rejects an invalid status enum value', () => {
    expect(
      Report.safeParse({
        id: '00000000-0000-4000-8000-000000000001',
        authorId: '00000000-0000-4000-8000-000000000002',
        title: 't',
        body: 'b',
        category: 'safety',
        status: 'bogus',
        createdAt: '2026-05-04T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
