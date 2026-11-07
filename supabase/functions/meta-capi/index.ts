import { createClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import {
  buildUserData, sendMetaEvents, identityFlags, registrarLog, reservarEvento,
  confirmarReserva, liberarReserva, marcarNoLead, META_TEST_EVENT_CODE, type EventoMeta,
} from "../_shared/meta.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

// Um evento de um lead para o Meta, com a identificação mais forte que o banco
// tem sobre a pessoa. Quem chama diz o evento, o event_id e (se não nasceu no
// navegador) o action_source; o resto vem daqui.
//
// Regras (06/09/2026, ver "Plano de Tracking Avançado - Champion" no vault):
// • event_id padrão é `${lead_id}_${evento}`, SEM timestamp. O mesmo evento
//   gerado no navegador e no servidor precisa ter o mesmo id para o Meta
//   desduplicar; e o mesmo fato reenviado não pode virar evento novo.
// • fbc vem do cookie gravado no submit (leads.fbc) ou da sessão. Só cai na
//   reconstrução pelo fbclid quando não há cookie nenhum.
// • Telefone só dígitos com DDI; nome e e-mail sem acento e minúsculos
//   (_shared/meta.ts). Era hasheado com "+" e não casava.
// • action_source: `website` para o que nasce no navegador (Lead, MQL do
//   quiz), `system_generated` para o que nasce no admin (venda, reunião,
//   MQL por override). O Meta pede isso e usa para ponderar o sinal.
//
// Confiabilidade (06/09/2026 noite, ver "Auditoria do Envio de Eventos para o Meta"):
// • Esta função é o FUNIL ÚNICO. Antes de enviar, reserva (event_id,
//   event_name) em `capi_event_claims`; se outro chamador já reservou, devolve
//   200 com `deduplicated: true` e não envia. O Meta não desduplica dois
//   eventos de servidor com o mesmo id, então a dedup tem que ser nossa.
// • Toda tentativa vira linha em `capi_events_log` (sent/failed/rejected/
//   deduplicated), com quem chamou e quais campos de identidade foram.
// • Sucesso marca a chave no lead com merge atômico (`dedup_key` ou o nome do
//   evento). Falha solta a reserva para o retry (`admin-data /capi-retry`).
// • `caller` no body identifica quem pediu: front, trigger, kommo, admin,
//   retro, assistente, retry. Sem ele, admin-token = "admin", resto "unknown".

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const adminToken = req.headers.get("x-admin-token");
    const webhookSecret = req.headers.get("x-webhook-secret");
    const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");

    const isAdmin = adminToken && (await verifyAdminToken(adminToken));
    const isInternal = webhookSecret && internalSecret && webhookSecret === internalSecret;

    if (!isAdmin && !isInternal) {
      return json({ error: "Não autorizado" }, 401);
    }

    const {
      lead_id, event_name, value, currency, event_id, event_source_url, event_time,
      action_source, custom_data, test_event_code, caller, dedup_key, retry_of,
    } = await req.json();

    if (!lead_id) {
      return json({ error: "lead_id is required" }, 400);
    }

    const eventName: string = event_name || "MQL";
    const quemChamou: string = typeof caller === "string" && caller ? caller.slice(0, 40) : (isAdmin ? "admin" : "unknown");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, nome_completo, whatsapp, email, fbclid, fbp, fbc, ip_address, user_agent, page_url, session_id, campaign_id, ad_id, adset_id, utm_campaign, utm_content, created_at, investimento_faixa")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) {
      return json({ error: "Lead not found" }, 404);
    }

    // ── Atribuição: o clique que CONVERTEU, congelado no momento do lead ──
    //
    // Regra do negócio (fundador, 21/08/2026): vale o ÚLTIMO clique ocorrido
    // ATÉ o instante em que a pessoa virou lead. Cliques anteriores não
    // converteram; cliques posteriores nunca entram, para nenhum evento.
    // `lead.fbclid`/`lead.fbc` são da própria sessão de conversão e vêm
    // primeiro. A sessão com fbclid mais recente ATÉ o lead é o fallback.
    const { data: convertingClickSession } = await supabase
      .from("lead_sessions")
      .select("user_agent, fbclid, fbp, fbc, ip_address, created_at")
      .eq("lead_whatsapp", lead.whatsapp)
      .not("fbclid", "is", null)
      .lte("created_at", lead.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Sessão mais recente: só IP e user agent (descrevem o dispositivo).
    const { data: latestSession } = await supabase
      .from("lead_sessions")
      .select("user_agent, fbclid, fbp, fbc, ip_address, created_at")
      .eq("lead_whatsapp", lead.whatsapp)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // A sessão do PRÓPRIO lead, pelo vínculo direto `leads.session_id`.
    // Faltava este elo: o fallback só olhava sessões casadas por
    // `lead_whatsapp`, que fica NULL na maioria das sessões. O lead
    // 77d9204a (09/09) nasceu com ip_address NULL — o front perde a corrida
    // de 800 ms do `get-client-ip` em rede lenta — e o IP estava ali, a um
    // join de distância, na sessão que o próprio lead aponta. Resultado: o
    // evento foi ao Meta com ip=false.
    // `lead_sessions.id` e uuid e `leads.session_id` e TEXT: mandar um valor
    // que nao e uuid faz o PostgREST devolver 22P02 e derruba o envio inteiro.
    const ehUuid = (v: unknown): v is string =>
      typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const { data: sessaoDoLead } = ehUuid(lead.session_id)
      ? await supabase
          .from("lead_sessions")
          .select("user_agent, fbclid, fbp, fbc, ip_address, created_at")
          .eq("id", lead.session_id)
          .maybeSingle()
      : { data: null };
    const fbc = lead.fbc || convertingClickSession?.fbc || sessaoDoLead?.fbc || null;
    const fbclid = lead.fbclid || convertingClickSession?.fbclid || sessaoDoLead?.fbclid || null;
    // O horário do clique tem que ser o do clique que gerou ESSE fbclid.
    const fbcClickTime = lead.fbclid
      ? new Date(lead.created_at).getTime()
      : (convertingClickSession?.created_at ? new Date(convertingClickSession.created_at).getTime() : null);
    const ipAddress = lead.ip_address || sessaoDoLead?.ip_address || latestSession?.ip_address || null;
    const userAgent = lead.user_agent || sessaoDoLead?.user_agent || latestSession?.user_agent || null;
    // fbp identifica o NAVEGADOR: é o mesmo em todas as sessões da pessoa.
    const fbp = lead.fbp || convertingClickSession?.fbp || sessaoDoLead?.fbp || latestSession?.fbp || null;

    const isNumericId = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);
    const campaignId = lead.campaign_id || (isNumericId(lead.utm_campaign) ? lead.utm_campaign : null);
    const adId = lead.ad_id || (isNumericId(lead.utm_content) ? lead.utm_content : null);

    const userData = await buildUserData(
      {
        email: lead.email,
        phone: lead.whatsapp,
        name: lead.nome_completo,
        externalIds: [lead.id, lead.session_id],
      },
      { fbc, fbp, fbclid, fbcClickTime, ip: ipAddress, userAgent },
    );

    const actionSource = action_source || "website";

    // URL onde o evento aconteceu. O do navegador manda a dele; o do quiz cai
    // na página de obrigado correspondente, que é onde o pixel disparou o
    // evento irmão. Evento `system_generated` (admin) não tem página: vai sem.
    const defaultUrl = "https://www.championadstudio.com";
    let eventSourceUrl: string | null = event_source_url || null;
    if (!eventSourceUrl && actionSource === "website") {
      eventSourceUrl = lead.page_url || defaultUrl;
      if (eventName === "MQL" || eventName === "Sprint") {
        eventSourceUrl = `${defaultUrl}/${eventName === "MQL" ? "obrigadomql" : "obrigadosprint"}`;
      }
    }

    const evento: EventoMeta = {
      event_name: eventName,
      event_id: event_id || `${lead.id}_${eventName}`,
      event_time: event_time || undefined,
      event_source_url: eventSourceUrl,
      action_source: actionSource,
      user_data: userData,
      custom_data: {
        lead_id: lead.id,
        ...(lead.investimento_faixa && { investimento_faixa: lead.investimento_faixa }),
        ...(campaignId && { campaign_id: campaignId }),
        ...(adId && { ad_id: adId }),
        ...(value != null && { value: Number(value), currency: currency || "BRL" }),
        ...(custom_data && typeof custom_data === "object" ? custom_data : {}),
      },
    };

    const chaveNoLead: string = typeof dedup_key === "string" && dedup_key ? dedup_key : eventName;
    const codigoTeste: string | null = test_event_code || META_TEST_EVENT_CODE || null;
    const flags = identityFlags(userData);
    const baseLog = {
      lead_id: lead.id,
      event_name: eventName,
      event_id: evento.event_id,
      caller: quemChamou,
      action_source: actionSource,
      identity: flags,
      test_event_code: codigoTeste,
      retry_of: typeof retry_of === "string" ? retry_of : null,
    };

    // ── Reserva: quem chega segundo com o mesmo id não envia ──
    const reserva = await reservarEvento(supabase, { event_id: evento.event_id, event_name: eventName, lead_id: lead.id, caller: quemChamou });
    if (reserva === "duplicado") {
      console.log(`[meta-capi] ${eventName} lead=${lead.id} deduplicated (caller=${quemChamou})`);
      await registrarLog(supabase, { ...baseLog, status: "deduplicated" });
      // Não marca o lead aqui: quem reservou ainda pode estar enviando (ou
      // falhar e soltar a reserva). A marca é de quem o Meta aceitou; se o
      // primeiro morrer no meio, o /capi-retry limpa a reserva órfã e reenvia.
      return json({
        success: true, deduplicated: true, event_name: eventName, event_id: evento.event_id, lead_id: lead.id,
        had_fbc: flags.fbc, had_fbp: flags.fbp, had_ip: flags.ip, had_ua: flags.ua,
      });
    }

    console.log(`[meta-capi] ${eventName} lead=${lead.id} caller=${quemChamou} fbc=${flags.fbc} fbp=${flags.fbp} ip=${flags.ip} ua=${flags.ua} src=${actionSource}`);
    const result = await sendMetaEvents([evento], { testEventCode: test_event_code || undefined });

    if (result.success) {
      await confirmarReserva(supabase, evento.event_id, eventName);
      await marcarNoLead(supabase, lead.id, [chaveNoLead]);
    } else {
      // Solta a reserva: o retry (ou o próximo chamador) pode tentar de novo.
      await liberarReserva(supabase, evento.event_id, eventName);
    }

    const logId = await registrarLog(supabase, {
      ...baseLog,
      status: result.success ? "sent" : (result.rejected ? "rejected" : "failed"),
      http_status: result.status || null,
      events_received: result.events_received ?? null,
      fbtrace_id: result.fbtrace_id ?? null,
      error_message: result.error ?? null,
      meta_response: result.response ?? null,
      request: result.request?.[0] ?? null,
      attempt: result.attempts || 1,
    });

    return json({
      success: result.success,
      rejected: !!result.rejected,
      event_name: eventName,
      event_id: evento.event_id,
      lead_id: lead.id,
      caller: quemChamou,
      log_id: logId,
      had_fbc: flags.fbc,
      had_fbp: flags.fbp,
      had_ip: flags.ip,
      had_ua: flags.ua,
      attempts: result.attempts,
      error: result.error,
      meta_response: result.response,
    }, result.success ? 200 : (result.rejected ? 422 : 502));

  } catch (error) {
    console.error("Error in meta-capi:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
