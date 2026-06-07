import { corsHeaders, errorResponse } from "../_shared/cors.ts";
import { captureEdgeMessage } from "../_shared/log.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  captureEdgeMessage(
    "start-instant-rematch-payment",
    "PortOne booster payment start is disabled",
    {
      stage: "deprecated_portone_payment_start",
      status: 410,
      level: "warning",
      tags: { feature: "payment", provider: "portone", code: "iap_required" },
    },
  );

  return errorResponse(
    "booster payment now requires App Store in-app purchase",
    410,
    {
      code: "IAP_REQUIRED",
    },
  );
});
