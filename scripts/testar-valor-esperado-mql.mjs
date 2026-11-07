// Testa valorEsperadoMql() sobre TODAS as faixas MQL existentes.
//
// O bug de 12/09/2026: a escala era decidida uma vez para a frase inteira e
// aplicada à média dos números crus. "De R$ 750 mil a R$ 1 milhão" virava
// (750 + 1) / 2 × 1.000.000 × 3% = R$ 11.265.000 em vez de R$ 26.250.
//
// Os valores esperados abaixo foram calculados À MÃO, faixa a faixa, e não pela
// função: um teste que compara a função com ela mesma não prova nada.
//
// Uso: node scripts/testar-valor-esperado-mql.mjs [caminho/do/meta.ts]
// Sem argumento testa o arquivo do repositório. Passar a versão antiga serve de
// controle: ela TEM que reprovar.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALVO = process.argv[2] ? path.resolve(process.argv[2]) : path.join(RAIZ, "supabase/functions/_shared/meta.ts");
const esbuild = createRequire(path.join(RAIZ, "package.json"))("esbuild");

// O módulo lê Deno.env no topo. Fora do Deno isso não existe.
globalThis.Deno = { env: { get: () => undefined } };

const fonte = fs.readFileSync(ALVO, "utf8");
const { code } = esbuild.transformSync(fonte, { loader: "ts", format: "esm", target: "es2022" });
const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

// A taxa de referência é 3% e o teste existe para garantir que continua.
const T = 0.03;
const ESPERADO = [
  ["De R$ 10 mil a R$ 20 mil", (10_000 + 20_000) / 2 * T],
  ["De R$ 20 mil a R$ 30 mil", (20_000 + 30_000) / 2 * T],
  ["De R$ 30 mil a R$ 50 mil", (30_000 + 50_000) / 2 * T],
  ["De R$ 50 mil a R$ 75 mil", (50_000 + 75_000) / 2 * T],
  ["De R$ 75 mil a R$ 100 mil", (75_000 + 100_000) / 2 * T],
  ["De R$ 100 mil a R$ 150 mil", (100_000 + 150_000) / 2 * T],
  ["De R$ 150 mil a R$ 200 mil", (150_000 + 200_000) / 2 * T],
  ["De R$ 200 mil a R$ 300 mil", (200_000 + 300_000) / 2 * T],
  ["De R$ 300 mil a R$ 500 mil", (300_000 + 500_000) / 2 * T],
  ["De R$ 500 mil a R$ 750 mil", (500_000 + 750_000) / 2 * T],
  ["De R$ 750 mil a R$ 1 milhão", (750_000 + 1_000_000) / 2 * T], // a faixa do bug: 26.250
  ["De R$ 1 milhão a R$ 2 milhões", (1_000_000 + 2_000_000) / 2 * T],
  ["De R$ 2 milhões a R$ 3 milhões", (2_000_000 + 3_000_000) / 2 * T],
  ["De R$ 3 milhões a R$ 5 milhões", (3_000_000 + 5_000_000) / 2 * T],
  ["De R$ 5 milhões a R$ 10 milhões", (5_000_000 + 10_000_000) / 2 * T],
  ["Acima de R$ 10 milhões", 10_000_000 * T],
  ["De R$ 50 mil a R$ 100 mil", (50_000 + 100_000) / 2 * T],
  ["Mais de R$ 100 mil", 100_000 * T],
  ["R$ 20k – 50k", (20_000 + 50_000) / 2 * T],
  ["R$ 50k – 100k", (50_000 + 100_000) / 2 * T],
];

let falhas = 0;
const ok = (cond, rotulo, detalhe = "") => {
  if (!cond) falhas++;
  console.log(`${cond ? "OK   " : "FALHA"}  ${rotulo}${detalhe ? "  ->  " + detalhe : ""}`);
};

// 1. A lista acima é EXATAMENTE a lista de faixas MQL do código, nem mais nem menos.
const bloco = fonte.match(/MQL_FAIXAS\s*=\s*\[([\s\S]*?)\];/);
const doCodigo = bloco ? [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
ok(doCodigo.length === 20, "o código tem 20 faixas MQL", String(doCodigo.length));
ok(JSON.stringify([...doCodigo].sort()) === JSON.stringify(ESPERADO.map((e) => e[0]).sort()),
  "as 20 do teste são as 20 do código");

// 2. Cada faixa, contra o valor calculado à mão.
console.log("");
let certas = 0;
for (const [faixa, esperado] of ESPERADO) {
  const obtido = mod.valorEsperadoMql(faixa);
  const bate = obtido === Math.round(esperado);
  if (bate) certas++;
  ok(bate, faixa.padEnd(32), `obtido ${obtido}  esperado ${Math.round(esperado)}`);
}
console.log(`\n${certas}/20 faixas com valor correto`);
ok(certas === 20, "20/20 faixas corretas");

// 3. O que NÃO pode mudar.
console.log("");
ok(mod.valorEsperadoMql("De R$ 750 mil a R$ 1 milhão") === 26_250, "a faixa do bug vale R$ 26.250");
ok(mod.valorEsperadoMql("De R$ 750 mil a R$ 1 milhão") !== 11_265_000, "e não mais R$ 11.265.000");
ok(mod.valorEsperadoMql("Até R$ 5 mil") === undefined, "faixa de Sprint continua sem valor");
ok(mod.valorEsperadoMql("De R$ 5 mil a R$ 10 mil") === undefined, "R$ 5-10 mil continua sem valor");
ok(mod.valorEsperadoMql("Não vendo ainda (R$0/mês)") === undefined, "'Não vendo ainda' continua sem valor");
ok(mod.valorEsperadoMql(null) === undefined && mod.valorEsperadoMql("") === undefined, "vazio continua sem valor");
ok(mod.isMqlFaixa("De R$ 10 mil a R$ 20 mil") === true && mod.isMqlFaixa("Até R$ 5 mil") === false, "a regra de MQL não mudou");
ok(mod.valorEsperadoMql("Acima de R$ 10 milhÃµes") === 300_000, "encoding quebrado 'milhÃµes' continua valendo R$ 300.000");

console.log(`\n${falhas === 0 ? "TUDO CERTO" : falhas + " FALHA(S)"}  (${path.relative(RAIZ, ALVO) || ALVO})`);
process.exit(falhas ? 1 : 0);
