/**
 * Contract test scaffold (rooms-pivot).
 *
 * Pattern: admin service 가 mobile 에 노출하는 응답을 MSW 로 mock 한 뒤,
 * 공유 zod schema (`packages/api/src/schemas/`) 로 파싱해 검증한다.
 * 와이어 shape 가 schema 와 어긋나면 이 테스트가 즉시 실패 — 사용자 도달 전
 * contract drift 를 잡는 게이트.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Report } from '../schemas/report';

const sampleWireReport = {
  id: '00000000-0000-4000-8000-000000000001',
  reporterId: '00000000-0000-4000-8000-000000000002',
  reportedId: '00000000-0000-4000-8000-000000000003',
  roomId: null,
  reasonCode: 'harassment',
  reasonDetail: null,
  status: 'under_review',
  reviewedBy: null,
  reviewedAt: null,
  resolutionNote: null,
  createdAt: '2026-05-26T12:00:00.000Z',
};

const server = setupServer(
  http.get('https://admin.example.test/reports/:id', ({ params }) =>
    HttpResponse.json({
      ...sampleWireReport,
      id: params.id,
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('admin → mobile contract: GET /reports/:id', () => {
  it('parses the wire response with the shared Report schema', async () => {
    const res = await fetch(
      'https://admin.example.test/reports/00000000-0000-4000-8000-000000000001',
    );
    const body = await res.json();

    const parsed = Report.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it('flags drift when wire response omits a required field', async () => {
    server.use(
      http.get('https://admin.example.test/reports/:id', () =>
        HttpResponse.json({
          ...sampleWireReport,
          reporterId: undefined,  // 누락 → contract drift
        }),
      ),
    );

    const res = await fetch('https://admin.example.test/reports/x');
    const body = await res.json();
    expect(Report.safeParse(body).success).toBe(false);
  });

  it('flags drift when reasonCode is unknown', async () => {
    server.use(
      http.get('https://admin.example.test/reports/:id', () =>
        HttpResponse.json({
          ...sampleWireReport,
          reasonCode: 'unknown_legacy_code',
        }),
      ),
    );

    const res = await fetch('https://admin.example.test/reports/x');
    const body = await res.json();
    expect(Report.safeParse(body).success).toBe(false);
  });
});
