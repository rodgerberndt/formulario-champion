import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Faixas de faturamento que disparam o follow (MQL >= R$ 10k)
const MQL_FATURAMENTO = new Set<string>([
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
]);

function normalizeInstagram(raw: string | null): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  // remove URL prefixes
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  v = v.replace(/[/?#].*$/, "");
  v = v.replace(/^@+/, "");
  v = v.toLowerCase();
  if (!v) return null;
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WEBHOOK_URL = Deno.env.get("INSTAGRAM_FOLLOW_WEBHOOK_URL");
  const WEBHOOK_SECRET = Deno.env.get("INSTAGRAM_FOLLOW_WEBHOOK_SECRET") || "";

  if (!WEBHOOK_URL) {
    return new Response(
      JSON.stringify({ ok: false, error: "INSTAGRAM_FOLLOW_WEBHOOK_URL not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Pega leads MQL com Instagram, criados há >= 2 min, ainda não disparados.
  // Janela de 7 dias para evitar processar histórico antigo.
  const cutoffNew = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const cutoffOld = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, nome_completo, whatsapp, instagram, mercado, faturamento_faixa, investimento_faixa, tier, utm_source, utm_campaign, created_at")
    .is("instagram_follow_dispatched_at", null)
    .not("instagram", "is", null)
    .neq("instagram", "")
    .lte("created_at", cutoffNew)
    .gte("created_at", cutoffOld)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching leads:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let dispatched = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const lead of leads ?? []) {
    const faixa = (lead as any).investimento_faixa || (lead as any).faturamento_faixa;
    if (!faixa || !MQL_FATURAMENTO.has(faixa)) {
      // Marca como disparado pra não reavaliar sempre
      await supabase
        .from("leads")
        .update({ instagram_follow_dispatched_at: new Date().toISOString() })
        .eq("id", lead.id);
      skipped++;
      continue;
    }

    const handle = normalizeInstagram(lead.instagram);
    if (!handle) {
      await supabase
        .from("leads")
        .update({ instagram_follow_dispatched_at: new Date().toISOString() })
        .eq("id", lead.id);
      skipped++;
      continue;
    }

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(WEBHOOK_SECRET ? { "x-webhook-secret": WEBHOOK_SECRET } : {}),
        },
        body: JSON.stringify({
          action: "follow_instagram",
          lead_id: lead.id,
          instagram_handle: handle,
          instagram_url: `https://www.instagram.com/${handle}/`,
          nome: lead.nome_completo,
          whatsapp: lead.whatsapp,
          mercado: lead.mercado,
          faturamento: faixa,
          tier: lead.tier,
          utm_source: lead.utm_source,
          utm_campaign: lead.utm_campaign,
          created_at: lead.created_at,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        errors.push(`Lead ${lead.id}: ${res.status} ${txt.slice(0, 200)}`);
        // Não marca como disparado para tentar de novo no próximo ciclo
        continue;
      }

      await supabase
        .from("leads")
        .update({ instagram_follow_dispatched_at: new Date().toISOString() })
        .eq("id", lead.id);
      dispatched++;
    } catch (e) {
      errors.push(`Lead ${lead.id}: ${(e as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, dispatched, skipped, errors, scanned: leads?.length ?? 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});