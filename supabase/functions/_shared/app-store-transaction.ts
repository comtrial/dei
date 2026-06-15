export type AppStoreEnvironment = "Production" | "Sandbox";

export type AppStoreServerConfig = {
  bundleId: string;
  environment: "production" | "sandbox";
  issuerId: string;
  keyId: string;
  privateKey: string;
};

export type AppStoreTransactionLookupResponse = {
  signedTransactionInfo?: unknown;
};

export type AppStoreTransactionPayload = {
  appAccountToken?: unknown;
  bundleId?: unknown;
  environment?: unknown;
  inAppOwnershipType?: unknown;
  originalTransactionId?: unknown;
  productId?: unknown;
  purchaseDate?: unknown;
  quantity?: unknown;
  revocationDate?: unknown;
  signedDate?: unknown;
  transactionId?: unknown;
  type?: unknown;
  webOrderLineItemId?: unknown;
};

export type VerifiedAppStoreTransaction = {
  appAccountToken: string | null;
  bundleId: string;
  environment: AppStoreEnvironment;
  originalTransactionId: string | null;
  productId: string;
  purchaseDate: number | null;
  quantity: number | null;
  signedDate: number | null;
  signedTransactionInfo: string;
  transactionId: string;
  type: string | null;
  webOrderLineItemId: string | null;
};

const APP_STORE_API_ENDPOINTS = {
  production: "https://api.storekit.itunes.apple.com",
  sandbox: "https://api.storekit-sandbox.itunes.apple.com",
} as const;

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlEncodeJson(value: unknown) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function pemToDer(pem: string) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  return base64UrlDecode(base64.replaceAll("+", "-").replaceAll("/", "_"));
}

function readDerLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];
  if (first === undefined) {
    throw new Error("invalid DER signature length");
  }

  if ((first & 0x80) === 0) {
    return { length: first, offset: offset + 1 };
  }

  const byteCount = first & 0x7f;
  let length = 0;
  for (let index = 0; index < byteCount; index += 1) {
    const next = bytes[offset + 1 + index];
    if (next === undefined) {
      throw new Error("invalid DER signature length");
    }
    length = (length << 8) | next;
  }

  return { length, offset: offset + 1 + byteCount };
}

function derIntegerToP1363(bytes: Uint8Array, offset: number) {
  if (bytes[offset] !== 0x02) {
    throw new Error("invalid DER ECDSA signature");
  }

  const lengthInfo = readDerLength(bytes, offset + 1);
  const end = lengthInfo.offset + lengthInfo.length;
  let integer = bytes.slice(lengthInfo.offset, end);

  while (integer.length > 32 && integer[0] === 0) {
    integer = integer.slice(1);
  }

  if (integer.length > 32) {
    throw new Error("invalid DER ECDSA integer length");
  }

  const output = new Uint8Array(32);
  output.set(integer, 32 - integer.length);
  return { bytes: output, offset: end };
}

