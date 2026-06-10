import { assertEquals } from 'jsr:@std/assert';

import { getRoomRematchCooldownAnchor } from './rematch-room.ts';

Deno.test('room rematch cooldown starts from room creation, not leave time', () => {
  assertEquals(
    getRoomRematchCooldownAnchor(
      '2026-06-01T00:00:00.000Z',
      '2026-06-02T01:00:00.000Z',
    ),
    '2026-06-01T00:00:00.000Z',
  );
});

Deno.test('room rematch cooldown falls back to leave time when room creation is missing', () => {
  assertEquals(
    getRoomRematchCooldownAnchor(null, '2026-06-02T01:00:00.000Z'),
    '2026-06-02T01:00:00.000Z',
  );
});
