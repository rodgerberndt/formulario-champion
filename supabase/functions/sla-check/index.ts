// sla-check — o relógio de 5 minutos do lead.
//
// Roda de minuto em minuto pelo pg_cron, olha todo lead ainda não chamado e
// escala quando o tempo passa dos degraus. Mesmo padrão do `meta-ads-cron`.
//
// ── Por que o relógio mora aqui e não no notify-lead ─────────────────────────
// O `notify-lead` dispara uma vez, no instante em que o lead cai, e trabalha em
// cima de `lead_sessions`. O SLA precisa do oposto: olhar repetidamente para o
// que NÃO aconteceu. Um lead que ninguém chamou não gera evento nenhum — é
// justamente a ausência de evento que se quer detectar — e só uma varredura
// periódica enxerga ausência.
//
// ── O que conta como "chamado" ───────────────────────────────────────────────
// `contacted_at`, gravado pelo botão "Chamei" do painel. Não `first_opened_at`:
// abrir o card não é falar com ninguém, e dá para abrir dez cards em vinte
// segundos sem ter chamado uma pessoa.
//
// ── Uma escalação por degrau ─────────────────────────────────────────────────
// `sla_stage` guarda o último degrau já avisado. Sem isso o cron mandaria a
// mesma escalação sessenta vezes por hora, o time desligaria a notificação, e o
// sistema teria produzido exatamente o problema que existe para resolver.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  DEGRAUS,
  dentroDoExpediente,
  minutosDeExpediente,
  responsaveisDoLead,
} from "../_shared/roteamento.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "";
/**
 * Chave própria do cron.
 *
 * O `pg_cron` guarda o comando em texto na tabela `cron.job`, e quem consegue
 * ler o banco lê o header junto. Uma chave dedicada mantém o
 * INTERNAL_WEBHOOK_SECRET — que abre outras functions — fora de lá.
 */
const CRON_KEY = Deno.env.get("SLA_CRON_KEY") || "";
const ADMIN_ROUTE_SLUG = Deno.env.get("VITE_ADMIN_ROUTE_SLUG") || "champion-analytics-admin-9f3c";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-secret",
};

/**
 * Só MQL entra no relógio, por decisão do Rodger em 03/09/2026: começar pelo
 * lead que paga a conta, calibrar os degraus com volume baixo, e só então abrir
 * para o resto. Alerta que toca demais é alerta que o time desliga.
 */
const SO_MQL = true;

/** Quanto tempo para trás procurar. Nada mais velho que isso é escalável. */
const JANELA_HORAS = 24;

interface LeadPendente {
  id: string;
  nome_completo: string | null;
  created_at: string;
  investimento_faixa: string | null;
  sdr_override: string | null;
  sla_stage: number | null;
  sla_owner: string | null;
  sla_breached_at: string | null;
}

/**
 * Degrau reservado para "este lead não entra no relógio". Não é escalação: é a
 * marca de que já se decidiu que ele fica de fora, para o cron não reavaliar a
 * mesma linha a cada minuto durante 24 horas. Relatório que ler degraus tem que
 * ignorar 99, senão conta como escalado ao máximo quem nunca foi escalado.
 */
const FORA_DO_RELOGIO = 99;

/**
 * Reunião já marcada tira o lead do relógio (17/09/2026).
 *
 * O relógio existe para cobrar o PRIMEIRO contato, e `contacted_at` é gravado
 * só pelo botão "Chamei" do painel. Desde que o lead de faixa alta agenda
 * sozinho em /agendar (migration 20260917150000), existe um caminho em que o
 * objetivo do SLA já foi alcançado sem ninguém tocar naquele botão: a call está
 * na agenda. O cron continuava escalando esse lead de 3 em 3 minutos até o
 * degrau da gestão — cobrando resposta de uma conversa que já tem hora marcada.
 *
 * Contam como resolvido `agendada` e `realizada`. `no_show` NÃO: o lead não
 * apareceu, ninguém falou com ele, e o relógio volta a fazer sentido.
 *
 * Linha anterior à migration 20260828140000 não tem `status`; nela o booleano
 * `attended` é a única informação, e `false` significava "ainda vai acontecer".
 * Mesma regra de `statusDaReuniao` em admin-data/meetings.ts — repetida aqui de
 * propósito, para esta function não depender do bundle do painel.
 */
const RESOLVE_O_SLA = new Set(["agendada", "realizada"]);

function reuniaoTiraDoRelogio(m: { status?: string | null; attended?: boolean | null }): boolean {
  const s = m.status;
  if (s === "agendada" || s === "realizada" || s === "no_show") return RESOLVE_O_SLA.has(s);
  // Sem `status`: `attended` true = realizada, false/null = agendada. As duas
  // resolvem, então a linha antiga sempre tira o lead do relógio.
  return true;
}

