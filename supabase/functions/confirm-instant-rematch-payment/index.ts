import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { captureEdgeError, captureEdgeMessage } from "../_shared/log.ts";
import {
  getInstantRematchProductForRevenueCat,
  getRequiredPaymentEnv,
} from "../_shared/instant-rematch-payment.ts";
import {
  findVerifiedRevenueCatTransaction,
  getRevenueCatTransactionIdentifier,
  getString,
  type RevenueCatSubscriberResponse,
  type RevenueCatTransaction,
} from "../_shared/revenuecat-purchase.ts";

type ConfirmPurchaseBody = {
  appUserId?: unknown;
  customerInfoRequestDate?: unknown;
  productId?: unknown;
  revenueCatProductId?: unknown;
  transactionId?: unknown;
};

type GrantPurchaseResult = {
  duplicate: boolean;
  granted: number;
  payment_id: string;
};

const REVENUECAT_PROVIDER = "revenuecat";

async function fetchRevenueCatSubscriber(appUserId: string) {
  const apiKey = getRequiredPaymentEnv("REVENUECAT_REST_API_KEY");
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${
      encodeURIComponent(appUserId)
    }`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  const body = await response.json().catch(() => ({})) as
    & RevenueCatSubscriberResponse
    & {
      message?: string;
    };

  if (!response.ok) {
    throw new Error(
      body.message ??
        `RevenueCat subscriber lookup failed (${response.status})`,
    );
  }

  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("method not allowed", 405);
  }

  let userId: string | undefined;
  let capturedProductId: string | undefined;
  let capturedTransactionId: string | undefined;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;

    const body = await req.json().catch(() => ({})) as ConfirmPurchaseBody;
    const logicalProductId = getString(body.productId) || null;
    const revenueCatProductIdFromClient = getString(body.revenueCatProductId) ||
      null;
    const transactionIdFromClient = getString(body.transactionId);
    const appUserId = getString(body.appUserId);

    if (appUserId && appUserId !== user.id) {
      return errorResponse(
        "RevenueCat app user id does not match authenticated user",
        403,
        {
          code: "APP_USER_MISMATCH",
        },
      );
    }

    if (!transactionIdFromClient) {
      return errorResponse("transactionId is required", 400, {
        code: "TRANSACTION_ID_REQUIRED",
      });
    }

    const product = getInstantRematchProductForRevenueCat({
      logicalProductId,
      revenueCatProductId: revenueCatProductIdFromClient,
    });
    capturedProductId = product.id;
    capturedTransactionId = transactionIdFromClient;

    const subscriber = await fetchRevenueCatSubscriber(user.id);
    const revenueCatTransaction = findVerifiedRevenueCatTransaction({
      revenueCatProductId: product.revenueCatProductId,
      subscriber,
      transactionId: transactionIdFromClient,
    });

    if (!revenueCatTransaction) {
      captureEdgeMessage(
        "confirm-instant-rematch-payment",
        "RevenueCat transaction not found",
        {
          stage: "verify_revenuecat_purchase",
          status: 400,
          userId: user.id,
          tags: {
            feature: "payment",
            provider: REVENUECAT_PROVIDER,
            code: "transaction_not_found",
          },
          extra: {
            productId: product.id,
            revenueCatProductId: product.revenueCatProductId,
            transactionId: transactionIdFromClient,
          },
        },
      );

      return errorResponse("RevenueCat purchase verification failed", 400, {
        code: "TRANSACTION_NOT_FOUND",
      });
    }

    const verifiedTransactionId = getRevenueCatTransactionIdentifier(
      revenueCatTransaction,
    );
    if (!verifiedTransactionId) {
      return errorResponse(
        "RevenueCat transaction identifier is missing",
        400,
        {
          code: "TRANSACTION_ID_MISSING",
        },
      );
    }

    const { data, error } = await supabase.rpc(
      "grant_instant_rematch_purchase",
      {
        p_granted: product.granted,
        p_product_id: product.id,
        p_provider: REVENUECAT_PROVIDER,
        p_provider_metadata: {
          customerInfoRequestDate: getString(body.customerInfoRequestDate) ||
            null,
          isSandbox: typeof revenueCatTransaction.is_sandbox === "boolean"
            ? revenueCatTransaction.is_sandbox
            : null,
          purchaseDate: getString(revenueCatTransaction.purchase_date) || null,
          revenueCatProductId: product.revenueCatProductId,
          store: getString(revenueCatTransaction.store) || null,
          transactionIdFromClient,
        },
        p_provider_transaction_id: verifiedTransactionId,
        p_user_id: user.id,
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

    return jsonResponse({
      duplicate: grant.duplicate,
      granted: grant.granted,
      ok: true,
      paymentId: grant.payment_id,
      productId: product.id,
      provider: REVENUECAT_PROVIDER,
      revenueCatProductId: product.revenueCatProductId,
      transactionId: verifiedTransactionId,
    });
  } catch (error) {
    captureEdgeError("confirm-instant-rematch-payment", error, {
      stage: "confirm_revenuecat_purchase",
      status: 500,
      userId,
      tags: {
        feature: "payment",
        provider: REVENUECAT_PROVIDER,
        code: "confirm_failed",
      },
      extra: {
        productId: capturedProductId,
        transactionId: capturedTransactionId,
      },
    });
    const message = error instanceof Error
      ? error.message
      : "failed to confirm purchase";
    return errorResponse(message, 400);
  }
});
