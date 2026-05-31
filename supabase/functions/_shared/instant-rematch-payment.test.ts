import assert from 'node:assert/strict';

import { POLICY } from '../../../packages/shared/src/policy.ts';
import { getInstantRematchProduct } from './instant-rematch-payment.ts';

const AMOUNT_ENV_NAMES = [
  'PORTONE_INSTANT_REMATCH_AMOUNT_1',
  'PORTONE_INSTANT_REMATCH_AMOUNT_3',
  'PORTONE_INSTANT_REMATCH_AMOUNT_10',
] as const;

function withAmountEnv(
  values: Partial<Record<(typeof AMOUNT_ENV_NAMES)[number], string>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const name of AMOUNT_ENV_NAMES) {
    previous.set(name, Deno.env.get(name));
    const value = values[name];
    if (value === undefined) {
      Deno.env.delete(name);
    } else {
      Deno.env.set(name, value);
    }
  }

  try {
    run();
  } finally {
    for (const name of AMOUNT_ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) {
        Deno.env.delete(name);
      } else {
        Deno.env.set(name, value);
      }
    }
  }
}

Deno.test('instant rematch products read payment amounts from environment', () => {
  withAmountEnv(
    {
      PORTONE_INSTANT_REMATCH_AMOUNT_1: '1000',
      PORTONE_INSTANT_REMATCH_AMOUNT_3: '2700',
      PORTONE_INSTANT_REMATCH_AMOUNT_10: '8000',
    },
    () => {
      assert.equal(getInstantRematchProduct().amount, 1000);
      assert.equal(getInstantRematchProduct(POLICY.payment.instantRematchProductId).granted, 1);
      assert.equal(
        getInstantRematchProduct(`${POLICY.payment.instantRematchProductId}_pack3`).amount,
        2700,
      );
      assert.equal(
        getInstantRematchProduct(`${POLICY.payment.instantRematchProductId}_pack10`).granted,
        10,
      );
    },
  );
});

Deno.test('instant rematch payment amount env is required and validated', () => {
  withAmountEnv(
    {
      PORTONE_INSTANT_REMATCH_AMOUNT_3: '2700',
      PORTONE_INSTANT_REMATCH_AMOUNT_10: '8000',
    },
    () => {
      assert.throws(
        () => getInstantRematchProduct(),
        /PORTONE_INSTANT_REMATCH_AMOUNT_1 is not configured/,
      );
    },
  );

  withAmountEnv(
    {
      PORTONE_INSTANT_REMATCH_AMOUNT_1: 'not-a-number',
      PORTONE_INSTANT_REMATCH_AMOUNT_3: '2700',
      PORTONE_INSTANT_REMATCH_AMOUNT_10: '8000',
    },
    () => {
      assert.throws(
        () => getInstantRematchProduct(),
        /PORTONE_INSTANT_REMATCH_AMOUNT_1 must be a positive integer amount/,
      );
    },
  );
});
