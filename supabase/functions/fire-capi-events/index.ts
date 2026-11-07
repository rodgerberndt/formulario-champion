import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isMqlFaixa, valorEsperadoMql, registrarLog } from "../_shared/meta.ts";
import { ehHighQualityLead, limiarHql } from "../_shared/hql.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_WEBHOOK_SECRET = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "";

// Eventos de NASCIMENTO do lead: CompleteRegistration, Lead, Lead_<Tier>, e
// MQL ou Sprint conforme a faixa. É chamado pelo front logo após o insert, pelo
// gatilho de banco (notify_capi_on_lead_insert) e pelo kommo-webhook.
//
// Três chamadores para o mesmo lead era a fonte de eventos duplicados: o front
// mandava event_ids com timestamp e o gatilho gerava outros. Agora o event_id
// é determinístico (`${lead_id}_${evento}`) e o meta-capi RESERVA o id antes
// de enviar: quem chega segundo recebe `deduplicated` e não gera evento. A
// checagem de `capi_events_sent` aqui é só para poupar a chamada.
//
// A marca no lead é feita pelo meta-capi (merge atômico). Esta função não
// grava mais o mapa inteiro: era last-writer-wins e apagava marcas de
// chamadores concorrentes.

async function waitForLeadRow(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  leadDbId: string,
  maxAttempts = 8
): Promise<{ capi_events_sent: Record<string, boolean> | null; tier: string | null; investimento_faixa: string | null; page_url: string | null; score: number | null; score_version: string | null; destino_conversao?: string | null } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase
      .from("leads")
      // `score_version` entra em 17/09/2026: o corte de HQL depende dela (73 no
      // quiz, 67 no formulario curto). Sem ela, todo lead do formulario seria
      // medido pela regua do quiz e nenhum passaria.
      //
      // `destino_conversao` entra em 18/09/2026: e a pagina para onde o lead
      // foi de fato, gravada pelo navegador no insert. Ver sourceUrl abaixo.
      .select("capi_events_sent, tier, investimento_faixa, page_url, score, score_version, destino_conversao")
      .eq("id", leadDbId)
      .maybeSingle();
    if (data) return data;
    // Coluna ainda inexistente (migration 20260918180000 nao aplicada): repete
    // sem ela em vez de devolver null e perder o lead inteiro.
    const semColuna = await supabase
      .from("leads")
      .select("capi_events_sent, tier, investimento_faixa, page_url, score, score_version")
      .eq("id", leadDbId)
      .maybeSingle();
    if (semColuna.data) return semColuna.data;
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
    const webhookSecret = req.headers.get("x-webhook-secret");
    const isValid = webhookSecret && INTERNAL_WEBHOOK_SECRET && webhookSecret === INTERNAL_WEBHOOK_SECRET;
    const isGateway = req.method === "POST";

    if (!isValid && !isGateway) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lead_db_id, event_ids, event_source_url, caller, test_event_code } = await req.json();
    if (!lead_db_id) {
      return new Response(JSON.stringify({ error: "lead_db_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sharedEventIds: Record<string, string> = event_ids || {};
    // Quem chamou. O front é o único que manda `event_ids`; o gatilho e o
    // kommo se identificam no body.
    const quemChamou: string = typeof caller === "string" && caller ? caller.slice(0, 40) : (event_ids ? "front" : "unknown");
    console.log(`[fire-capi-events] Processing lead: ${lead_db_id} (caller=${quemChamou})`);

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
    const isMql = isMqlFaixa(investimentoFaixa);
    const capiUrl = `${SUPABASE_URL}/functions/v1/meta-capi`;
    const eventsToSend: string[] = [];
    const eventsSkipped: string[] = [];
    const eventsFailed: string[] = [];

    // A página de obrigado é onde o pixel dispara os eventos irmãos. Mesmo
    // event_source_url dos dois lados, senão o Meta não desduplica.
    //
    // ORDEM CORRIGIDA EM 18/09/2026:
    //   1. o que o chamador mandou (o front manda o destino real);
    //   2. `leads.destino_conversao`, gravado pelo navegador no insert — é o
    //      que o GATILHO do banco não tinha e é onde a URL divergia: todo lead
    //      do formulário do topo com faixa abaixo de R$ 10 mil vai para
    //      /obrigadomql, e o palpite abaixo carimbava /obrigadosprint;
    //   3. o palpite pela faixa, só para lead antigo (coluna vazia).
    // Nada disto toca no event_id, então a desduplicação por id segue igual.
    const base = "https://www.championadstudio.com";
    const destinoDoLead = typeof leadRow.destino_conversao === "string" && leadRow.destino_conversao
      ? (leadRow.destino_conversao.startsWith("http") ? leadRow.destino_conversao : `${base}${leadRow.destino_conversao}`)
      : null;
    const sourceUrl = event_source_url || destinoDoLead || `${base}/${isMql ? "obrigadomql" : "obrigadosprint"}`;

    const enviar = async (eventName: string, extra: Record<string, unknown> = {}) => {
      const eventId = sharedEventIds[eventName] || `${lead_db_id}_${eventName}`;
      if (capiSent[eventName]) {
        eventsSkipped.push(eventName);
        // Linha de "skipped" para medir quantas vezes o mesmo lead entra aqui
        // (é a medida da corrida entre os chamadores).
        await registrarLog(supabase, { lead_id: lead_db_id, event_name: eventName, event_id: eventId, caller: quemChamou, action_source: "website", status: "skipped" });
        return;
      }
      eventsToSend.push(eventName);
      try {
        const res = await fetch(capiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": INTERNAL_WEBHOOK_SECRET,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            lead_id: lead_db_id,
            event_name: eventName,
            event_id: eventId,
            event_source_url: sourceUrl,
            action_source: "website",
            caller: quemChamou,
            // Repassado para o meta-capi: com ele o evento vai ao Test Events e
            // NAO entra no conjunto de dados vivo. E o que torna o gatilho
            // testavel em producao sem inventar conversao.
            ...(test_event_code ? { test_event_code } : {}),
            ...extra,
          }),
        });
        const txt = await res.text();
        console.log(`[fire-capi-events] ${eventName} status=${res.status}: ${txt}`);
        if (res.ok) capiSent[eventName] = true;
        else eventsFailed.push(eventName);
      } catch (e) {
        eventsFailed.push(eventName);
        console.error(`[fire-capi-events] ${eventName} error:`, e);
      }
    };

    // 1. CompleteRegistration
    await enviar("CompleteRegistration");

    // 2. Lead padrão (nome literal "Lead": é o que a campanha otimiza)
    await enviar("Lead");

    // 3. Tier
    const tierEventName = `Lead_${tier.replace("+", "Plus")}`;
    if (tier !== "Desqualificado") await enviar(tierEventName);

    // 4. MQL (com valor esperado por faixa, para otimização por valor) ou Sprint
    if (isMql) {
      const valor = valorEsperadoMql(investimentoFaixa);
      await enviar("MQL", valor ? { value: valor, currency: "BRL" } : {});
    } else {
      await enviar("Sprint");
    }

    // 5. HighQualityLead — OBSERVACIONAL. Nenhuma campanha otimiza por ele.
    //
    // Por que ele existe: a autopsia da CA03-BMsss (11/09/2026) mostrou que o
    // custo por MQL ficou estavel — R$ 139 -> R$ 190 -> R$ 158 — enquanto o
    // custo por HQL73 multiplicou por sete, de R$ 320 para R$ 2.282. O MQL nao
    // esta errado, esta GROSSO: 76% dos MQL nao sao HQL, e ele nao distingue um
    // lead de R$ 12 mil de um de R$ 300 mil. Sem este evento, a Meta nao tem
    // como saber a diferenca, e nos nao conseguimos ler HQL por unidade dentro
    // do Gerenciador.
    //
    // POR ULTIMO de proposito. `enviar` nunca lanca — ela captura o erro e
    // empilha em `eventsFailed` —, mas a ordem tambem garante que uma falha
    // aqui nao possa alcancar CompleteRegistration, Lead, Lead_<Tier>, MQL ou
    // Sprint: quando esta linha roda, todos ja foram enviados.
    //
    // O corte NAO e mais um numero fixo, e desde 17/09/2026 ele DEPENDE DA
    // VERSAO DO SCORE: 73 para o quiz (v2.3, e para todo lead historico sem
    // versao gravada) e 67 para o formulario curto (v3-form). A regra mora em
    // ../_shared/hql.ts, espelho de src/lib/hql.ts, e e a mesma que o painel usa.
    //
    // Por que mudou: o formulario curto so pergunta faturamento e mercado. Na
    // formula do quiz o teto dele era 70, entao 73 era inalcancavel — o evento
    // simplesmente parava de sair, sem erro nenhum aqui dentro.
    //
    // NAO e uma formula nova: continua sendo a leitura do `score` ja gravado.
    const scoreDoLead = typeof leadRow.score === "number" ? leadRow.score : null;
    const versaoDoScore = leadRow.score_version ?? null;
    if (ehHighQualityLead(scoreDoLead, versaoDoScore)) {
      console.log(`[fire-capi-events] HQL: score ${scoreDoLead} >= ${limiarHql(versaoDoScore)} (${versaoDoScore || "sem versao"})`);
      await enviar("HighQualityLead");
    }

    if (eventsToSend.length > 0) {
      console.log(`[fire-capi-events] Events sent: ${eventsToSend.join(", ")}${eventsFailed.length ? ` | failed: ${eventsFailed.join(", ")}` : ""}`);
    } else {
      console.log(`[fire-capi-events] No new events to send for ${lead_db_id}`);
    }

    return new Response(JSON.stringify({ success: true, caller: quemChamou, events_sent: eventsToSend.filter((e) => !eventsFailed.includes(e)), events_failed: eventsFailed, events_skipped: eventsSkipped }), {
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
