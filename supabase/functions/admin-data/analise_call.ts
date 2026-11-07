// A leitura da call pela IA.
//
// ── O que ela lê, e o que ela NÃO lê ─────────────────────────────────────────
// Ela lê o Processo Abóbora, o que o lead declarou no quiz, o desfecho da
// reunião e se houve venda. Ela NÃO lê a gravação: o áudio está no Drive, fora
// do alcance desta função, e transcrição ainda não existe no sistema. Chamar de
// "análise da call" o que só viu o formulário seria mentir sobre a fonte, então
// a resposta carrega `fontes` dizendo exatamente em cima de que ela foi feita.
//
// ── O aprendizado ────────────────────────────────────────────────────────────
// Não é um modelo treinado; é o corpus inteiro entrando no prompt a cada
// chamada. Toda reunião com Abóbora e desfecho conhecido vira uma linha do
// histórico, com as taxas de fechamento por resposta calculadas aqui, em SQL, e
// não pela IA — número que sai de LLM não se audita.
//
// Isso melhora sozinho na direção certa: a cada reunião registrada com Abóbora
// completo, a base que a IA usa para comparar cresce. Com 3 calls a leitura vale
// pouco e ela é obrigada a dizer isso; com 60 ela começa a valer.

import Anthropic from "npm:@anthropic-ai/sdk@0.117.1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { statusDaReuniao } from "./meetings.ts";

const MODELO = "claude-opus-5";

export interface AnaliseCall {
  desfecho: "fechou" | "nao_fechou" | "indefinido";
  fator_principal: string;
  fatores: string[];
  sinais_do_abobora: string[];
  o_que_repetir: string;
  o_que_evitar: string;
  confianca: "baixa" | "media" | "alta";
  fontes: string[];
  base_historica: number;
}

interface LinhaHistorica {
  decide: string | null;
  posicao: string | null;
  segmento: string | null;
  investimento: string | null;
  status: string;
  fechou: boolean;
}

/**
 * Taxa de fechamento por resposta do Abóbora, calculada em cima do histórico.
 *
 * Vai pronta no prompt porque contagem é trabalho de banco, não de modelo de
 * linguagem: a IA erra somas com naturalidade, e uma taxa errada aqui vira
 * conselho errado para o time comercial.
 */
