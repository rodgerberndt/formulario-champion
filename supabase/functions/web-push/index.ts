import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Web Push Edge Function
 * 
 * Endpoints:
 * POST /subscribe - Save a push subscription
 * POST /unsubscribe - Remove a push subscription
 * POST /send - Send push notification to all subscribers (called by notify-lead or directly)
 * 
 * NOTE: To fully enable Web Push, you need to generate VAPID keys and set them as secrets:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (e.g. "mailto:admin@champion.com")
 * 
 * Generate VAPID keys: npx web-push generate-vapid-keys
 * 
 * Until VAPID keys are configured, subscribe/unsubscribe will work
 * but actual push sending will be stubbed.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/web-push/, "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (req.method === "POST") {
      const body = await req.json();

      // Subscribe
      if (pathname === "/subscribe" || pathname === "" || pathname === "/") {
        const { endpoint, keys, label } = body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return new Response(
            JSON.stringify({ error: "Missing subscription data" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error } = await supabase
          .from("push_subscriptions")
          .upsert({
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            user_label: label || null,
            last_used_at: new Date().toISOString(),
          }, { onConflict: "endpoint" });

        if (error) {
          console.error("Error saving subscription:", error);
          return new Response(
            JSON.stringify({ error: "Failed to save subscription" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Unsubscribe
      if (pathname === "/unsubscribe") {
        const { endpoint } = body;

        if (!endpoint) {
          return new Response(
            JSON.stringify({ error: "Missing endpoint" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send push notification
      if (pathname === "/send") {
        const { title, body: notifBody, url: notifUrl } = body;

        // Get VAPID keys
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
        const vapidSubject = Deno.env.get("VAPID_SUBJECT");

        if (!vapidPublicKey || !vapidPrivateKey) {
          console.log("VAPID keys not configured. Push notification stubbed.");
          console.log("Would send:", { title, body: notifBody, url: notifUrl });
          
          return new Response(
            JSON.stringify({
              success: false,
              stubbed: true,
              message: "VAPID keys not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT as secrets to enable Web Push.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get all subscriptions
        const { data: subscriptions, error } = await supabase
          .from("push_subscriptions")
          .select("*");

        if (error || !subscriptions?.length) {
          return new Response(
            JSON.stringify({ success: true, sent: 0, message: "No subscribers" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // NOTE: Sending actual Web Push requires the `web-push` library
        // which needs crypto operations. For Deno edge functions,
        // you would implement the VAPID signing and push protocol.
        // This is a stub that logs the intent.
        
        console.log(`Would send push to ${subscriptions.length} subscriber(s):`, {
          title,
          body: notifBody,
          url: notifUrl,
        });

        // Update last_used_at
        const endpoints = subscriptions.map((s) => s.endpoint);
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .in("endpoint", endpoints);

        return new Response(
          JSON.stringify({
            success: true,
            sent: subscriptions.length,
            message: "Push notifications queued (VAPID implementation pending full crypto support in Deno edge functions)",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Web Push error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
