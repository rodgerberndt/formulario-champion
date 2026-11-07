// Faturamento DIGITADO no direct ("20k/mês", "300k", "uns 50 mil", "1,5 mi") vira a faixa do quiz.
//
// Até 03/11/2026 o Champion Direct gravava o texto cru em leads.faturamento_faixa, coluna que nenhuma tela
// lê: a lista, o tier e a nota usam investimento_faixa. Os dois leads do IMPOSTO chegaram com 20k e 300k
// e apareceram "Desq." e nota 0 (pedido do Rodger, 03/11/2026).
//
// Pisos e tiers são CÓPIA de src/lib/faturamento.ts e src/lib/leadScoring.ts: rótulo diferente vira balde
// órfão que não pontua e não entra em relatório.

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

const TIER: Array<{ min: number; tier: string }> = [
  { min: 1_000_000, tier: "Enterprise+" },
  { min: 100_000, tier: "Enterprise" },
  { min: 30_000, tier: "Large" },
  { min: 5_000, tier: "Medium" },
  { min: 1, tier: "Small" },
  { min: 0, tier: "Desqualificado" },
];

// "1.500.000" é milhar; "1,5" e "1.5" são decimal.
function numero(s: string): number {
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

/** Reais por mês, ou null quando o texto não traz número. */
export function valorDoFaturamento(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").toLowerCase().replace(/r\$/g, " ");
  if (/n[aã]o\s+(vendo|faturo|fatura|tenho)|\bnada\b|\bzero\b/.test(t)) return 0;
  const m = t.match(/\d+(?:[.,]\d+)*/);
  if (!m) return null;
  let v = numero(m[0]);
  if (!isFinite(v)) return null;
  // a unidade vale para o intervalo inteiro: "30 a 40 mil" = 30 mil
  if (/\d\s*kk|milh|\d\s*mi\b|\bmi\b/.test(t)) v *= 1_000_000;
  else if (/\d\s*k\b|\d\s*k\/|\bk\b|\bmil\b/.test(t)) v *= 1_000;
  // sem unidade e abaixo de mil, no direct, é sempre "mil" ("faturo 50")
  else if (v > 0 && v < 1_000) v *= 1_000;
  if (/\bano\b|anual|por ano|\/ano|\ba\.a\b/.test(t)) v = v / 12;
  return Math.round(v);
}

export function faixaDoValor(valor: number): string {
  return (PISOS.find((p) => valor >= p.min) ?? PISOS[PISOS.length - 1]).faixa;
}

export function tierDoValor(valor: number): string {
  return (TIER.find((p) => valor >= p.min) ?? TIER[TIER.length - 1]).tier;
}
