import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { captureEdgeError, captureEdgeMessage } from "../_shared/log.ts";
import {
  APPLE_IAP_PROVIDER,
  confirmInstantRematchApplePurchase,
  getString,
  type ConfirmPurchaseBody,
} from "../_shared/instant-rematch-confirm.ts";

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
    capturedProductId = getString(body.productId) || undefined;
    capturedTransactionId = getString(body.transactionId) || undefined;

    if (!capturedTransactionId) {
      return errorResponse("transactionId is required", 400, {
        code: "TRANSACTION_ID_REQUIRED",
      });
    }

    const result = await confirmInstantRematchApplePurchase({
      body,
      getEnv: (name) => Deno.env.get(name),
      supabase,
      userId: user.id,
    });

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "failed to confirm purchase";

    captureEdgeError("confirm-instant-rematch-payment", error, {
      stage: "confirm_apple_iap_purchase",
      status: 500,
      userId,
      tags: {
        feature: "payment",
        provider: APPLE_IAP_PROVIDER,
        code: "confirm_failed",
      },
      extra: {
        productId: capturedProductId,
        transactionId: capturedTransactionId,
      },
    });

    if (message.includes("product id does not match")) {
      captureEdgeMessage(
        "confirm-instant-rematch-payment",
        "App Store product mismatch",
        {
          stage: "verify_apple_iap_purchase",
          status: 400,
          userId,
          tags: {
            feature: "payment",
            provider: APPLE_IAP_PROVIDER,
            code: "product_mismatch",
          },
          extra: {
            productId: capturedProductId,
            transactionId: capturedTransactionId,
          },
        },
      );
    }

    return errorResponse(message, 400);
  }
});
