import assert from "node:assert/strict";

import { POLICY } from "../../../packages/shared/src/policy.ts";
import {
  getAppStoreProductId,
  getInstantRematchProduct,
  getInstantRematchProductForAppStore,
} from "./instant-rematch-payment.ts";

const AMOUNT_ENV_NAMES = [
  "PORTONE_INSTANT_REMATCH_AMOUNT_1",
  "PORTONE_INSTANT_REMATCH_AMOUNT_3",
  "PORTONE_INSTANT_REMATCH_AMOUNT_10",
] as const;
const APP_STORE_PRODUCT_ENV_NAMES = [
  "APP_STORE_INSTANT_REMATCH_PRODUCT_ID_1",
  "APP_STORE_INSTANT_REMATCH_PRODUCT_ID_3",
  "APP_STORE_INSTANT_REMATCH_PRODUCT_ID_10",
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

function withAppStoreProductEnv(
  values: Partial<
    Record<(typeof APP_STORE_PRODUCT_ENV_NAMES)[number], string>
  >,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const name of APP_STORE_PRODUCT_ENV_NAMES) {
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
    for (const name of APP_STORE_PRODUCT_ENV_NAMES) {
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

Deno.test("instant rematch App Store product ids default to logical product ids", () => {
  withAppStoreProductEnv(
    {},
    () => {
      assert.equal(
        getAppStoreProductId(POLICY.payment.instantRematchProductId),
        POLICY.payment.instantRematchProductId,
      );
      assert.deepEqual(
        getInstantRematchProductForAppStore({
          appStoreProductId:
            `${POLICY.payment.instantRematchProductId}_pack10`,
          logicalProductId: `${POLICY.payment.instantRematchProductId}_pack10`,
        }),
        {
          appStoreProductId:
            `${POLICY.payment.instantRematchProductId}_pack10`,
          granted: 10,
          id: `${POLICY.payment.instantRematchProductId}_pack10`,
          label: "바로 매치 10회 팩",
        },
      );
    },
  );
});

Deno.test("instant rematch App Store product ids can be configured separately", () => {
  withAppStoreProductEnv(
    {
      APP_STORE_INSTANT_REMATCH_PRODUCT_ID_1: "ios.booster.1",
      APP_STORE_INSTANT_REMATCH_PRODUCT_ID_3: "ios.booster.3",
      APP_STORE_INSTANT_REMATCH_PRODUCT_ID_10: "ios.booster.10",
    },
    () => {
      assert.equal(
        getAppStoreProductId(
          `${POLICY.payment.instantRematchProductId}_pack3`,
        ),
        "ios.booster.3",
      );
      assert.deepEqual(
        getInstantRematchProductForAppStore({
          appStoreProductId: "ios.booster.10",
          logicalProductId: null,
        }),
        {
          appStoreProductId: "ios.booster.10",
          granted: 10,
          id: `${POLICY.payment.instantRematchProductId}_pack10`,
          label: "바로 매치 10회 팩",
        },
      );
      assert.throws(
        () =>
          getInstantRematchProductForAppStore({
            appStoreProductId: "ios.booster.3",
            logicalProductId: POLICY.payment.instantRematchProductId,
          }),
        /App Store product id does not match/,
      );
    },
  );
});