function taxas(historico: LinhaHistorica[]) {
  const porChave = (chave: (l: LinhaHistorica) => string | null) => {
    const mapa: Record<string, { total: number; fechou: number }> = {};
    for (const l of historico) {
      const k = (chave(l) || "não informado").trim().toLowerCase().slice(0, 60);
      (mapa[k] ??= { total: 0, fechou: 0 }).total++;
      if (l.fechou) mapa[k].fechou++;
    }
    return Object.entries(mapa)
      .filter(([, v]) => v.total >= 2)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v.fechou}/${v.total} fecharam`);
  };

  return {
    por_decide: porChave((l) => (l.decide === "sim" ? "decide na call" : l.decide === "nao" ? "não decide sozinho" : null)),
    por_segmento: porChave((l) => l.segmento),
    por_investimento: porChave((l) => l.investimento),
    por_status: porChave((l) => l.status),
  };
}

const SYSTEM = `Você analisa reuniões comerciais da Champion Advertising Studio.

O QUE A CHAMPION VENDE:
Assessoria de criativos e copy para operações digitais já validadas. O cliente não briefa, não gerencia e não precisa de head de criativo. A promessa é mudança de patamar dentro do trimestre, não velocidade. Existe também o Sprint, um produto menor, de ticket baixo, para quem ainda não sustenta a assessoria.

QUEM ENTRA NA CALL:
Dono de operação digital faturando de R$ 10 mil por mês para cima. Já roda tráfego, já tem oferta no ar, e normalmente já se queimou com agência.

O PROCESSO ABÓBORA:
As quatro perguntas que o SDR levanta ANTES da call chegar ao closer: posição do lead na operação, segmento e nicho, se ele decide sim ou não na própria call, e quanto investe em tráfego / quanto fatura. A hipótese da casa é que quem NÃO decide sozinho fecha muito menos, porque a decisão sai da sala.

COMO VOCÊ TRABALHA:
- Quando existir o campo "desfecho_escrito_pelo_closer", ele é a FONTE PRIMÁRIA: foi quem estava na call que escreveu. Sua leitura explica e contextualiza o que ele disse, nunca o contradiz sem apontar a evidência.
- Você NÃO ouviu a call. Você tem o formulário de qualificação, o desfecho e o histórico. Nunca escreva como se tivesse ouvido: não invente falas, objeções ditas, nem momentos da conversa.
- As taxas de fechamento do histórico vêm calculadas e são fato. Não recalcule, não arredonde para um número mais bonito, e não invente taxas que não estão ali.
- Quando o histórico tiver menos de 15 reuniões com desfecho, diga que a base é pequena e marque confianca "baixa". Amostra pequena com tom de certeza é o pior resultado possível aqui.
- Aponte UM fator principal, o mais provável, e diga por que ele e não outro.
- Escreva direto, em português do Brasil, sem enrolação e sem elogiar o time.

Responda SOMENTE com um objeto JSON, sem markdown e sem texto em volta:
{
  "desfecho": "fechou" | "nao_fechou" | "indefinido",
  "fator_principal": "uma frase",
  "fatores": ["até 4 frases curtas"],
  "sinais_do_abobora": ["o que as respostas do Abóbora indicavam, até 3"],
  "o_que_repetir": "uma frase",
  "o_que_evitar": "uma frase",
  "confianca": "baixa" | "media" | "alta"
}`;

export async function analisarCall(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{ ok: true; analise: AnaliseCall } | { ok: false; erro: string; status: number }> {
  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) {
    return { ok: false, erro: "ANTHROPIC_API_KEY não configurada no projeto", status: 503 };
  }

  const { data: reuniao } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();
  if (!reuniao) return { ok: false, erro: "Reunião não encontrada", status: 404 };

  // O lead, quando existe. Indicação e social selling não têm.
  let lead: Record<string, unknown> | null = null;
  if (reuniao.lead_id) {
    const { data } = await supabase
      .from("leads")
      .select("nome_completo, mercado, investimento_faixa, faturamento_declarado, operacoes_ativas, dor_desejo, nps_score, score, tier, raw_answers_json")
      .eq("id", reuniao.lead_id)
      .maybeSingle();
    lead = data || null;
  }

  // Houve venda ligada a este lead?
  let venda: Record<string, unknown> | null = null;
  if (reuniao.lead_id) {
    const { data } = await supabase
      .from("manual_sales")
      .select("sale_date, revenue, sale_type, refunded_at, refund_reason")
      .eq("lead_id", reuniao.lead_id)
      .order("sale_date", { ascending: false })
      .limit(1);
    venda = (data && data[0]) || null;
  }

  // ── O histórico que a IA usa para comparar ────────────────────────────────
  // Só reuniões que já tiveram desfecho e que têm Abóbora: as outras não
  // ensinam nada, e enchem o prompt de linha vazia.
  const { data: todas } = await supabase
    .from("meetings")
    .select("id, lead_id, status, attended, abobora_posicao, abobora_segmento, abobora_decide, abobora_investimento")
    .not("abobora_decide", "is", null)
    .neq("id", meetingId);

  const idsLeads = [...new Set((todas || []).map((m) => m.lead_id).filter(Boolean))] as string[];
  const fechados = new Set<string>();
  if (idsLeads.length) {
    const { data: vendas } = await supabase
      .from("manual_sales")
      .select("lead_id")
      .is("refunded_at", null)
      .in("lead_id", idsLeads);
    for (const v of vendas || []) if (v.lead_id) fechados.add(v.lead_id as string);
  }

  const historico: LinhaHistorica[] = (todas || []).map((m) => ({
    decide: m.abobora_decide,
    posicao: m.abobora_posicao,
    segmento: m.abobora_segmento,
    investimento: m.abobora_investimento,
    status: statusDaReuniao(m),
    fechou: !!(m.lead_id && fechados.has(m.lead_id as string)),
  }));

  const status = statusDaReuniao(reuniao);
  const desfechoConhecido = venda ? "houve venda registrada para este lead" : status === "realizada"
    ? "call realizada e sem venda registrada até agora"
    : status === "no_show"
      ? "o lead não compareceu"
      : "a call ainda não aconteceu";

  const contexto = {
    reuniao: {
      status,
      data_da_call: reuniao.scheduled_at,
      origem: reuniao.origem,
      closer: reuniao.closer,
      observacao: reuniao.notes,
      tem_gravacao: !!reuniao.recording_url,
    },
    // O que o closer escreveu depois da call. É o dado mais direto que existe
    // sobre o desfecho, e sem ele a IA só teria o formulário para especular.
    desfecho_escrito_pelo_closer: reuniao.motivo_categoria
      ? { motivo: reuniao.motivo_categoria, relato: reuniao.motivo_detalhe, por: reuniao.motivo_por }
      : null,
    processo_abobora: {
      posicao_do_lead: reuniao.abobora_posicao,
      segmento_e_nicho: reuniao.abobora_segmento,
      decide_na_call: reuniao.abobora_decide,
      quem_decide: reuniao.abobora_quem_decide,
      investimento_e_faturamento: reuniao.abobora_investimento,
    },
    lead_no_quiz: lead && {
      mercado: lead.mercado,
      faixa_declarada: lead.investimento_faixa,
      faturamento_em_numero: lead.faturamento_declarado,
      operacoes_ativas: lead.operacoes_ativas,
      dor: lead.dor_desejo,
      entendeu_a_pagina: lead.nps_score,
      nota_de_qualificacao: lead.score,
    },
    venda: venda && {
      data: venda.sale_date, receita: venda.revenue, produto: venda.sale_type,
      // Fechou e devolveu é o desfecho mais caro que existe: custou a mídia, a
      // call e a entrega, e a receita não ficou. A IA precisa ler isso como
      // perda, não como venda.
      reembolsada: !!venda.refunded_at, motivo_reembolso: venda.refund_reason ?? null,
    },
    desfecho_conhecido: desfechoConhecido,
    historico: {
      reunioes_com_abobora: historico.length,
      taxas_calculadas_em_sql: taxas(historico),
    },
  };

  const anthropic = new Anthropic({ apiKey: chave });
  let texto = "";
  try {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Analise esta reunião.\n\n${JSON.stringify(contexto, null, 2)}`,
      }],
    });
    texto = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  } catch (e) {
    return { ok: false, erro: `Falha ao chamar o modelo: ${e instanceof Error ? e.message : String(e)}`, status: 502 };
  }

  // O modelo às vezes embrulha o JSON em cerca de markdown mesmo instruído a
  // não fazer. Recortar entre a primeira chave e a última é mais barato que
  // uma segunda chamada só para reformatar.
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  let bruto: Record<string, unknown>;
  try {
    bruto = JSON.parse(inicio >= 0 && fim > inicio ? texto.slice(inicio, fim + 1) : texto);
  } catch {
    return { ok: false, erro: "O modelo não devolveu JSON válido", status: 502 };
  }

  const analise: AnaliseCall = {
    desfecho: (["fechou", "nao_fechou", "indefinido"].includes(String(bruto.desfecho))
      ? bruto.desfecho
      : "indefinido") as AnaliseCall["desfecho"],
    fator_principal: String(bruto.fator_principal || ""),
    fatores: Array.isArray(bruto.fatores) ? bruto.fatores.map(String).slice(0, 4) : [],
    sinais_do_abobora: Array.isArray(bruto.sinais_do_abobora) ? bruto.sinais_do_abobora.map(String).slice(0, 3) : [],
    o_que_repetir: String(bruto.o_que_repetir || ""),
    o_que_evitar: String(bruto.o_que_evitar || ""),
    // Base pequena não pode sair como leitura confiável, diga o modelo o que
    // disser: 15 reuniões é o piso abaixo do qual qualquer padrão aqui é ruído.
    confianca: historico.length < 15
      ? "baixa"
      : (["baixa", "media", "alta"].includes(String(bruto.confianca)) ? bruto.confianca : "media") as AnaliseCall["confianca"],
    fontes: [
      "Processo Abóbora",
      lead ? "respostas do quiz" : "sem lead no sistema",
      venda ? "venda registrada" : "sem venda registrada",
      `histórico de ${historico.length} reuniões com Abóbora`,
    ],
    base_historica: historico.length,
  };

  await supabase
    .from("meetings")
    .update({ analise_ia: { ...analise, modelo: MODELO }, analise_ia_at: new Date().toISOString() })
    .eq("id", meetingId);

  return { ok: true, analise };
}
