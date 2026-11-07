// Agendamento automático da call de diagnóstico (17/09/2026).
//
// Rotas PÚBLICAS (o lead não tem login), sob /functions/v1/agendamento:
//   GET  /slots?lead_id=<uuid>          horários livres dos próximos dias
//   POST /reservar {lead_id, inicio}    reserva um horário e cria a reunião
//
// Do cliente só se aceita `lead_id` e `inicio`. Todo o resto (faixa, nome,
// e-mail, grade, closer, duração) vem do banco. As travas contra abuso:
//   - lead_id precisa ser UUID de um lead EXISTENTE, criado há menos de
//     `lead_validade_horas` (24 h), com faturamento >= R$ 100 mil;
//   - `inicio` precisa ser exatamente um horário da grade de agora;
//   - um lead só tem uma reunião futura (checagem + índice único);
//   - a reserva é atômica no banco (reservar_reuniao_auto: advisory lock +
//     rechecagem de espaçamento + insert na mesma transação).
//
// Ocupação de um horário:
//   (a) reunião agendada/realizada a menos de `espacamento_minutos` do início;
//   (b) período ocupado no Google (agenda organizadora + agenda do Caio) que
//       sobreponha a janela da call. Se o Google falhar, vale só (a), o erro vai
//       para agendamento_config.ultimo_erro_google e o lead não trava.
//
// Toda resposta JSON leva `servico: "agendamento"`. O front usa isso para saber
// que falou com ESTA função (e não com o 404 do gateway de uma função ainda não
// publicada), que é o que decide a prévia local em dev.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { consultarOcupacao, sincronizarReuniao } from "../_shared/google-calendar.ts";
import { capiKey, marcarNoLead } from "../_shared/meta.ts";
import {
  agruparPorDia,
  faixaPermiteAgendamento,
  filtrarLivres,
  gerarCandidatos,
  janelaDeBusca,
  motivoIndisponivel,
  normalizarGrade,
  slotDaGrade,
  type GradeConfig,
  type Intervalo,
} from "../_shared/agenda-grade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ servico: "agendamento", ...body }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type Cliente = any;

interface ConfigAgendamento extends GradeConfig {
  ativo: boolean;
  closer: string;
  agendas_ocupacao: string[];
  lead_validade_horas: number;
}

function admin(): Cliente {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function carregarConfig(supabase: Cliente): Promise<ConfigAgendamento | null> {
  const { data, error } = await supabase
    .from("agendamento_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    // Migration não aplicada: não inventa grade em produção.
    console.error("[agendamento] agendamento_config indisponível:", error.message);
    return null;
  }
  const grade = normalizarGrade(data);
  return {
    ...grade,
    ativo: data ? data.ativo !== false : true,
    closer: (data?.closer as string) || "Caio",
    agendas_ocupacao: Array.isArray(data?.agendas_ocupacao) ? data.agendas_ocupacao : ["primary", "caio6328@gmail.com"],
    lead_validade_horas: Number(data?.lead_validade_horas) > 0 ? Number(data.lead_validade_horas) : 24,
  };
}

type LeadValido = { id: string; nome_completo: string | null; email: string | null; utm_content: string | null };

/** Valida o lead ou devolve a resposta de erro pronta. */
async function validarLead(
  supabase: Cliente,
  leadId: string | null,
  cfg: ConfigAgendamento,
): Promise<{ lead: LeadValido } | { erro: Response }> {
  if (!leadId || !UUID_RE.test(leadId)) {
    return { erro: json({ erro: "lead_invalido", mensagem: "lead_id inválido" }, 400) };
  }
  const { data: lead } = await supabase
    .from("leads")
    .select("id,nome_completo,email,investimento_faixa,created_at,utm_content")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { erro: json({ erro: "lead_nao_encontrado", mensagem: "lead não encontrado" }, 404) };

  const idadeMs = Date.now() - Date.parse(lead.created_at);
  if (!Number.isFinite(idadeMs) || idadeMs > cfg.lead_validade_horas * 60 * 60 * 1000) {
    return { erro: json({ erro: "lead_expirado", mensagem: "o prazo para agendar por aqui expirou" }, 403) };
  }
  if (!faixaPermiteAgendamento(lead.investimento_faixa)) {
    return { erro: json({ erro: "faixa_nao_elegivel", mensagem: "faixa de faturamento sem agendamento automático" }, 403) };
  }
  return { lead };
}

/** Reunião futura em pé do lead, se houver. */
async function reuniaoFutura(supabase: Cliente, leadId: string) {
  const { data } = await supabase
    .from("meetings")
    .select("id,scheduled_at")
    .eq("lead_id", leadId)
    .eq("status", "agendada")
    .or(`scheduled_at.is.null,scheduled_at.gt.${new Date().toISOString()}`)
    .order("scheduled_at", { ascending: true })
    .limit(1);
  const m = data?.[0];
  if (!m) return null;
  const { data: evento } = await supabase
    .from("meeting_calendar_events")
    .select("meet_link")
    .eq("meeting_id", m.id)
    .maybeSingle();
  return { meeting_id: m.id as string, inicio: m.scheduled_at as string | null, meet_link: (evento?.meet_link as string) ?? null };
}

async function registrarErroGoogle(supabase: Cliente, erros: string[]) {
  if (!erros.length) return;
  const msg = erros.join(" | ").slice(0, 1000);
  console.error("[agendamento] ocupação do Google indisponível, usando só o espaçamento:", msg);
  try {
    await supabase.from("agendamento_config")
      .update({ ultimo_erro_google: msg, ultimo_erro_google_em: new Date().toISOString() })
      .eq("id", 1);
  } catch { /* best effort */ }
}

/** Inícios das reuniões que ocupam a grade (agendada ou realizada) na janela. */
async function iniciosOcupados(supabase: Cliente, janela: Intervalo): Promise<number[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select("scheduled_at")
    .in("status", ["agendada", "realizada"])
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(janela.inicioMs).toISOString())
    .lte("scheduled_at", new Date(janela.fimMs).toISOString());
  if (error) throw new Error(`leitura de reuniões: ${error.message}`);
  return (data ?? []).map((m: { scheduled_at: string }) => Date.parse(m.scheduled_at)).filter(Number.isFinite);
}