function normalizeEcdsaSignature(signature: ArrayBuffer) {
  const bytes = new Uint8Array(signature);
  if (bytes.length === 64) {
    return bytes;
  }

  if (bytes[0] !== 0x30) {
    throw new Error("invalid ECDSA signature");
  }

  const sequence = readDerLength(bytes, 1);
  const r = derIntegerToP1363(bytes, sequence.offset);
  const s = derIntegerToP1363(bytes, r.offset);
  const output = new Uint8Array(64);
  output.set(r.bytes, 0);
  output.set(s.bytes, 32);
  return output;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function decodeJwsPayload(jws: string) {
  const [, payload] = jws.split(".");
  if (!payload) {
    throw new Error("signedTransactionInfo is not a valid JWS");
  }

  const json = new TextDecoder().decode(base64UrlDecode(payload));
  return JSON.parse(json) as AppStoreTransactionPayload;
}

export function normalizeAppStoreEnvironment(
  environment: unknown,
): AppStoreEnvironment | null {
  const value = getString(environment).toLowerCase();
  if (value === "production") return "Production";
  if (value === "sandbox") return "Sandbox";
  return null;
}

export function getAppStoreApiEndpoint(environment: AppStoreServerConfig["environment"]) {
  return APP_STORE_API_ENDPOINTS[environment];
}

export function getAppStoreServerConfig(getEnv: (name: string) => string | undefined) {
  const environment = getString(getEnv("APP_STORE_ENVIRONMENT")).toLowerCase();
  const config = {
    bundleId: getString(getEnv("APP_STORE_BUNDLE_ID")),
    environment,
    issuerId: getString(getEnv("APP_STORE_CONNECT_ISSUER_ID")),
    keyId: getString(getEnv("APP_STORE_CONNECT_KEY_ID")),
    privateKey: getString(getEnv("APP_STORE_CONNECT_PRIVATE_KEY")).replaceAll("\\n", "\n"),
  };

  if (config.environment !== "production" && config.environment !== "sandbox") {
    throw new Error("APP_STORE_ENVIRONMENT must be production or sandbox");
  }

  for (
    const [key, value] of Object.entries({
      APP_STORE_BUNDLE_ID: config.bundleId,
      APP_STORE_CONNECT_ISSUER_ID: config.issuerId,
      APP_STORE_CONNECT_KEY_ID: config.keyId,
      APP_STORE_CONNECT_PRIVATE_KEY: config.privateKey,
    })
  ) {
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
  }

  return config as AppStoreServerConfig;
}

export async function createAppStoreServerJwt(
  config: AppStoreServerConfig,
  now = Date.now(),
) {
  const header = {
    alg: "ES256",
    kid: config.keyId,
    typ: "JWT",
  };
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    aud: "appstoreconnect-v1",
    bid: config.bundleId,
    exp: issuedAt + 600,
    iat: issuedAt,
    iss: config.issuerId,
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${
    base64UrlEncodeJson(payload)
  }`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(normalizeEcdsaSignature(signature))}`;
}

export function validateAppStoreSignedTransaction({
  expectedBundleId,
  expectedProductId,
  expectedUserId,
  signedTransactionInfo,
  transactionId,
}: {
  expectedBundleId: string;
  expectedProductId: string;
  expectedUserId: string;
  signedTransactionInfo: string;
  transactionId: string;
}) {
  const payload = decodeJwsPayload(signedTransactionInfo);
  const verifiedTransactionId = getString(payload.transactionId);
  const productId = getString(payload.productId);
  const bundleId = getString(payload.bundleId);
  const environment = normalizeAppStoreEnvironment(payload.environment);
  const type = getString(payload.type) || null;
  const appAccountToken = getString(payload.appAccountToken) || null;

  if (!verifiedTransactionId || verifiedTransactionId !== transactionId) {
    throw new Error("App Store transaction id does not match");
  }

  if (productId !== expectedProductId) {
    throw new Error("App Store product id does not match");
  }

  if (bundleId !== expectedBundleId) {
    throw new Error("App Store bundle id does not match");
  }

  if (!environment) {
    throw new Error("App Store transaction environment is missing");
  }

  if (type && type.toLowerCase() !== "consumable") {
    throw new Error("App Store transaction is not a consumable product");
  }

  if (payload.revocationDate != null) {
    throw new Error("App Store transaction has been revoked");
  }

  if (appAccountToken && appAccountToken !== expectedUserId) {
    throw new Error("App Store appAccountToken does not match authenticated user");
  }

  return {
    appAccountToken,
    bundleId,
    environment,
    originalTransactionId: getString(payload.originalTransactionId) || null,
    productId,
    purchaseDate: getNumber(payload.purchaseDate),
    quantity: getNumber(payload.quantity),
    signedDate: getNumber(payload.signedDate),
    signedTransactionInfo,
    transactionId: verifiedTransactionId,
    type,
    webOrderLineItemId: getString(payload.webOrderLineItemId) || null,
  } satisfies VerifiedAppStoreTransaction;
}

export async function fetchAppStoreTransaction({
  config,
  fetcher = fetch,
  transactionId,
}: {
  config: AppStoreServerConfig;
  fetcher?: typeof fetch;
  transactionId: string;
}) {
  const token = await createAppStoreServerJwt(config);
  const response = await fetcher(
    `${getAppStoreApiEndpoint(config.environment)}/inApps/v1/transactions/${
      encodeURIComponent(transactionId)
    }`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  const body = await response.json().catch(() => ({})) as
    & AppStoreTransactionLookupResponse
    & {
      errorCode?: string;
      errorMessage?: string;
    };

  if (!response.ok) {
    throw new Error(
      body.errorMessage ||
        body.errorCode ||
        `App Store transaction lookup failed (${response.status})`,
    );
  }

  const signedTransactionInfo = getString(body.signedTransactionInfo);
  if (!signedTransactionInfo) {
    throw new Error("App Store transaction lookup returned no signedTransactionInfo");
  }

  return signedTransactionInfo;
}

export async function verifyAppStoreTransaction({
  expectedBundleId,
  expectedProductId,
  expectedUserId,
  fetcher,
  getEnv,
  transactionId,
}: {
  expectedBundleId?: string;
  expectedProductId: string;
  expectedUserId: string;
  fetcher?: typeof fetch;
  getEnv: (name: string) => string | undefined;
  transactionId: string;
}) {
  const config = getAppStoreServerConfig(getEnv);
  const signedTransactionInfo = await fetchAppStoreTransaction({
    config,
    fetcher,
    transactionId,
  });

  return validateAppStoreSignedTransaction({
    expectedBundleId: expectedBundleId ?? config.bundleId,
    expectedProductId,
    expectedUserId,
    signedTransactionInfo,
    transactionId,
  });
}
