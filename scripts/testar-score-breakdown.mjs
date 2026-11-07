/**
 * Prova que um lead sai do quiz com a NOTA e com o DETALHE dela.
 *
 * Contexto: as colunas `score_breakdown`, `score_version` e
 * `score_calculated_at` existem desde a migration 20260826120000, mas nunca
 * foram preenchidas ao vivo. O que havia era um recálculo em massa rodado uma
 * única vez em 28/08/2026 21:06, que cobriu os 2.168 leads existentes até ali.
 * Todo lead nascido depois ficou sem detalhe — 78 deles no período que a
 * autópsia da CA03-BMsss precisou analisar.
 *
 * Este teste tem duas metades:
 *   1. A FÓRMULA — que o breakdown é completo e que a soma dele reconstrói a
 *      nota, incluindo os dois casos em que a nota NÃO é a soma (penalidade e
 *      teto de 20).
 *   2. O INSERT — que o Quiz realmente manda os três campos para o banco, e
 *      que a rede de segurança do insert sabe removê-los se a coluna faltar.
 *
 * Tudo com fixture. Nenhum lead de produção é criado ou lido.
 *
 * Rode com:  node scripts/testar-score-breakdown.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// leadScore.ts é TypeScript puro, sem dependência de runtime: dá para importar
// compilando na memória, sem subir build nenhum. Desde 17/09/2026 ele importa
// `./hql` (o corte de HQL por versão), então o modo é BUNDLE e não transform:
// um import relativo não resolve de dentro de uma data: URL.
const compilado = await build({
  entryPoints: [path.join(RAIZ, "src/lib/leadScore.ts")],
  bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
});
const js = compilado.outputFiles[0].text;
const modulo = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { calcularNota, SCORE_VERSION } = modulo;

let passou = 0, falhou = 0;
const falhas = [];
function checar(nome, ok, detalhe = "") {
  if (ok) passou++; else { falhou++; falhas.push(`${nome}${detalhe ? " — " + detalhe : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? "  · " + detalhe : ""}`);
}

const COMPONENTES = ["faturamento", "mercado", "dor_desejo", "compromisso_whatsapp", "aceita_call", "entendimento_site"];
const soma = (b) => Object.values(b).reduce((s, v) => s + v, 0);

// ── Fixtures. Nenhuma vem de lead real.
const FIXTURES = {
  alto: {
    investimento_faixa: "De R$ 100 mil a R$ 150 mil",
    mercado: "Dropshipping",
    dor_desejo: "Delegar para ganhar mais tempo",
    nps_score: 10,
    quer_vender_mais: "sim",
    compromisso_whatsapp: "sim",
    aceita_call_diagnostico: "sim",
  },
  medio: {
    investimento_faixa: "De R$ 10 mil a R$ 20 mil",
    mercado: "Infoproduto",
    dor_desejo: "Criativos que não vendem",
    nps_score: 7,
    quer_vender_mais: "sim",
    compromisso_whatsapp: "sim",
    aceita_call_diagnostico: "não",
  },
  naoQuerVender: {
    investimento_faixa: "De R$ 100 mil a R$ 150 mil",
    mercado: "Dropshipping",
    dor_desejo: "Delegar para ganhar mais tempo",
    nps_score: 10,
    quer_vender_mais: "não",
    compromisso_whatsapp: "sim",
    aceita_call_diagnostico: "sim",
  },
  naoVendeAinda: {
    investimento_faixa: "Não vendo ainda (R$0/mês)",
    mercado: "Dropshipping",
    dor_desejo: "Delegar para ganhar mais tempo",
    nps_score: 10,
    quer_vender_mais: "sim",
    compromisso_whatsapp: "sim",
    aceita_call_diagnostico: "sim",
  },
  vazio: {},
};

console.log("\n═══ 1. O BREAKDOWN É COMPLETO ═══\n");
for (const [nome, entrada] of Object.entries(FIXTURES)) {
  const r = calcularNota(entrada);
  const b = r.breakdown;
  checar(`${nome}: breakdown existe`, !!b && typeof b === "object");
  const faltando = COMPONENTES.filter((c) => typeof b?.[c] !== "number");
  checar(`${nome}: os 6 componentes vieram`, faltando.length === 0, faltando.length ? "faltou " + faltando.join(", ") : `soma ${soma(b)}`);
  const negativos = COMPONENTES.filter((c) => b?.[c] < 0);
  checar(`${nome}: nenhum componente negativo`, negativos.length === 0, negativos.join(", "));
  const extras = Object.keys(b ?? {}).filter((k) => !COMPONENTES.includes(k));
  checar(`${nome}: sem componente desconhecido`, extras.length === 0, extras.join(", "));
}

console.log("\n═══ 2. A SOMA RECONSTRÓI A NOTA ═══\n");
{
  for (const nome of ["alto", "medio", "vazio"]) {
    const r = calcularNota(FIXTURES[nome]);
    checar(`${nome}: score == round(soma dos componentes)`, r.score === Math.max(0, Math.min(100, Math.round(soma(r.breakdown)))), `score ${r.score} · soma ${soma(r.breakdown)}`);
  }
}

console.log("\n═══ 3. OS DOIS CASOS EM QUE A NOTA NÃO É A SOMA ═══");
console.log("Se um deles deixar de valer, o teste acusa em vez de o painel mentir.\n");
{
  const base = calcularNota(FIXTURES.alto);
  const punido = calcularNota(FIXTURES.naoQuerVender);
  checar("'não quer vender' desconta, não zera", punido.score > 0 && punido.score < base.score, `${base.score} → ${punido.score}`);
  checar("o breakdown NÃO muda com a penalidade", soma(punido.breakdown) === soma(base.breakdown), `soma ${soma(base.breakdown)} nos dois`);
  checar("a penalidade aparece nas flags", punido.flags.some((f) => /NÃO quer vender/i.test(f)), punido.flags.join(" | "));

  const teto = calcularNota(FIXTURES.naoVendeAinda);
  checar("'não vendo ainda' tem teto de 20", teto.score === 20, `score ${teto.score} · soma ${soma(teto.breakdown)}`);
  checar("o teto também não altera o breakdown", soma(teto.breakdown) > 20, `soma ${soma(teto.breakdown)} > score ${teto.score}`);
  checar("o teto aparece nas flags", teto.flags.some((f) => /Sprint/i.test(f)), teto.flags.join(" | "));
}

console.log("\n═══ 4. VERSÃO ═══\n");
{
  const r = calcularNota(FIXTURES.alto);
  checar("calcularNota devolve a versão", typeof r.version === "string" && r.version.length > 0, r.version);
  checar("a versão é a constante exportada", r.version === SCORE_VERSION, `${r.version} === ${SCORE_VERSION}`);
  checar("a versão tem formato vX.Y", /^v\d+\.\d+$/.test(r.version), r.version);
}

console.log("\n═══ 5. O QUIZ PERSISTE O QUE CALCULOU ═══");
console.log("Leitura estática do insert: é aqui que a lacuna vivia.\n");
{
  const quiz = fs.readFileSync(path.join(RAIZ, "src/pages/Quiz.tsx"), "utf8");
  const bloco = quiz.slice(quiz.indexOf("const dbData"), quiz.indexOf("const leadId"));
  checar("o insert manda score_breakdown", /score_breakdown:\s*scoreResult\.breakdown/.test(bloco));
  checar("o insert manda score_version", /score_version:\s*scoreResult\.version/.test(bloco));
  checar("o insert manda score_calculated_at", /score_calculated_at:/.test(bloco));
  checar("continua mandando o total", /score:\s*scoreResult\.score/.test(bloco));

  // A rede de segurança: se a coluna não existir no banco, o lead não pode
  // se perder junto com a telemetria.
  const fallback = quiz.slice(quiz.indexOf("const leadId"), quiz.indexOf("if (error) throw error"));
  for (const campo of ["score_breakdown", "score_version", "score_calculated_at"]) {
    checar(`o fallback sabe remover ${campo}`, new RegExp(`${campo}:\\s*_`).test(fallback));
  }
  checar("o fallback continua removendo as colunas de navegação", /fbc:\s*_/.test(fallback) && /session_id:\s*_/.test(fallback));
}

console.log("\n═══ 6. NADA DA FÓRMULA FOI TOCADO ═══");
console.log("Âncoras que provam que a correção foi só de persistência.\n");
{
  const fonte = fs.readFileSync(path.join(RAIZ, "src/lib/leadScore.ts"), "utf8");
  // Conferido pelo VALOR exportado, não pelo texto: desde 17/09/2026 a
  // constante vem de `hql.ts` (SCORE_VERSION = SCORE_VERSION_QUIZ), porque o
  // formulário curto tem versão própria. O que não pode mudar é o valor.
  checar("SCORE_VERSION continua v2.3", SCORE_VERSION === "v2.3", String(SCORE_VERSION));
  checar("o formulário curto tem versão própria", modulo.SCORE_VERSION_FORM === "v3-form", String(modulo.SCORE_VERSION_FORM));
  checar("a fórmula do quiz não foi tocada pelo v3-form", /let total = Object\.values\(breakdown\)\.reduce/.test(fonte));
  checar("os 6 componentes do breakdown continuam os mesmos", COMPONENTES.every((c) => new RegExp(`${c}:`).test(fonte)));
  const quiz = fs.readFileSync(path.join(RAIZ, "src/pages/Quiz.tsx"), "utf8");
  checar("o quiz não redefine pesos", !/PONTOS_|PESO_/.test(quiz.slice(quiz.indexOf("const scoreResult"), quiz.indexOf("const leadId"))));
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
