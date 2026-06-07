import { POLICY } from "../../../packages/shared/src/policy.ts";

export type InstantRematchProduct = {
  amount: number;
  granted: number;
  id: string;
  label: string;
};

type InstantRematchProductConfig = Omit<InstantRematchProduct, "amount"> & {
  amountEnv: string;
  revenueCatProductEnv: string;
};

const INSTANT_REMATCH_PRODUCT_CONFIGS: InstantRematchProductConfig[] = [
  {
    amountEnv: "PORTONE_INSTANT_REMATCH_AMOUNT_1",
    granted: 1,
    id: POLICY.payment.instantRematchProductId,
    label: "바로 매치 1회",
    revenueCatProductEnv: "REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_1",
  },
  {
    amountEnv: "PORTONE_INSTANT_REMATCH_AMOUNT_3",
    granted: 3,
    id: `${POLICY.payment.instantRematchProductId}_pack3`,
    label: "바로 매치 3회 팩",
    revenueCatProductEnv: "REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_3",
  },
  {
    amountEnv: "PORTONE_INSTANT_REMATCH_AMOUNT_10",
    granted: 10,
    id: `${POLICY.payment.instantRematchProductId}_pack10`,
    label: "바로 매치 10회 팩",
    revenueCatProductEnv: "REVENUECAT_INSTANT_REMATCH_PRODUCT_ID_10",
  },
];

function getRequiredPaymentAmount(name: string) {
  const value = getRequiredPaymentEnv(name);
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${name} must be a positive integer amount`);
  }

  return amount;
}

export function getInstantRematchProduct(productId?: string | null) {
  const config = getInstantRematchProductConfig(productId);

  return {
    amount: getRequiredPaymentAmount(config.amountEnv),
    granted: config.granted,
    id: config.id,
    label: config.label,
  };
}

export function getInstantRematchProductConfig(productId?: string | null) {
  return INSTANT_REMATCH_PRODUCT_CONFIGS.find((product) =>
    product.id === productId
  ) ??
    INSTANT_REMATCH_PRODUCT_CONFIGS[0];
}

export function getRevenueCatProductId(productId?: string | null) {
  const config = getInstantRematchProductConfig(productId);
  return Deno.env.get(config.revenueCatProductEnv) || config.id;
}

export function getInstantRematchProductForRevenueCat({
  logicalProductId,
  revenueCatProductId,
}: {
  logicalProductId?: string | null;
  revenueCatProductId?: string | null;
}) {
  const expectedConfig = logicalProductId
    ? INSTANT_REMATCH_PRODUCT_CONFIGS.find((product) =>
      product.id === logicalProductId
    )
    : null;
  const normalizedRevenueCatProductId = revenueCatProductId?.trim() || null;

  if (logicalProductId && !expectedConfig) {
    throw new Error("unsupported instant rematch product id");
  }

  const config = expectedConfig ??
    INSTANT_REMATCH_PRODUCT_CONFIGS.find((product) => {
      const configuredId = Deno.env.get(product.revenueCatProductEnv) ||
        product.id;
      return configuredId === normalizedRevenueCatProductId ||
        product.id === normalizedRevenueCatProductId;
    }) ??
    INSTANT_REMATCH_PRODUCT_CONFIGS[0];
  const configuredRevenueCatProductId =
    Deno.env.get(config.revenueCatProductEnv) || config.id;

  if (
    normalizedRevenueCatProductId &&
    normalizedRevenueCatProductId !== configuredRevenueCatProductId &&
    normalizedRevenueCatProductId !== config.id
  ) {
    throw new Error(
      "RevenueCat product id does not match the requested booster product",
    );
  }

  return {
    granted: config.granted,
    id: config.id,
    label: config.label,
    revenueCatProductId: configuredRevenueCatProductId,
  };
}

export function getRequiredPaymentEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}
