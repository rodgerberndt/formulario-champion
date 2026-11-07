/**
 * O faturamento declarado, do número à faixa.
 *
 * Até 03/09/2026 o quiz perguntava a faixa e o lead escolhia numa lista. Isso
 * tem dois problemas conhecidos. O primeiro é que a lista ensina a resposta:
 * quem está em R$ 9 mil vê "De R$ 10 mil a R$ 20 mil" logo abaixo e arredonda
 * para cima, e a régua de MQL da casa é exatamente R$ 10 mil. O segundo é que a
 * faixa esconde a distribuição — "de 10 a 20 mil" é o maior balde da base e não
 * dá para saber se ele é povoado por gente de 10 ou de 19.
 *
 * Agora o lead digita o número. A faixa continua existindo, DERIVADA daqui:
 * ela é a régua de MQL, o eixo de todo relatório e a chave de dois anos de
 * histórico. Trocar a faixa por número quebraria a comparação com tudo que veio
 * antes; derivá-la mantém as duas leituras vivas ao mesmo tempo.
 *
 * A régua de corte de cada faixa tem que ser IDÊNTICA aos rótulos de
 * INVESTIMENTO_OPTIONS em leadScore.ts. Um rótulo que não exista lá vira um
 * balde órfão que não pontua e não entra em nenhum relatório.
 */

import { INVESTIMENTO_OPTIONS } from "./leadScore";

/**
 * Piso de cada faixa, em reais. O lead cai na última faixa cujo piso ele
 * alcança — quem declara R$ 10.000 é MQL, quem declara R$ 9.999 não é.
 */
const PISOS: Array<{ min: number; faixa: string }> = [
  { min: 10_000_000, faixa: "Acima de R$ 10 milhões" },
  { min: 5_000_000, faixa: "De R$ 5 milhões a R$ 10 milhões" },
  { min: 3_000_000, faixa: "De R$ 3 milhões a R$ 5 milhões" },
  { min: 2_000_000, faixa: "De R$ 2 milhões a R$ 3 milhões" },
  { min: 1_000_000, faixa: "De R$ 1 milhão a R$ 2 milhões" },
  { min: 750_000, faixa: "De R$ 750 mil a R$ 1 milhão" },
  { min: 500_000, faixa: "De R$ 500 mil a R$ 750 mil" },
  { min: 300_000, faixa: "De R$ 300 mil a R$ 500 mil" },
  { min: 200_000, faixa: "De R$ 200 mil a R$ 300 mil" },
  { min: 150_000, faixa: "De R$ 150 mil a R$ 200 mil" },
  { min: 100_000, faixa: "De R$ 100 mil a R$ 150 mil" },
  { min: 75_000, faixa: "De R$ 75 mil a R$ 100 mil" },
  { min: 50_000, faixa: "De R$ 50 mil a R$ 75 mil" },
  { min: 30_000, faixa: "De R$ 30 mil a R$ 50 mil" },
  { min: 20_000, faixa: "De R$ 20 mil a R$ 30 mil" },
  { min: 10_000, faixa: "De R$ 10 mil a R$ 20 mil" },
  { min: 5_000, faixa: "De R$ 5 mil a R$ 10 mil" },
  { min: 1, faixa: "Até R$ 5 mil" },
  { min: 0, faixa: "Não vendo ainda (R$0/mês)" },
];

/** A faixa histórica correspondente a um valor em reais. */
export function faixaDoFaturamento(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !isFinite(valor) || valor < 0) return "";
  const achado = PISOS.find((p) => valor >= p.min);
  return achado ? achado.faixa : "Não vendo ainda (R$0/mês)";
}

/**
 * Só dígitos: o campo é digitado com máscara de moeda e o que chega da tela
 * tem ponto, vírgula e "R$" no meio. Interpretar isso com parseFloat devolve
 * 1 para "1.500" (o ponto vira decimal), e um lead de R$ 1.500 vira um lead de
 * R$ 1 — o erro cai justamente em cima da régua de MQL.
 */
export function digitosParaValor(texto: string): number | null {
  const digitos = (texto || "").replace(/\D/g, "");
  if (!digitos) return null;
  const n = parseInt(digitos, 10);
  return isFinite(n) ? n : null;
}

/** "1500" → "R$ 1.500". Sem centavos: ninguém declara faturamento com centavos. */
export function formatarReais(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !isFinite(valor)) return "";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/**
 * O valor é plausível como faturamento mensal declarado?
 *
 * Existe porque a digitação livre erra de ordem de grandeza dos dois lados:
 * quem quer dizer "50 mil" digita 50, e quem se atrapalha com a máscara digita
 * 5000000000. Nenhum dos dois é rejeitado — os dois recebem uma pergunta de
 * conferência, porque recusar a resposta de um lead real é pior do que
 * registrar um número estranho.
 */
export function faturamentoSuspeito(valor: number | null): "baixo_demais" | "alto_demais" | null {
  if (valor === null) return null;
  // Abaixo de mil quase sempre é a unidade errada ("digitei 50 querendo 50 mil").
  // Zero é resposta legítima e não entra aqui: quem não vende ainda tem 0.
  if (valor > 0 && valor < 1_000) return "baixo_demais";
  if (valor > 100_000_000) return "alto_demais";
  return null;
}

/** A ordem canônica das faixas, para gráficos e rankings. */
export const FAIXAS_EM_ORDEM = INVESTIMENTO_OPTIONS;
