/**
 * Os três funis da Champion, e o Processo Abóbora que antecede toda call.
 *
 * ── Por que os funis passaram a ser três ─────────────────────────────────────
 * O painel nasceu medindo um funil só, porque só existia um jeito de entrar: o
 * formulário. Indicação e social selling sempre venderam, e sempre ficaram de
 * fora do sistema ou entraram fingindo ser tráfego. As duas saídas são ruins.
 * Ficar de fora esconde receita real; entrar como mídia paga faz o custo por
 * venda despencar por um motivo que não tem nada a ver com o anúncio.
 *
 * Nenhum dos dois novos passa pelo quiz, então nenhum dos dois tem lead no
 * banco. Por isso o formulário aceita nome digitado quando a origem não é mídia
 * paga: exigir um lead que não existe é o que mantinha esses funis fora daqui.
 *
 * Social selling ainda vai ganhar CRM próprio. Enquanto não ganha, registrar a
 * venda e a reunião com a origem certa já é o suficiente para saber quanto do
 * faturamento depende de anúncio.
 */

export type Origem = "midia_paga" | "indicacao" | "social_selling";

export const ORIGENS: Array<{ value: Origem; label: string; hint: string }> = [
  {
    value: "midia_paga",
    label: "Mídia paga",
    hint: "Veio do formulário. Entra na conta de CAC e na atribuição por criativo.",
  },
  {
    value: "indicacao",
    label: "Indicação",
    hint: "Chegou por indicação, fora do formulário. Não entra na conta de mídia.",
  },
  {
    value: "social_selling",
    label: "Social selling",
    hint: "Prospecção ativa. Não entra na conta de mídia.",
  },
];

export const ROTULO_ORIGEM: Record<string, string> = {
  midia_paga: "Mídia paga",
  indicacao: "Indicação",
  social_selling: "Social selling",
};

/** Origem que não passa pelo formulário, e portanto não tem lead no banco. */
export function precisaNomeManual(origem: Origem): boolean {
  return origem !== "midia_paga";
}

// ─────────────────────────────────────────────────────────────────────────────
// Processo Abóbora
//
// As perguntas que o SDR precisa ter respondido antes de a call chegar ao
// closer. Elas não são burocracia: cada uma existe para não gastar uma hora de
// closer descobrindo que a pessoa do outro lado não decide, ou que a operação
// não é do tipo que a Champion atende.
//
// A reunião não pode ser registrada sem elas — a trava está no backend, não só
// aqui, porque validação que mora só na tela é validação que não existe.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processo de decisao do lead — EXPERIMENTO de 07/09/2026.
 *
 * Diferente de `abobora_decide` (sim/nao), que responde "ele fecha na call?".
 * Esta pergunta responde "QUEM MAIS precisa estar na conversa", que e o dado
 * que faltava para explicar por que a faixa de 150 mil a 1 milhao agenda bem e
 * fecha mal. Nao pontua, nao desqualifica, nao bloqueia agendamento: so grava.
 *
 * O `abobora_decide` fica intacto de proposito — ele alimenta a coluna gerada
 * `abobora_completa` no banco, e mexer nos valores dele quebraria essa coluna.
 */
/**
 * A pergunta na tela e de DIAGNOSTICO, nao de qualificacao: fala de decisao
 * estrategica, nao de contratar, comprar ou fechar. Quem responde esta contando
 * como a empresa funciona, e nao sendo triado. Os `value` sao a chave do banco e
 * NAO mudam com a copy — trocar rotulo nao pode reescrever historico.
 *
 * `nao_sabe` continua na lista por compatibilidade: saiu da tela em 07/09/2026,
 * mas o CHECK do banco aceita, e nenhuma linha antiga fica invalida por isso.
 */
export const DECISAO_OPCOES: Array<{ value: string; label: string; ajuda: string }> = [
  { value: "sozinho", label: "Eu decido sozinho", ajuda: "Call normal, um participante." },
  { value: "socio", label: "Eu decido junto com meu sócio", ajuda: "A call precisa dos dois para terminar em decisão." },
  { value: "acima", label: "Eu participo, mas outra pessoa também precisa aprovar", ajuda: "Ele está na conversa, mas não conclui sozinho." },
  { value: "outra_pessoa", label: "Outra pessoa é responsável por esse tipo de decisão", ajuda: "Ele não decide. Vale como descoberta; a conversa que decide é com outra pessoa." },
];

export interface AboboraCampos {
  abobora_posicao: string;
  abobora_segmento: string;
  abobora_decide: "" | "sim" | "nao";
  abobora_quem_decide: string;
  abobora_investimento: string;
}

export const ABOBORA_VAZIO: AboboraCampos = {
  abobora_posicao: "",
  abobora_segmento: "",
  abobora_decide: "",
  abobora_quem_decide: "",
  abobora_investimento: "",
};

