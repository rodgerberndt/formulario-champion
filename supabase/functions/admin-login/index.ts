import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { create } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiting
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);
  
  if (!attempts) return false;
  
  // Reset if lockout duration has passed
  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(ip);
    return false;
  }
  
  return attempts.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string, success: boolean) {
  const now = Date.now();
  
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  
  const attempts = loginAttempts.get(ip);
  if (attempts) {
    attempts.count++;
    attempts.lastAttempt = now;
  } else {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
  }
}

// SHA-256 hash function for password comparison
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    
    // Check rate limiting
    if (isRateLimited(ip)) {
      return new Response(
        JSON.stringify({ error: "Muitas tentativas. Tente novamente em 10 minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { password } = await req.json();

    if (!password || typeof password !== "string") {
      return new Response(
        JSON.stringify({ error: "Senha é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const passwordHash = Deno.env.get("ADMIN_PASSWORD_HASH");
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");

    if (!passwordHash || !jwtSecret) {
      console.error("Missing admin credentials in environment");
      return new Response(
        JSON.stringify({ error: "Erro de configuração do servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalize = (s: string) => {
      // Trim and remove optional wrapping quotes (common when pasting)
      const trimmed = s.trim();
      const unquoted = trimmed.replace(/^"(.*)"$/, "$1").trim();
      return unquoted;
    };

    const looksLikeSha256Hex = (s: string) => /^[a-f0-9]{64}$/.test(s);

    const storedRaw = normalize(passwordHash);
    const storedHash = storedRaw.toLowerCase();
    const storedIsSha256 = looksLikeSha256Hex(storedHash);

    const providedRaw = normalize(password);
    const providedLower = providedRaw.toLowerCase();
    const providedIsSha256 = looksLikeSha256Hex(providedLower);

    // Safe diagnostics (no secret values logged)
    console.log("admin-login: storedIsSha256=", storedIsSha256, "storedLen=", storedRaw.length, "providedLooksSha256=", providedIsSha256);

    let isValid = false;
    if (storedIsSha256) {
      // If the user accidentally pasted the hash into the password field, accept it.
      if (providedIsSha256) {
        isValid = providedLower === storedHash;
      } else {
        const inputHash = await sha256(providedRaw);
        isValid = inputHash === storedHash;
      }
    } else {
      // Backward compatible: if the secret is plain text, compare directly.
      isValid = providedRaw === storedRaw;
    }

    if (!isValid) {
      recordAttempt(ip, false);
      return new Response(
        JSON.stringify({ error: "Senha incorreta" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    recordAttempt(ip, true);

    // Create JWT token (8 hours expiry)
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60), // 8 hours
        iat: Math.floor(Date.now() / 1000),
      },
      key
    );

    return new Response(
      JSON.stringify({ token }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
