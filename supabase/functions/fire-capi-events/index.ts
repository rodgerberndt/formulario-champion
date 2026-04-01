import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_WEBHOOK_SECRET = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "";

const MQL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil",
  "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil",
  "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil",
  "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 8k – 20k",
  "R$ 20k – 50k",
  "R$ 50k – 100k",
];

async function waitForLeadRow(
  supabase: ReturnType<typeof createClient>,
  leadDbId: string,
  maxAttempts = 8
): Promise<{ capi_events_sent: Record<string, boolean> | null; tier: string | null; investimento_faixa: string | null } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase
      .from("leads")
      .select("capi_events_sent, tier, investimento_faixa")
      .eq("id", leadDbId)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, Math.min(500 * Math.pow(2, i), 4000)));
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Auth: accept internal webhook secret or service role
    const webhookSecret = req.headers.get("x-webhook-secret");
    const isValid = webhookSecret && INTERNAL_WEBHOOK_SECRET && webhookSecret === INTERNAL_WEBHOOK_SECRET;
    const isGateway = req.method === "POST";

    if (!isValid && !isGateway) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lead_db_id, event_ids } = await req.json();
    if (!lead_db_id) {
      return new Response(JSON.stringify({ error: "lead_db_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Shared event_ids from browser for deduplication
    const sharedEventIds: Record<string, string> = event_ids || {};

    console.log(`[fire-capi-events] Processing lead: ${lead_db_id}`);

    const leadRow = await waitForLeadRow(supabase, lead_db_id);
    if (!leadRow) {
      console.error(`[fire-capi-events] Lead row not found after retries: ${lead_db_id}`);
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const capiSent: Record<string, boolean> = (leadRow.capi_events_sent as Record<string, boolean>) || {};
    const tier = leadRow.tier || "Desqualificado";
    const investimentoFaixa = leadRow.investimento_faixa || "";
    const capiUrl = `${SUPABASE_URL}/functions/v1/meta-capi`;
    const serviceKey = SUPABASE_SERVICE_ROLE_KEY;
    const eventsToSend: string[] = [];

    // 1. CompleteRegistration
    if (!capiSent["CompleteRegistration"]) {
      eventsToSend.push("CompleteRegistration");
      try {
        const res = await fetch(capiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": INTERNAL_WEBHOOK_SECRET,
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ lead_id: lead_db_id, event_name: "CompleteRegistration", event_id: sharedEventIds["CompleteRegistration"] || undefined }),
        });
        const txt = await res.text();
        console.log(`[fire-capi-events] CompleteRegistration status=${res.status}: ${txt}`);
        if (res.ok) capiSent["CompleteRegistration"] = true;
      } catch (e) {
        console.error("[fire-capi-events] CompleteRegistration error:", e);
      }
    }

    // 2. Tier event
    const tierEventName = `Lead_${tier.replace("+", "Plus")}`;
    if (!capiSent[tierEventName] && tier !== "Desqualificado") {
      eventsToSend.push(tierEventName);
      try {
        const res = await fetch(capiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": INTERNAL_WEBHOOK_SECRET,
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ lead_id: lead_db_id, event_name: tierEventName }),
        });
        const txt = await res.text();
        console.log(`[fire-capi-events] ${tierEventName} status=${res.status}: ${txt}`);
        if (res.ok) capiSent[tierEventName] = true;
      } catch (e) {
        console.error(`[fire-capi-events] ${tierEventName} error:`, e);
      }
    }

    // 3. MQL
    const isMql = MQL_FAIXAS.includes(investimentoFaixa);
    if (!capiSent["MQL"] && isMql) {
      eventsToSend.push("MQL");
      try {
        const res = await fetch(capiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": INTERNAL_WEBHOOK_SECRET,
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ lead_id: lead_db_id, event_name: "MQL" }),
        });
        const txt = await res.text();
        console.log(`[fire-capi-events] MQL status=${res.status}: ${txt}`);
        if (res.ok) capiSent["MQL"] = true;
      } catch (e) {
        console.error("[fire-capi-events] MQL error:", e);
      }
    }

    // Update dedup tracking
    if (eventsToSend.length > 0) {
      await supabase.from("leads").update({ capi_events_sent: capiSent }).eq("id", lead_db_id);
      console.log(`[fire-capi-events] Events sent: ${eventsToSend.join(", ")}`);
    } else {
      console.log(`[fire-capi-events] No new events to send for ${lead_db_id}`);
    }

    return new Response(JSON.stringify({ success: true, events_sent: eventsToSend }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[fire-capi-events] Error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
