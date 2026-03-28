import { createClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const META_PIXEL_ID = '2171667863227042';
const META_API_VERSION = (Deno.env.get('META_API_VERSION') || 'v21.0').toLowerCase();
const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
    );
    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch { return false; }
}

// Hash value using SHA-256 for Meta CAPI (required for user data)
async function hashValue(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Normalize Brazilian phone to E.164
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return "+" + digits;
  if (digits.length >= 10) return "+55" + digits;
  return "+" + digits;
}

interface SendEventParams {
  eventName: string;
  leadId: string;
  leadName?: string;
  leadPhone?: string;
  leadEmail?: string;
  fbclid?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  eventSourceUrl?: string;
  value?: number;
  currency?: string;
}

async function sendConversionEvent(params: SendEventParams): Promise<{ success: boolean; error?: string; response?: unknown }> {
  if (!META_ACCESS_TOKEN) {
    return { success: false, error: "META_ACCESS_TOKEN not configured" };
  }

  const eventTime = Math.floor(Date.now() / 1000);

  // Build user_data with hashed PII
  const userData: Record<string, unknown> = {};

  if (params.fbclid) {
    userData.fbc = `fb.1.${Date.now()}.${params.fbclid}`;
  }

  if (params.leadPhone) {
    userData.ph = [await hashValue(normalizePhone(params.leadPhone))];
  }

  if (params.leadName) {
    const nameParts = params.leadName.trim().split(/\s+/);
    if (nameParts.length > 0) {
      userData.fn = [await hashValue(nameParts[0])];
      if (nameParts.length > 1) {
        userData.ln = [await hashValue(nameParts[nameParts.length - 1])];
      }
    }
  }

  if (params.leadEmail) {
    userData.em = [await hashValue(params.leadEmail)];
  }

  // Country = Brazil
  userData.country = [await hashValue("br")];

  if (params.ipAddress && params.ipAddress !== "unknown") {
    userData.client_ip_address = params.ipAddress;
  }
  if (params.userAgent) {
    userData.client_user_agent = params.userAgent;
  }

  // External ID for deduplication
  userData.external_id = [await hashValue(params.leadId)];

  // Use the actual production domain for event_source_url
  const defaultUrl = "https://championadstudio.com";
  let eventSourceUrl = params.eventSourceUrl || defaultUrl;
  if (params.eventName === "MQL" && !params.eventSourceUrl) {
    eventSourceUrl = `${defaultUrl}/obrigadomql`;
  }

  const eventData = {
    data: [
      {
        event_name: params.eventName,
        event_time: eventTime,
        event_source_url: eventSourceUrl,
        action_source: "website",
        user_data: userData,
        custom_data: {
          lead_id: params.leadId,
          ...(params.value != null && { value: params.value, currency: params.currency || "BRL" }),
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;

  console.log(`Sending ${params.eventName} event to Meta CAPI for lead ${params.leadId}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventData),
  });

  const responseBody = await response.json();

  if (!response.ok) {
    console.error("Meta CAPI error:", response.status, JSON.stringify(responseBody));
    return { success: false, error: `Meta API ${response.status}`, response: responseBody };
  }

  console.log("Meta CAPI success:", JSON.stringify(responseBody));
  return { success: true, response: responseBody };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: accept admin token OR internal webhook secret
    const adminToken = req.headers.get("x-admin-token");
    const webhookSecret = req.headers.get("x-webhook-secret");
    const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");

    const isAdmin = adminToken && (await verifyAdminToken(adminToken));
    const isInternal = webhookSecret && internalSecret && webhookSecret === internalSecret;

    if (!isAdmin && !isInternal) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lead_id, event_name, value, currency } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventName = event_name || "MQL";

    // Fetch lead data for user matching
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, nome_completo, whatsapp, email, fbclid, ip_address, campaign_id, ad_id, adset_id, utm_content")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Last-click attribution: get the MOST RECENT session with a valid fbclid
    // This ensures MQL and other events are attributed to the latest ad click
    const { data: lastClickSession } = await supabase
      .from("lead_sessions")
      .select("user_agent, fbclid, ip_address")
      .eq("lead_whatsapp", lead.whatsapp)
      .not("fbclid", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: get latest session for user_agent/ip even without fbclid
    const { data: latestSession } = lastClickSession ? { data: lastClickSession } : await supabase
      .from("lead_sessions")
      .select("user_agent, fbclid, ip_address")
      .eq("lead_whatsapp", lead.whatsapp)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Last-click: session fbclid takes priority over lead's original fbclid
    const fbclid = lastClickSession?.fbclid || latestSession?.fbclid || lead.fbclid || null;
    const ipAddress = latestSession?.ip_address || lead.ip_address || null;
    const userAgent = latestSession?.user_agent || null;

    const result = await sendConversionEvent({
      eventName,
      leadId: lead.id,
      leadName: lead.nome_completo,
      leadPhone: lead.whatsapp,
      leadEmail: lead.email || undefined,
      fbclid,
      ipAddress,
      userAgent,
      value: value != null ? Number(value) : undefined,
      currency: currency || undefined,
    });

    return new Response(
      JSON.stringify({
        success: result.success,
        event_name: eventName,
        lead_id: lead.id,
        had_fbclid: !!fbclid,
        had_ip: !!ipAddress,
        error: result.error,
        meta_response: result.response,
      }),
      { status: result.success ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in meta-capi:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
