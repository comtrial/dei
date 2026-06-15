import {
  verifyAppStoreTransaction,
  type VerifiedAppStoreTransaction,
} from "./app-store-transaction.ts";
import { getInstantRematchProductForAppStore } from "./instant-rematch-payment.ts";

export type ConfirmPurchaseBody = {
  environment?: unknown;
  productId?: unknown;
  signedTransactionInfo?: unknown;
  storeProductId?: unknown;
  transactionDate?: unknown;
  transactionId?: unknown;
};

export type GrantPurchaseResult = {
  duplicate: boolean;
  granted: number;
  payment_id: string;
};

type SupabaseRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

type VerifyTransaction = (params: {
  expectedProductId: string;
  expectedUserId: string;
  transactionId: string;
}) => Promise<VerifiedAppStoreTransaction>;

type EnvGetter = (name: string) => string | undefined;

export const APPLE_IAP_PROVIDER = "apple_iap";

export function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function defaultDenoEnv(name: string) {
  return Deno.env.get(name);
}

function createDefaultVerifyTransaction(getEnv: EnvGetter): VerifyTransaction {
  return ({ expectedProductId, expectedUserId, transactionId }) =>
    verifyAppStoreTransaction({
      expectedProductId,
      expectedUserId,
      getEnv,
      transactionId,
    });
}

export async function confirmInstantRematchApplePurchase({
  body,
  getEnv = defaultDenoEnv,
  supabase,
  userId,
  verifyTransaction = createDefaultVerifyTransaction(getEnv),
}: {
  body: ConfirmPurchaseBody;
  getEnv?: EnvGetter;
  supabase: SupabaseRpcClient;
  userId: string;
  verifyTransaction?: VerifyTransaction;
}) {
  const logicalProductId = getString(body.productId) || null;
  const storeProductIdFromClient = getString(body.storeProductId) || null;
  const transactionIdFromClient = getString(body.transactionId);

  if (!transactionIdFromClient) {
    throw new Error("transactionId is required");
  }

  const product = getInstantRematchProductForAppStore({
    appStoreProductId: storeProductIdFromClient,
    getEnv,
    logicalProductId,
  });
  const verifiedTransaction = await verifyTransaction({
    expectedProductId: product.appStoreProductId,
    expectedUserId: userId,
    transactionId: transactionIdFromClient,
  });

  const { data, error } = await supabase.rpc(
    "grant_instant_rematch_purchase",
    {
      p_granted: product.granted,
      p_product_id: product.id,
      p_provider: APPLE_IAP_PROVIDER,
      p_provider_metadata: {
        appAccountToken: verifiedTransaction.appAccountToken,
        appleEnvironment: verifiedTransaction.environment,
        appStoreProductId: product.appStoreProductId,
        clientEnvironment: getString(body.environment) || null,
        clientSignedTransactionInfoPresent:
          Boolean(getString(body.signedTransactionInfo)),
        clientTransactionDate: typeof body.transactionDate === "number"
          ? body.transactionDate
          : null,
        originalTransactionId: verifiedTransaction.originalTransactionId,
        purchaseDate: verifiedTransaction.purchaseDate,
        quantity: verifiedTransaction.quantity,
        signedDate: verifiedTransaction.signedDate,
        transactionType: verifiedTransaction.type,
        webOrderLineItemId: verifiedTransaction.webOrderLineItemId,
      },
      p_provider_transaction_id: verifiedTransaction.transactionId,
      p_user_id: userId,
    },
  );

  if (error) {
    throw error;
  }

  const grant = (Array.isArray(data) ? data[0] : data) as
    | GrantPurchaseResult
    | undefined;
  if (!grant) {
    throw new Error("grant_instant_rematch_purchase returned no result");
  }

  return {
    duplicate: grant.duplicate,
    granted: grant.granted,
    ok: true,
    paymentId: grant.payment_id,
    productId: product.id,
    provider: APPLE_IAP_PROVIDER,
    storeProductId: product.appStoreProductId,
    transactionId: verifiedTransaction.transactionId,
  } as const;
}
