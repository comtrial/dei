import assert from "node:assert/strict";

import { POLICY } from "../../../packages/shared/src/policy.ts";
import {
  getInstantRematchProduct,
  getInstantRematchProductForRevenueCat,
  getRevenueCatProductId,
} from "./instant-rematch-payment.ts";

const AMOUNT_ENV_NAMES = [
  "PORTONE_INSTANT_REMATCH_AMOUNT_1",
  "PORTONE_INSTANT_REMATCH_AMOUNT_3",
  "PORTONE_INSTANT_REMATCH_AMOUNT_10",
] as const;
const REVENUECAT_PRODUCT_ENV_NAMES = [
  "REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_1",
  "REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_3",
  "REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_10",
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

function withRevenueCatProductEnv(
  values: Partial<
    Record<(typeof REVENUECAT_PRODUCT_ENV_NAMES)[number], string>
  >,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const name of REVENUECAT_PRODUCT_ENV_NAMES) {
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
    for (const name of REVENUECAT_PRODUCT_ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) {
        Deno.env.delete(name);
      } else {
        Deno.env.set(name, value);
      }
    }
  }
}

Deno.test("instant rematch products read payment amounts from environment", () => {
  withAmountEnv(
    {
      PORTONE_INSTANT_REMATCH_AMOUNT_1: "1000",
      PORTONE_INSTANT_REMATCH_AMOUNT_3: "2700",
      PORTONE_INSTANT_REMATCH_AMOUNT_10: "8000",
    },
    () => {
      assert.equal(getInstantRematchProduct().amount, 1000);
      assert.equal(
        getInstantRematchProduct(POLICY.payment.instantRematchProductId)
          .granted,
        1,
      );
      assert.equal(
        getInstantRematchProduct(
          `${POLICY.payment.instantRematchProductId}_pack3`,
        ).amount,
        2700,
      );
      assert.equal(
        getInstantRematchProduct(
          `${POLICY.payment.instantRematchProductId}_pack10`,
        ).granted,
        10,
      );
    },
  );
});

Deno.test("instant rematch payment amount env is required and validated", () => {
  withAmountEnv(
    {
      PORTONE_INSTANT_REMATCH_AMOUNT_3: "2700",
      PORTONE_INSTANT_REMATCH_AMOUNT_10: "8000",
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
      PORTONE_INSTANT_REMATCH_AMOUNT_1: "not-a-number",
      PORTONE_INSTANT_REMATCH_AMOUNT_3: "2700",
      PORTONE_INSTANT_REMATCH_AMOUNT_10: "8000",
    },
    () => {
      assert.throws(
        () => getInstantRematchProduct(),
        /PORTONE_INSTANT_REMATCH_AMOUNT_1 must be a positive integer amount/,
      );
    },
  );
});

Deno.test("instant rematch RevenueCat product ids default to logical product ids", () => {
  withRevenueCatProductEnv(
    {},
    () => {
      assert.equal(
        getRevenueCatProductId(POLICY.payment.instantRematchProductId),
        POLICY.payment.instantRematchProductId,
      );
      assert.deepEqual(
        getInstantRematchProductForRevenueCat({
          logicalProductId: `${POLICY.payment.instantRematchProductId}_pack10`,
          revenueCatProductId:
            `${POLICY.payment.instantRematchProductId}_pack10`,
        }),
        {
          granted: 10,
          id: `${POLICY.payment.instantRematchProductId}_pack10`,
          label: "바로 매치 10회 팩",
          revenueCatProductId:
            `${POLICY.payment.instantRematchProductId}_pack10`,
        },
      );
    },
  );
});

Deno.test("instant rematch RevenueCat product ids can be configured separately", () => {
  withRevenueCatProductEnv(
    {
      REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_1: "ios.booster.1",
      REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_3: "ios.booster.3",
      REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_10: "ios.booster.10",
    },
    () => {
      assert.equal(
        getRevenueCatProductId(
          `${POLICY.payment.instantRematchProductId}_pack3`,
        ),
        "ios.booster.3",
      );
      assert.deepEqual(
        getInstantRematchProductForRevenueCat({
          logicalProductId: null,
          revenueCatProductId: "ios.booster.10",
        }),
        {
          granted: 10,
          id: `${POLICY.payment.instantRematchProductId}_pack10`,
          label: "바로 매치 10회 팩",
          revenueCatProductId: "ios.booster.10",
        },
      );
      assert.throws(
        () =>
          getInstantRematchProductForRevenueCat({
            logicalProductId: POLICY.payment.instantRematchProductId,
            revenueCatProductId: "ios.booster.3",
          }),
        /RevenueCat product id does not match/,
      );
    },
  );
});
