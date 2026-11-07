// ─────────────────────────────────────────────────────────────────────────────
// O corte de LEAD BOM (HighQualityLead), POR VERSÃO DE SCORE.
//
// FONTE DA VERDADE. Este arquivo é espelhado em
// `supabase/functions/_shared/hql.ts` (edge function não importa de src/).
// Mudou aqui, copie lá — o painel, o front e o evento enviado à Meta precisam
// contar a MESMA coisa, que é exatamente o que quebrou quando existiam três
// contas de score diferentes.
//
// ── Por que o corte deixou de ser um número só ───────────────────────────────
// Em 17/09/2026 a landing trocou o quiz de 14 passos por um formulário de seis
// campos (nome, e-mail, telefone, Instagram, mercado, faixa de faturamento).
//
// O score v2.3 soma faturamento 30 + mercado 25 + dor 15 + compromisso 13 +
// aceita_call 12 + NPS 5 = 100. O formulário só pergunta DUAS dessas coisas.
// Rodando a fórmula antiga nele, o teto de um lead perfeito virava 70 — 55 do
// que ele respondeu, mais 13 de "compromisso presumido" e 2 de "NPS ausente",
// pontos que ninguém ganhou por mérito. Com teto 70, o corte de 73 ficou
// IMPOSSÍVEL: nenhum lead do formulário seria HQL, o evento HighQualityLead
// pararia de sair sem erro nenhum no log, e o painel mostraria zero HQL para
// sempre.
//
// A decisão do dono (17/09/2026): o lead do formulário tem score PRÓPRIO
// (`v3-form`) — só faturamento + mercado, renormalizado de 0 a 100 —, e o
// corte dele é 67. O lead do quiz continua em `v2.3` com corte 73, e o quiz
// continua no ar.
//
// ── A armadilha ──────────────────────────────────────────────────────────────
// 67 e 73 NÃO são réguas comparáveis. Um 70 de formulário e um 70 de quiz
// medem coisas diferentes: o primeiro é "38,5 dos 55 pontos que ele podia
// fazer", o segundo é "70 dos 100". Score sem versão ao lado não decide nada —
// por isso todo lugar que corta por HQL chama `ehHighQualityLead(score,
// score_version)` e nunca compara com um literal.
// ─────────────────────────────────────────────────────────────────────────────

/** Score do quiz de 14 passos (e de todo o histórico anterior a ele). */
export const SCORE_VERSION_QUIZ = "v2.3";

/** Score do formulário curto da landing, a partir de 17/09/2026. */
export const SCORE_VERSION_FORM = "v3-form";

/** Corte do quiz — e o padrão de quem não tem versão gravada. */
export const LIMIAR_HQL_QUIZ = 73;

/** Corte do formulário curto: (faturamento + mercado) / 55 × 100 ≥ 67. */
export const LIMIAR_HQL_FORM = 67;

/** Mapa versão → corte, para o painel mostrar sem repetir número solto. */
export const LIMIARES_HQL: Record<string, number> = {
  [SCORE_VERSION_QUIZ]: LIMIAR_HQL_QUIZ,
  [SCORE_VERSION_FORM]: LIMIAR_HQL_FORM,
};

/**
 * O score veio do formulário curto?
 *
 * Tolerante de propósito: a coluna `score_version` é texto livre e já recebeu
 * valor com espaço e com caixa trocada.
 */
export function ehScoreDeFormulario(scoreVersion?: string | null): boolean {
  return typeof scoreVersion === "string"
    && scoreVersion.trim().toLowerCase() === SCORE_VERSION_FORM;
}

/**
 * O corte de HQL da versão do score.
 *
 * Versão nula, vazia ou desconhecida cai em 73: é o histórico inteiro do banco
 * (leads anteriores a 25/08/2026 não têm `score_version`), e errar para o lado
 * do corte mais alto não inventa HQL que nunca existiu.
 */
export function limiarHql(scoreVersion?: string | null): number {
  return ehScoreDeFormulario(scoreVersion) ? LIMIAR_HQL_FORM : LIMIAR_HQL_QUIZ;
}

/**
 * A ÚNICA pergunta "este lead é HQL?" do sistema.
 *
 * Score não numérico (nulo, ausente, texto) nunca é HQL — é lead sem nota
 * gravada, e contar como bom seria inventar.
 */
export function ehHighQualityLead(
  score: number | null | undefined,
  scoreVersion?: string | null,
): boolean {
  return typeof score === "number"
    && Number.isFinite(score)
    && score >= limiarHql(scoreVersion);
}