/**
 * O aviso que o SDR precisa dar quando o lead não quer trazer o decisor.
 *
 * Fica na tela, e não na cabeça de quem está na call, porque é a parte do
 * roteiro que mais some sob pressão. O corte no final é deliberado: falar de
 * fechamento antes da hora queima a call.
 */
export const AVISO_TRAZER_DECISOR =
  "Se o lead não quiser trazer essa pessoa, gere urgência: sem ela na call, " +
  "a empresa teria custo de remarketing, campanha e follow up para trazê-lo de " +
  "volta caso não feche ali. Não fale nada sobre fechamento — pare em trazer o decisor.";

export const PERGUNTAS_ABOBORA: Array<{
  campo: keyof AboboraCampos;
  titulo: string;
  ajuda?: string;
  tipo: "texto" | "simnao";
  /** Só aparece quando o lead respondeu que NÃO decide sozinho. */
  soQuandoNaoDecide?: boolean;
}> = [
  {
    campo: "abobora_posicao",
    titulo: "Qual a posição do lead na operação?",
    ajuda: "Ele é o dono, o cara que toma a decisão final? Ou é apenas um head que vai ouvir o projeto e depois passar para o CEO da operação?",
    tipo: "texto",
  },
  {
    campo: "abobora_segmento",
    titulo: "1. Qual segmento e nicho é a operação?",
    tipo: "texto",
  },
  {
    campo: "abobora_decide",
    titulo: "2. Ele consegue tomar a decisão de sim ou não para assessoria em call, caso cheguemos num cenário onde a Champion consegue ajudar a operação?",
    tipo: "simnao",
  },
  {
    campo: "abobora_quem_decide",
    titulo: "3. Em caso de não, quem consegue tomar a decisão pode vir até a call com ele?",
    ajuda: AVISO_TRAZER_DECISOR,
    tipo: "texto",
    soQuandoNaoDecide: true,
  },
  {
    campo: "abobora_investimento",
    titulo: "4. Investimento em tráfego e faturamento",
    tipo: "texto",
  },
];

/** O que ainda falta. Lista vazia significa que a reunião pode ser registrada. */
export function faltasNoAbobora(a: AboboraCampos): string[] {
  const vazio = (v: string) => !String(v ?? "").trim();
  const faltas: string[] = [];
  if (vazio(a.abobora_posicao)) faltas.push("posição do lead na operação");
  if (vazio(a.abobora_segmento)) faltas.push("segmento e nicho da operação");
  if (a.abobora_decide !== "sim" && a.abobora_decide !== "nao") faltas.push("se ele decide na call");
  if (a.abobora_decide === "nao" && vazio(a.abobora_quem_decide)) faltas.push("quem decide e se vem à call");
  if (vazio(a.abobora_investimento)) faltas.push("investimento em tráfego e faturamento");
  return faltas;
}

export function aboboraCompleta(a: AboboraCampos): boolean {
  return faltasNoAbobora(a).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Onde a gravação da call vai parar no Drive
//
// A gravação já existia; o que não existia era um lugar previsível para ela. O
// balde sai do que a reunião tem de mais forte para explicar o resultado: o
// criativo que trouxe o lead, senão a campanha, senão o funil. É por criativo
// porque a pergunta que se quer responder olhando dez calls é "o que o anúncio
// prometeu para essa pessoa chegar assim na call".
// ─────────────────────────────────────────────────────────────────────────────

export interface DadosDoBalde {
  origem?: string | null;
  creative_key?: string | null;
  utm_content?: string | null;
  utm_campaign?: string | null;
  headline_path?: string | null;
}

export function baldeDaGravacao(m: DadosDoBalde): { bucket: string; label: string } {
  const origem = (m.origem || "midia_paga") as Origem;
  if (origem === "indicacao") return { bucket: "funil/indicacao", label: "Indicação" };
  if (origem === "social_selling") return { bucket: "funil/social-selling", label: "Social selling" };

  const criativo = (m.creative_key || m.utm_content || "").trim();
  if (criativo) {
    return { bucket: `criativo/${slug(criativo)}`, label: `Criativo · ${criativo}` };
  }
  const campanha = (m.utm_campaign || "").trim();
  if (campanha) {
    return { bucket: `campanha/${slug(campanha)}`, label: `Campanha · ${campanha}` };
  }
  const pagina = (m.headline_path || "").trim();
  if (pagina) {
    return { bucket: `pagina/${slug(pagina)}`, label: `Página · ${pagina}` };
  }
  return { bucket: "sem-criativo", label: "Sem criativo identificado" };
}

function slug(v: string): string {
  return v
    .normalize("NFD")
    // \p{Diacritic} em vez de uma faixa de caracteres combinantes escrita à
    // mão: a faixa literal depende de o arquivo atravessar intacto todo editor
    // e pipeline do caminho, e quando ela se corrompe o slug silenciosamente
    // para de casar com o que já foi gravado.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
