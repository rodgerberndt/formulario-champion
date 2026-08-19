// Geração das variações de copy de cada criativo.
//
// A copy não sai do nada: o prompt leva o Ouriço da Champion, a régua de MQL da
// casa e as copies que já estão rodando com melhor eficiência na conta. Escrever
// no escuro produz texto genérico, e genérico é o que já não converte.

import Anthropic from "npm:@anthropic-ai/sdk@0.117.1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const API_VERSION = (Deno.env.get("META_API_VERSION") || "v21.0").toLowerCase();

export interface CopyVariant {
  primary_text: string;
  headline: string;
  description: string;
  angle_used: string;
  rationale: string;
}

// Limites do Meta. Acima disso o texto é cortado com reticências na entrega, o
// que estraga justamente a última linha, onde mora a chamada.
const MAX_PRIMARY = 600;
const MAX_HEADLINE = 40;
const MAX_DESCRIPTION = 30;

const SYSTEM = `Você é o copywriter sênior da Champion, escrevendo anúncios de resposta direta para o Meta Ads.

CONTEXTO DA EMPRESA (Conceito do Ouriço, v2):
A Champion é o braço de copy autossuficiente, do anúncio ao checkout, que faz a operação já validada do cliente mudar de patamar no trimestre, e só ganha quando isso acontece.
Autossuficiente significa: o cliente não briefa, não gerencia, não precisa ter head de criativo nem de copy.
A promessa NÃO é velocidade nem "escalar rápido". É mudança de patamar sustentada dentro do trimestre.
Não atendemos: quem não tem oferta validada, quem não tem caixa, quem quer revisar cada linha de copy, e quem quer só edição de vídeo.

QUEM LÊ O ANÚNCIO:
Dono de operação digital já validada, faturando de 10 mil reais por mês para cima. Ele já roda tráfego, já tem oferta no ar e já se queimou com agência que promete escala e entrega relatório. Ele não é iniciante e detesta ser tratado como um.

O QUE CONTA COMO RESULTADO:
A métrica da casa é MQL, lead com faturamento declarado de 10 mil reais ou mais. Volume de lead não vale nada aqui. Escreva para filtrar: é melhor um anúncio que traz menos lead e mais MQL do que o contrário. Deixe o corte de faturamento sugerido no texto sempre que couber naturalmente.

REGRAS DE ESCRITA INEGOCIÁVEIS:
1. NUNCA use travessão (o caractere "—") nem meia risca. Use vírgula, ponto, dois-pontos ou quebra de linha no lugar. Esta regra não tem exceção.
2. As duas primeiras linhas do texto principal carregam o anúncio inteiro. Elas precisam parar o scroll sozinhas, sem depender do vídeo.
3. Nada de linguagem de guru: sem "segredo", sem "método revolucionário", sem "escale para 7 dígitos", sem promessa de faturamento específico que a gente não pode provar.
4. Sem emoji em excesso. No máximo um, e só se o ângulo pedir.
5. Português do Brasil, tom de sócio conversando com sócio. Direto, específico, sem floreio.
6. Cada variação precisa atacar um ângulo DIFERENTE. Duas variações que dizem a mesma coisa com palavras trocadas não são um teste, são desperdício de verba.

LIMITES DE CARACTERES (respeite, o Meta corta o excesso):
- texto principal: até ${MAX_PRIMARY} caracteres
- título: até ${MAX_HEADLINE} caracteres
- descrição: até ${MAX_DESCRIPTION} caracteres`;

const TOOL = {
  name: "entregar_copies",
  description: "Entrega as variações de copy prontas para virar anúncio.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      variantes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            primary_text: { type: "string", description: "Texto principal do anúncio" },
            headline: { type: "string", description: "Título, aparece abaixo do criativo" },
            description: { type: "string", description: "Descrição curta do link" },
            angle_used: { type: "string", description: "O ângulo desta variação, em até 5 palavras" },
            rationale: { type: "string", description: "Por que este ângulo, em uma frase" },
          },
          required: ["primary_text", "headline", "description", "angle_used", "rationale"],
          additionalProperties: false,
        },
      },
    },
    required: ["variantes"],
    additionalProperties: false,
  },
};

export interface ReferenceAd {
  ad_name: string;
  primary_text?: string;
  headline?: string;
  spend: number;
  clicks: number;
  impressions: number;
}

/**
 * Copies que já rodam na conta, ordenadas por eficiência de clique nos últimos
 * 30 dias. Serve de referência de ângulo para o modelo, não de molde para copiar.
 */