async function ocupacaoGoogle(supabase: Cliente, cfg: ConfigAgendamento, janela: Intervalo) {
  const r = await consultarOcupacao(
    supabase,
    cfg.agendas_ocupacao,
    new Date(janela.inicioMs).toISOString(),
    new Date(janela.fimMs).toISOString(),
  );
  await registrarErroGoogle(supabase, r.erros);
  // Leitura parcial vale: se a agenda do Caio falhou e a organizadora veio, usa
  // a organizadora. "ok" só diz se TUDO foi lido.
  return { ocupados: r.ocupados as Intervalo[], google: r.ok ? "ok" : (r.ocupados.length ? "parcial" : "indisponivel") };
}

function chamarMetaCapi(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/meta-capi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
    },
    body: JSON.stringify({ caller: "agendamento", ...body }),
  });
}

/**
 * Reunião agendada = evento `Schedule` pela CAPI, IGUAL ao POST /meetings do
 * painel (admin-data): mesmo event_id `meeting_<id>`, mesma chave de dedup
 * `Schedule:<id>` em leads.capi_events_sent. Só o servidor manda; o navegador
 * não dispara Schedule neste fluxo. Best effort.
 */
async function dispararSchedule(supabase: Cliente, leadId: string, meetingId: string, closer: string) {
  const chave = capiKey("Schedule", meetingId);
  try {
    const { data: lead } = await supabase.from("leads").select("capi_events_sent").eq("id", leadId).maybeSingle();
    if ((lead?.capi_events_sent as Record<string, boolean> | null)?.[chave]) return;
    const resp = await chamarMetaCapi({
      lead_id: leadId,
      event_name: "Schedule",
      event_id: `meeting_${meetingId}`,
      dedup_key: chave,
      action_source: "system_generated",
      custom_data: { meeting_id: meetingId, closer, agendado_por: "auto" },
    });
    console.log(`[agendamento] CAPI Schedule meeting ${meetingId}: ${resp.status}`, await resp.text());
    if (resp.ok) await marcarNoLead(supabase, leadId, [chave, "Meeting"]);
  } catch (e) {
    console.error("[agendamento] CAPI Schedule falhou:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/agendamento/, "") || "/";
  const supabase = admin();

  try {
    const cfg = await carregarConfig(supabase);
    if (!cfg) return json({ erro: "indisponivel", mensagem: "agendamento indisponível" }, 503);

    // ── GET /slots ───────────────────────────────────────────────────────────
    if (path === "/slots" && req.method === "GET") {
      const v = await validarLead(supabase, url.searchParams.get("lead_id"), cfg);
      if ("erro" in v) return v.erro;

      const existente = await reuniaoFutura(supabase, v.lead.id);
      if (existente) return json({ ja_agendado: existente, dias: [] });

      const base = {
        fuso: cfg.fuso,
        duracao_minutos: cfg.duracao_minutos,
        closer: cfg.closer,
      };
      if (!cfg.ativo) return json({ ...base, dias: [], google: "nao_consultado", desligado: true });

      const agora = Date.now();
      const candidatos = gerarCandidatos(cfg, agora);
      const janela = janelaDeBusca(candidatos, cfg);
      if (!janela) return json({ ...base, dias: [], google: "nao_consultado" });

      const [inicios, google] = await Promise.all([
        iniciosOcupados(supabase, janela),
        ocupacaoGoogle(supabase, cfg, janela),
      ]);
      const livres = filtrarLivres(candidatos, inicios, google.ocupados, cfg);

      return json({
        ...base,
        google: google.google,
        dias: agruparPorDia(livres).map((d) => ({
          data: d.data,
          dia_semana_iso: d.diaSemanaIso,
          slots: d.slots.map((s) => ({ inicio: s.inicio, hora: s.hora })),
        })),
      });
    }

    // ── POST /reservar ───────────────────────────────────────────────────────
    if (path === "/reservar" && req.method === "POST") {
      let body: Record<string, unknown> = {};
      try { body = await req.json(); } catch { /* corpo inválido cai na validação */ }
      const leadId = typeof body.lead_id === "string" ? body.lead_id : null;
      const inicioPedido = typeof body.inicio === "string" ? body.inicio : "";

      const v = await validarLead(supabase, leadId, cfg);
      if ("erro" in v) return v.erro;
      const lead = v.lead;

      const existente = await reuniaoFutura(supabase, lead.id);
      if (existente) return json({ erro: "lead_ja_agendado", mensagem: "você já tem uma call agendada", ja_agendado: existente }, 409);

      if (!cfg.ativo) return json({ erro: "desligado", mensagem: "agendamento automático desligado" }, 409);

      const agora = Date.now();
      const slot = slotDaGrade(inicioPedido, cfg, agora);
      if (!slot) return json({ erro: "horario_invalido", mensagem: "esse horário não está disponível" }, 422);

      // Rechecagem do Google no momento da reserva, só para a janela deste slot.
      // Falha do Google não bloqueia (regra 4); o espaçamento é rechecado de
      // forma atômica dentro do banco logo abaixo.
      const janelaSlot: Intervalo = {
        inicioMs: slot.inicioMs - cfg.espacamento_minutos * 60 * 1000,
        fimMs: slot.inicioMs + Math.max(cfg.espacamento_minutos, cfg.duracao_minutos) * 60 * 1000,
      };
      const google = await ocupacaoGoogle(supabase, cfg, janelaSlot);
      if (motivoIndisponivel(slot.inicioMs, [], google.ocupados, cfg) === "agenda") {
        return json({ erro: "slot_ocupado", mensagem: "esse horário acabou de ser ocupado" }, 409);
      }

      const nome = (lead.nome_completo || "").trim() || "Lead";
      const { data: meetingId, error } = await supabase.rpc("reservar_reuniao_auto", {
        p_lead_id: lead.id,
        p_inicio: slot.inicio,
        p_closer: cfg.closer,
        p_lead_nome: nome,
        p_notes: `${nome} — agendado pelo próprio lead no site`,
        p_utm_content: lead.utm_content,
      });

      if (error) {
        const msg = `${error.message ?? ""} ${error.details ?? ""}`;
        if (/slot_ocupado/.test(msg)) {
          return json({ erro: "slot_ocupado", mensagem: "esse horário acabou de ser ocupado" }, 409);
        }
        // Índice único uq_meetings_auto_lead_agendada (duas abas ao mesmo tempo).
        if (/lead_ja_agendado|uq_meetings_auto_lead_agendada|23505/.test(`${msg} ${error.code ?? ""}`)) {
          const atual = await reuniaoFutura(supabase, lead.id);
          return json({ erro: "lead_ja_agendado", mensagem: "você já tem uma call agendada", ja_agendado: atual }, 409);
        }
        throw new Error(`reservar_reuniao_auto: ${error.message}`);
      }

      const id = String(meetingId);

      // Evento no Google (convida o lead e cria o Meet porque agendado_por =
      // auto). Nunca lança; a reunião já está gravada de qualquer jeito.
      const calendario = await sincronizarReuniao(supabase, id);
      if (!calendario.ok) console.error(`[agendamento] reunião ${id} sem evento no Google: ${calendario.error}`);

      await dispararSchedule(supabase, lead.id, id, cfg.closer);

      return json({
        ok: true,
        meeting_id: id,
        inicio: slot.inicio,
        fuso: cfg.fuso,
        duracao_minutos: cfg.duracao_minutos,
        meet_link: calendario.meetLink ?? null,
        convite_enviado: calendario.ok && !!lead.email,
        google: google.google,
      });
    }

    return json({ erro: "rota_nao_encontrada", mensagem: `Rota não encontrada: ${path}` }, 404);
  } catch (e) {
    console.error("[agendamento]", e);
    return json({ erro: "interno", mensagem: e instanceof Error ? e.message : "erro desconhecido" }, 500);
  }
});
