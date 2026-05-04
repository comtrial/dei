/**
 * Contract test scaffold.
 *
 * Pattern: when the admin service exposes an endpoint that the mobile app
 * consumes, mock the wire response with MSW here, then validate the parsed
 * body against the shared zod schema. If the admin team changes the wire
 * shape and forgets to update the schema, this test fails — surfacing the
 * contract drift before it reaches users.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Report } from '../schemas/report';

const server = setupServer(
  http.get('https://admin.example.test/reports/:id', ({ params }) =>
    HttpResponse.json({
      id: params.id,
      authorId: '00000000-0000-4000-8000-000000000002',
      title: 'wire title',
      body: 'wire body',
      category: 'safety',
      status: 'submitted',
      createdAt: '2026-05-04T12:00:00.000Z',
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('admin → mobile contract: GET /reports/:id', () => {
  it('parses the wire response with the shared Report schema', async () => {
    const res = await fetch('https://admin.example.test/reports/00000000-0000-4000-8000-000000000001');
    const body = await res.json();

    const parsed = Report.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it('flags drift when wire response omits a required field', async () => {
    server.use(
      http.get('https://admin.example.test/reports/:id', () =>
        HttpResponse.json({
          id: '00000000-0000-4000-8000-000000000001',
          // authorId missing → contract drift
          title: 't',
          body: 'b',
          category: 'safety',
          status: 'submitted',
          createdAt: '2026-05-04T12:00:00.000Z',
        }),
      ),
    );

    const res = await fetch('https://admin.example.test/reports/x');
    const body = await res.json();
    expect(Report.safeParse(body).success).toBe(false);
  });
});
