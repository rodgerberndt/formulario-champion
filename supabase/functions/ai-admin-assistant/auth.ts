// auth.ts — autenticação por API key + HMAC-SHA256 + admin JWT
// Nada exposto ao cliente. Usado apenas pela Edge Function ai-admin-assistant.

const encoder = new TextEncoder();

export interface AuthCheckResult {
  ok: boolean;
  status?: number;
  error?: string;
  apiKeyFingerprint?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function fingerprintKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

export async function checkApiKey(req: Request): Promise<AuthCheckResult> {
  const expected = Deno.env.get("AI_ADMIN_ASSISTANT_API_KEY");
  if (!expected) {
    return { ok: false, status: 500, error: "Server misconfigured: missing AI_ADMIN_ASSISTANT_API_KEY" };
  }
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  }
  const provided = auth.slice("Bearer ".length).trim();
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }
  return { ok: true, apiKeyFingerprint: await fingerprintKey(provided) };
}

export async function verifyHmac(req: Request, rawBody: string): Promise<AuthCheckResult> {
  const secret = Deno.env.get("AI_ADMIN_ASSISTANT_HMAC_SECRET");
  if (!secret) {
    return { ok: false, status: 500, error: "Server misconfigured: missing AI_ADMIN_ASSISTANT_HMAC_SECRET" };
  }
  const sig = req.headers.get("x-signature") || "";
  const ts = req.headers.get("x-timestamp") || "";
  if (!sig || !ts) return { ok: false, status: 401, error: "Missing x-signature or x-timestamp" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, status: 401, error: "Invalid x-timestamp" };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > 300) {
    return { ok: false, status: 401, error: "Timestamp out of window (>5min)" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${rawBody}`));
  const expectedHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!timingSafeEqual(sig.toLowerCase(), expectedHex.toLowerCase())) {
    return { ok: false, status: 401, error: "Invalid HMAC signature" };
  }
  return { ok: true };
}

// Verifica o admin JWT emitido por admin-login (HS256 com ADMIN_JWT_SECRET).
export async function verifyAdminJwt(token: string): Promise<{ ok: boolean; sub?: string; error?: string }> {
  const secret = Deno.env.get("ADMIN_JWT_SECRET");
  if (!secret) return { ok: false, error: "Missing ADMIN_JWT_SECRET" };
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Malformed JWT" };
    const [h, p, s] = parts;
    const data = `${h}.${p}`;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));
    if (!ok) return { ok: false, error: "Invalid admin JWT signature" };
    const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(p.length / 4) * 4, "=")));
    if (payload?.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
      return { ok: false, error: "Admin JWT expired" };
    }
    return { ok: true, sub: payload?.sub || "admin" };
  } catch (e) {
    return { ok: false, error: `JWT verify error: ${(e as Error).message}` };
  }
}
