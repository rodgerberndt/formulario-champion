// ─────────────────────────────────────────────────────────────────────────────
// CÓPIA de `src/lib/hql.ts`, byte a byte fora deste cabeçalho (edge function
// não importa de src/). A fonte da verdade é o arquivo do front: mudou lá,
// copie aqui. Quem importa daqui: fire-capi-events, admin-data/index.ts,
// admin-data/contas_desempenho.ts e admin-data/leadScore.ts.
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
