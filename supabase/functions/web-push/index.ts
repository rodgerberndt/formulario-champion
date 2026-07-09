import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { sendPushNotification, deserializeVapidKeys } from "npm:web-push-browser@1.4.2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdminToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/**
 * Convert a PKCS8 base64url private key to raw 32-byte base64url format
 * needed by web-push-browser's deserializeVapidKeys.
 */
async function extractRawPrivateKey(pkcs8Base64url: string): Promise<string> {
  // Decode base64url to Uint8Array
  const b64 = pkcs8Base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Import as PKCS8 and export as JWK to get the raw 'd' parameter
  const key = await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return jwk.d!; // raw 32-byte private key in base64url
}

/**
 * Web Push Edge Function
 *
 * POST /subscribe - Save a push subscription
 * POST /unsubscribe - Remove a push subscription
 * POST /send - Send push notification to all subscribers
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/web-push/, "");

    const isAdmin = await verifyAdminToken(req.headers.get("x-admin-token"));
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── List active subscriptions ──
    if (pathname === "/subscriptions" && req.method === "GET") {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, user_label, last_used_at, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to list subscriptions" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          count: data?.length || 0,
          subscriptions: (data || []).map((s) => ({
            label: s.user_label,
            last_used_at: s.last_used_at,
            created_at: s.created_at,
            endpoint_host: (() => {
              try { return new URL(s.endpoint).hostname; } catch { return null; }
            })(),
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();

      // ── Subscribe ──
      if (pathname === "/subscribe" || pathname === "" || pathname === "/") {
        const { endpoint, keys, label } = body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return new Response(
            JSON.stringify({ error: "Missing subscription data" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            user_label: label || null,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

        if (error) {
          console.error("Error saving subscription:", error);
          return new Response(
            JSON.stringify({ error: "Failed to save subscription" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        console.log("Push subscription saved:", endpoint.slice(0, 60) + "...");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Unsubscribe ──
      if (pathname === "/unsubscribe") {
        const { endpoint } = body;

        if (!endpoint) {
          return new Response(
            JSON.stringify({ error: "Missing endpoint" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);

        console.log("Push subscription removed:", endpoint.slice(0, 60) + "...");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Send push notification ──
      if (pathname === "/send") {
        const { title, body: notifBody, url: notifUrl, sound, tag } = body;

        // Get VAPID keys
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKeyRaw = Deno.env.get("VAPID_PRIVATE_KEY");
        const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@champion.com";

        if (!vapidPublicKey || !vapidPrivateKeyRaw) {
          console.log("VAPID keys not configured. Push notification skipped.");
          return new Response(
            JSON.stringify({
              success: false,
              stubbed: true,
              message: "VAPID keys not configured.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Get all subscriptions
        const { data: subscriptions, error } = await supabase
          .from("push_subscriptions")
          .select("*");

        if (error || !subscriptions?.length) {
          console.log("No push subscribers found");
          return new Response(
            JSON.stringify({
              success: true,
              sent: 0,
              message: "No subscribers",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        console.log(`Sending push to ${subscriptions.length} subscriber(s)`);

        // Convert PKCS8 private key to raw format if needed
        let privateKeyForLib = vapidPrivateKeyRaw;
        if (vapidPrivateKeyRaw.startsWith("MIG")) {
          // PKCS8 format - extract raw key
          try {
            privateKeyForLib = await extractRawPrivateKey(vapidPrivateKeyRaw);
            console.log("Converted PKCS8 private key to raw format");
          } catch (e) {
            console.error("Failed to convert PKCS8 key:", e);
            return new Response(
              JSON.stringify({ error: "Invalid VAPID private key format" }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
        }

        // Deserialize VAPID keys
        const keyPair = await deserializeVapidKeys({
          publicKey: vapidPublicKey,
          privateKey: privateKeyForLib,
        });

        // Unique tag per send so notifications STACK on the desktop
        const uniqueTag = tag || `champion-${Date.now()}`;

        const payload = JSON.stringify({
          title: title || "Novo lead no Champion",
          body: notifBody || "Você tem um novo lead!",
          url: notifUrl || "/admin",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: uniqueTag,
          sound: sound || null,
          requireInteraction: true,
        });

        let sentCount = 0;
        const failedEndpoints: string[] = [];

        // Send to each subscriber
        for (const sub of subscriptions) {
          try {
            const res = await sendPushNotification(
              keyPair,
              {
                endpoint: sub.endpoint,
                keys: {
                  auth: sub.auth,
                  p256dh: sub.p256dh,
                },
              },
              vapidSubject,
              payload
            );

            if (res.ok) {
              sentCount++;
              console.log(`Push sent to: ${sub.endpoint.slice(0, 50)}...`);
            } else {
              const statusCode = res.status;
              console.error(
                `Push failed (${statusCode}) for: ${sub.endpoint.slice(0, 50)}...`
              );

              // 404 or 410 = subscription expired/invalid, remove it
              if (statusCode === 404 || statusCode === 410) {
                failedEndpoints.push(sub.endpoint);
              }
            }
          } catch (err) {
            console.error(
              `Push error for ${sub.endpoint.slice(0, 50)}:`,
              err
            );
          }
        }

        // Cleanup expired subscriptions
        if (failedEndpoints.length > 0) {
          console.log(
            `Removing ${failedEndpoints.length} expired subscription(s)`
          );
          await supabase
            .from("push_subscriptions")
            .delete()
            .in("endpoint", failedEndpoints);
        }

        // Update last_used_at for successful sends
        if (sentCount > 0) {
          const activeEndpoints = subscriptions
            .map((s) => s.endpoint)
            .filter((e) => !failedEndpoints.includes(e));

          await supabase
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .in("endpoint", activeEndpoints);
        }

        console.log(
          `Push complete: ${sentCount}/${subscriptions.length} sent, ${failedEndpoints.length} expired`
        );

        return new Response(
          JSON.stringify({
            success: true,
            sent: sentCount,
            total: subscriptions.length,
            expired: failedEndpoints.length,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Web Push error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