export async function referenceAds(
  supabase: SupabaseClient,
  adAccountId: string,
  limit = 6,
): Promise<ReferenceAd[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("ad_spend")
    .select("ad_id, ad_name, spend, clicks, impressions")
    .gte("date", since)
    .eq("ad_account_id", adAccountId);
  if (error || !data?.length) return [];

  // Agrega por anúncio: uma linha por dia vira um total do período.
  const byAd = new Map<string, { name: string; spend: number; clicks: number; impressions: number }>();
  for (const row of data as Array<Record<string, unknown>>) {
    const id = String(row.ad_id ?? "");
    if (!id) continue;
    const acc = byAd.get(id) ?? { name: String(row.ad_name ?? ""), spend: 0, clicks: 0, impressions: 0 };
    acc.spend += Number(row.spend) || 0;
    acc.clicks += Number(row.clicks) || 0;
    acc.impressions += Number(row.impressions) || 0;
    byAd.set(id, acc);
  }

  // Gasto mínimo antes de tratar como referência: abaixo disso o CPC é ruído.
  const ranked = [...byAd.entries()]
    .filter(([, a]) => a.spend >= 50 && a.clicks > 0)
    .sort((a, b) => a[1].spend / a[1].clicks - b[1].spend / b[1].clicks)
    .slice(0, limit);

  const token = Deno.env.get("META_ACCESS_TOKEN");
  const out: ReferenceAd[] = [];
  for (const [adId, agg] of ranked) {
    const ref: ReferenceAd = {
      ad_name: agg.name,
      spend: agg.spend,
      clicks: agg.clicks,
      impressions: agg.impressions,
    };
    if (token) {
      try {
        const url =
          `https://graph.facebook.com/${API_VERSION}/${adId}` +
          `?fields=creative{body,title}&access_token=${token}`;
        const json = await fetch(url).then((r) => r.json());
        ref.primary_text = json?.creative?.body;
        ref.headline = json?.creative?.title;
      } catch {
        // Referência sem texto ainda ajuda pelo nome do ângulo.
      }
    }
    out.push(ref);
  }
  return out;
}

/** Tira travessões e corta no limite do Meta sem partir palavra no meio. */
function sanitize(text: string, max: number): string {
  const clean = text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:]$/, "").trim();
}

export interface GenerateInput {
  count: number;
  angle?: string | null;
  briefing?: string | null;
  fileName: string;
  references: ReferenceAd[];
}

export async function generateCopies(input: GenerateInput): Promise<CopyVariant[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
  const client = new Anthropic({ apiKey });

  const refBlock = input.references.length
    ? input.references
        .map((r, i) => {
          const cpc = r.clicks ? (r.spend / r.clicks).toFixed(2) : "s/d";
          return [
            `Referência ${i + 1} (CPC R$ ${cpc}, ${r.impressions} impressões):`,
            `nome: ${r.ad_name}`,
            r.primary_text ? `texto: ${r.primary_text}` : null,
            r.headline ? `título: ${r.headline}` : null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n")
    : "Nenhuma referência de performance disponível ainda nesta conta.";

  const userMsg = [
    `Escreva ${input.count} variações de copy para um criativo novo que vai subir hoje.`,
    "",
    `Arquivo do criativo: ${input.fileName}`,
    input.angle ? `Ângulo definido pelo time: ${input.angle}` : null,
    input.briefing ? `Briefing do criativo:\n${input.briefing}` : null,
    "",
    "O que já está rodando na conta, do mais eficiente para o menos:",
    refBlock,
    "",
    "Use as referências para entender que ângulo esse público responde, e então escreva ângulos NOVOS.",
    "Não recicle as frases das referências. Se todas as referências atacam o mesmo ângulo, isso é um sinal de que falta variedade, e não de que aquele ângulo é o único que funciona.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    tools: [TOOL],
    tool_choice: { type: "tool", name: "entregar_copies" },
    messages: [{ role: "user", content: userMsg }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("modelo não devolveu as copies");
  }
  const raw = (block.input as { variantes?: CopyVariant[] }).variantes ?? [];

  return raw.slice(0, input.count).map((v) => ({
    primary_text: sanitize(v.primary_text ?? "", MAX_PRIMARY),
    headline: sanitize(v.headline ?? "", MAX_HEADLINE),
    description: sanitize(v.description ?? "", MAX_DESCRIPTION),
    angle_used: (v.angle_used ?? "").slice(0, 80),
    rationale: (v.rationale ?? "").slice(0, 400),
  })).filter((v) => v.primary_text.length > 20 && v.headline.length > 3);
}
