import { POLICY } from '../../../packages/shared/src/policy.ts';

export type InstantRematchProduct = {
  amount: number;
  granted: number;
  id: string;
  label: string;
};

type InstantRematchProductConfig = Omit<InstantRematchProduct, 'amount'> & {
  amountEnv: string;
};

const INSTANT_REMATCH_PRODUCT_CONFIGS: InstantRematchProductConfig[] = [
  {
    amountEnv: 'PORTONE_INSTANT_REMATCH_AMOUNT_1',
    granted: 1,
    id: POLICY.payment.instantRematchProductId,
    label: '바로 매치 1회',
  },
  {
    amountEnv: 'PORTONE_INSTANT_REMATCH_AMOUNT_3',
    granted: 3,
    id: `${POLICY.payment.instantRematchProductId}_pack3`,
    label: '바로 매치 3회 팩',
  },
  {
    amountEnv: 'PORTONE_INSTANT_REMATCH_AMOUNT_10',
    granted: 10,
    id: `${POLICY.payment.instantRematchProductId}_pack10`,
    label: '바로 매치 10회 팩',
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
  const config = INSTANT_REMATCH_PRODUCT_CONFIGS.find((product) => product.id === productId)
    ?? INSTANT_REMATCH_PRODUCT_CONFIGS[0];

  return {
    amount: getRequiredPaymentAmount(config.amountEnv),
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