async function mandarPush(
  pessoas: string[],
  title: string,
  body: string,
  url: string,
): Promise<number> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/web-push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": INTERNAL_SECRET,
        "Authorization": `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ title, body, url, pessoas, tag: `sla-${Date.now()}` }),
    });
    const j = await res.json().catch(() => ({}));
    return typeof j.sent === "number" ? j.sent : 0;
  } catch (e) {
    console.error("[sla-check] push falhou:", e instanceof Error ? e.message : e);
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Só o cron e as outras functions chamam isto. Sem a trava, qualquer um
  // dispararia escalação no celular do time.
  const segredo = req.headers.get("x-webhook-secret") || "";
  const autorizado =
    (!!CRON_KEY && segredo === CRON_KEY) ||
    (!!INTERNAL_SECRET && segredo === INTERNAL_SECRET);
  if (!autorizado) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const agora = new Date();

  // Fora do expediente o relógio não anda. O lead continua entrando e o push de
  // chegada continua saindo; o que não acontece é escalar e cobrar 5 minutos de
  // resposta às 3 da manhã, que transformaria a métrica numa ficção.
  if (!dentroDoExpediente(agora)) {
    return new Response(JSON.stringify({ ok: true, fora_do_expediente: true, escalados: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const desde = new Date(agora.getTime() - JANELA_HORAS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("leads")
    .select("id, nome_completo, created_at, investimento_faixa, sdr_override, sla_stage, sla_owner, sla_breached_at")
    .is("contacted_at", null)
    .lt("sla_stage", 15)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[sla-check] leitura falhou:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pendentes = (data || []) as LeadPendente[];
  const acoes: Array<Record<string, unknown>> = [];

  // Quem já tem call na agenda. UMA consulta para os leads desta rodada (no
  // máximo 200), em vez de uma por lead dentro do laço.
  const comReuniao = new Set<string>();
  if (pendentes.length > 0) {
    const { data: reunioes, error: erroReunioes } = await supabase
      .from("meetings")
      .select("lead_id, status, attended")
      .in("lead_id", pendentes.map((l) => l.id));
    if (erroReunioes) {
      // Falha na leitura das reuniões NÃO pode virar "escalar todo mundo": o
      // relógio segue como antes, e o log diz por quê.
      console.error("[sla-check] leitura de reuniões falhou:", erroReunioes.message);
    } else {
      for (const m of (reunioes || []) as Array<{ lead_id: string | null; status: string | null; attended: boolean | null }>) {
        if (m.lead_id && reuniaoTiraDoRelogio(m)) comReuniao.add(m.lead_id);
      }
    }
  }

  let tiradosPorReuniao = 0;

  for (const lead of pendentes) {
    // Call marcada = objetivo do SLA alcançado. Sai do relógio antes de
    // qualquer outra conta: nem roteamento nem degrau importam mais.
    // `sla_breached_at` NÃO é apagado — se o lead estourou antes de a reunião
    // existir, isso aconteceu, e o histórico é a métrica.
    if (comReuniao.has(lead.id)) {
      await supabase.from("leads").update({ sla_stage: FORA_DO_RELOGIO }).eq("id", lead.id);
      tiradosPorReuniao++;
      continue;
    }

    const responsaveis = responsaveisDoLead(lead.investimento_faixa);
    // Lead sem dono (só "Não vendo ainda") sai do relógio de vez, para não ser
    // reavaliado a cada minuto pelas próximas 24 horas.
    if (!responsaveis) {
      await supabase.from("leads").update({ sla_stage: FORA_DO_RELOGIO }).eq("id", lead.id);
      continue;
    }
    if (SO_MQL && !responsaveis.mql) {
      await supabase.from("leads").update({ sla_stage: FORA_DO_RELOGIO }).eq("id", lead.id);
      continue;
    }

    const esperando = minutosDeExpediente(new Date(lead.created_at), agora);
    const jaAvisado = lead.sla_stage ?? 0;

    // O degrau mais alto que este lead já alcançou e que ainda não foi avisado.
    // Pegar o MAIOR, e não o próximo, importa quando o cron fica minutos sem
    // rodar: um lead de 20 minutos tem que ir direto para a gestão, não subir
    // um degrau por minuto até chegar lá.
    const degrau = [...DEGRAUS]
      .reverse()
      .find((d) => esperando >= d.minutos && d.minutos > jaAvisado);
    if (!degrau) continue;

    const nome = lead.nome_completo || "Lead sem nome";
    const destinatarios = [...new Set(degrau.quem(responsaveis))];
    const enviados = await mandarPush(
      destinatarios,
      degrau.titulo(nome),
      degrau.corpo(nome, esperando),
      `/${ADMIN_ROUTE_SLUG}?highlight=${lead.id}`,
    );

    const patch: Record<string, unknown> = {
      sla_stage: degrau.minutos,
      sla_last_notified_at: agora.toISOString(),
      // O dono é congelado na primeira escalação. O roteamento já mudou três
      // vezes em 2026, e um lead não pode ser cobrado depois de quem nem
      // atendia essa faixa na época.
      sla_owner: lead.sla_owner || responsaveis.dono,
    };
    // O estouro é marcado UMA vez, quando o lead cruza os 5 minutos. Remarcar
    // no degrau de 15 apagaria o instante real da falha, que é a métrica.
    if (degrau.minutos >= 5 && !lead.sla_breached_at) {
      patch.sla_breached_at = agora.toISOString();
    }

    await supabase.from("leads").update(patch).eq("id", lead.id);

    acoes.push({
      lead: nome,
      minutos: esperando,
      degrau: degrau.minutos,
      avisados: destinatarios,
      aparelhos: enviados,
    });
    console.log(`[sla-check] ${nome}: ${esperando}min → degrau ${degrau.minutos} → ${destinatarios.join(", ")} (${enviados} aparelhos)`);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      verificados: pendentes.length,
      escalados: acoes.length,
      // Quantos saíram do relógio nesta rodada por já terem call marcada.
      // Serve de sanidade: se este número for alto todo dia, o botão "Chamei"
      // parou de ser usado e o SLA está sendo medido pela agenda, não pelo
      // primeiro contato.
      fora_por_reuniao: tiradosPorReuniao,
      acoes,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
