import { POLICY } from "../../../packages/shared/src/policy.ts";

export type InstantRematchProduct = {
  amount: number;
  granted: number;
  id: string;
  label: string;
};

type InstantRematchProductConfig = Omit<InstantRematchProduct, "amount"> & {
  amountEnv: string;
  appStoreProductEnv: string;
};

type EnvGetter = (name: string) => string | undefined;

const INSTANT_REMATCH_PRODUCT_CONFIGS: InstantRematchProductConfig[] = [
  {
    amountEnv: "PORTONE_INSTANT_REMATCH_AMOUNT_1",
    appStoreProductEnv: "APP_STORE_INSTANT_REMATCH_PRODUCT_ID_1",
    granted: 1,
    id: POLICY.payment.instantRematchProductId,
    label: "바로 매치 1회",
  },
  {
    amountEnv: "PORTONE_INSTANT_REMATCH_AMOUNT_3",
    appStoreProductEnv: "APP_STORE_INSTANT_REMATCH_PRODUCT_ID_3",
    granted: 3,
    id: `${POLICY.payment.instantRematchProductId}_pack3`,
    label: "바로 매치 3회 팩",
  },
  {
    amountEnv: "PORTONE_INSTANT_REMATCH_AMOUNT_10",
    appStoreProductEnv: "APP_STORE_INSTANT_REMATCH_PRODUCT_ID_10",
    granted: 10,
    id: `${POLICY.payment.instantRematchProductId}_pack10`,
    label: "바로 매치 10회 팩",
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

function getDenoEnv(name: string) {
  return Deno.env.get(name);
}

export function getAppStoreProductId(
  productId?: string | null,
  getEnv: EnvGetter = getDenoEnv,
) {
  const config = getInstantRematchProductConfig(productId);
  return getEnv(config.appStoreProductEnv) || config.id;
}

export function getInstantRematchProductForAppStore({
  appStoreProductId,
  getEnv = getDenoEnv,
  logicalProductId,
}: {
  appStoreProductId?: string | null;
  getEnv?: EnvGetter;
  logicalProductId?: string | null;
}) {
  const expectedConfig = logicalProductId
    ? INSTANT_REMATCH_PRODUCT_CONFIGS.find((product) =>
      product.id === logicalProductId
    )
    : null;
  const normalizedAppStoreProductId = appStoreProductId?.trim() || null;

  if (logicalProductId && !expectedConfig) {
    throw new Error("unsupported instant rematch product id");
  }

  const config = expectedConfig ??
    INSTANT_REMATCH_PRODUCT_CONFIGS.find((product) => {
      const configuredId = getEnv(product.appStoreProductEnv) ||
        product.id;
      return configuredId === normalizedAppStoreProductId ||
        product.id === normalizedAppStoreProductId;
    }) ??
    INSTANT_REMATCH_PRODUCT_CONFIGS[0];
  const configuredAppStoreProductId =
    getEnv(config.appStoreProductEnv) || config.id;

  if (
    normalizedAppStoreProductId &&
    normalizedAppStoreProductId !== configuredAppStoreProductId &&
    normalizedAppStoreProductId !== config.id
  ) {
    throw new Error(
      "App Store product id does not match the requested booster product",
    );
  }

  return {
    appStoreProductId: configuredAppStoreProductId,
    granted: config.granted,
    id: config.id,
    label: config.label,
  };
}

export function getRequiredPaymentEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}
