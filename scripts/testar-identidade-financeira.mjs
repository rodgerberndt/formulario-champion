/**
 * Testes de IDENTIDADE FINANCEIRA — cross-account e multi-moeda.
 *
 * Todos rodam dentro de uma transação que termina em ROLLBACK: nada é gravado.
 *
 * Cada teste aqui FALHARIA na implementação anterior a 10/09/2026:
 *
 *   1. `ad_spend` não tinha UNIQUE nenhum além do `id`, e o sync apagava por
 *      `(date, ad_id)` sem a conta. Duas contas com o mesmo `ad_id` no mesmo
 *      dia se destruíam mutuamente.
 *   2. `ad_account_id` era nulo em 162 linhas e não tinha FK: gasto órfão era
 *      possível, e apagar uma conta não encontrava resistência.
 *   3. A agregação por `campaign_name` / `creative_key` somava contas
 *      diferentes numa linha só.
 *   4. `META_AD_ACCOUNT_CURRENCY` era global: a moeda de UMA conta valia para
 *      TODAS, multiplicando ou dividindo o gasto das demais por ~5.
 *
 * Rode com:  node scripts/testar-identidade-financeira.mjs
 */
import fs from "node:fs";

const PAT = fs.readFileSync(
  "C:/Users/Rodge/AppData/Local/Temp/claude/e--Obsidian-conhecimentos/d7f9263c-8419-4a59-8f2a-4a8519bb8404/scratchpad/.pat",
  "utf8",
).trim();
const REF = "qzzyfohzoxiefwbmtclt";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt.slice(0, 400));
  return JSON.parse(txt);
}

let passou = 0, falhou = 0;
const falhas = [];
function checar(nome, ok, detalhe) {
  if (ok) passou++; else { falhou++; falhas.push(`${nome}: ${detalhe}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? "  — " + detalhe : ""}`);
}

const A = "act_9990000000000001";   // conta fictícia em USD
const B = "act_9990000000000002";   // conta fictícia em BRL
const AD = "9998887776665554";      // MESMO ad_id nas duas contas, de propósito
const DIA = "2026-09-10";
const TAXA_USD = 5.0;

// ── Cenário: duas contas, MESMOS nomes de campanha e anúncio, moedas diferentes.
const CENARIO = `
  INSERT INTO public.meta_ad_accounts (ad_account_id, account_name, currency, currency_source, sync_enabled)
  VALUES ('${A}', 'Conta Teste A', 'USD', 'manual', false),
         ('${B}', 'Conta Teste B', 'BRL', 'manual', false);

  INSERT INTO public.ad_spend
    (date, ad_account_id, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
     creative_key, utm_content, spend_original, spend_currency, exchange_rate, spend, clicks, impressions)
  VALUES
    ('${DIA}', '${A}', '${AD}', 'Criativo X', 'ADSET_A', 'Conjunto Teste', 'CAMP_A', 'Teste',
     'criativo-x', 'Criativo X', 100, 'USD', ${TAXA_USD}, 500, 10, 1000),
    ('${DIA}', '${B}', '${AD}', 'Criativo X', 'ADSET_B', 'Conjunto Teste', 'CAMP_B', 'Teste',
     'criativo-x', 'Criativo X', 100, 'BRL', 1, 100, 20, 2000);
`;

async function comCenario(consulta) {
  const r = await sql(`BEGIN;
    ${CENARIO}
    ${consulta}
  ROLLBACK;`);
  return r;
}

console.log("\n═══ 1. MESMO ad_id EM DUAS CONTAS NO MESMO DIA ═══");
console.log("Na regra antiga, o DELETE por (date, ad_id) sem conta apagava a linha da outra.\n");
{
  const r = await comCenario(`
    SELECT count(*)::int AS linhas,
           count(DISTINCT ad_account_id)::int AS contas,
           round(sum(spend)::numeric, 2)::float8 AS soma_brl
      FROM public.ad_spend WHERE ad_id = '${AD}';`);
  const linha = r.at(-1) ?? r[0];
  checar("as duas linhas coexistem", linha.linhas === 2, `linhas=${linha.linhas}`);
  checar("de duas contas distintas", linha.contas === 2, `contas=${linha.contas}`);
  checar("soma correta em BRL", Math.abs(linha.soma_brl - 600) < 0.01, `R$ ${linha.soma_brl} (esperado 600 = 100 USD × 5 + 100 BRL)`);
}

console.log("\n═══ 2. UNIQUE (ad_account_id, date, ad_id) ═══");
{
  let bloqueou = false;
  try {
    await sql(`BEGIN;
      ${CENARIO}
      INSERT INTO public.ad_spend (date, ad_account_id, ad_id, spend, spend_original, spend_currency, exchange_rate)
      VALUES ('${DIA}', '${A}', '${AD}', 1, 1, 'USD', ${TAXA_USD});
    ROLLBACK;`);
  } catch (e) {
    bloqueou = /ad_spend_conta_data_ad_uniq|duplicate key/i.test(String(e.message));
  }
  checar("duplicata na MESMA conta é recusada", bloqueou, bloqueou ? "23505" : "o banco aceitou a duplicata");
}

console.log("\n═══ 3. AGRUPAMENTO POR NOME vs POR IDENTIDADE ═══");
console.log("Prova direta do defeito: mesmo nome, contas diferentes.\n");
{
  const r = await comCenario(`
    SELECT
      (SELECT count(*)::int FROM (SELECT 1 FROM public.ad_spend WHERE ad_id='${AD}' GROUP BY campaign_name) x)                         AS por_nome,
      (SELECT count(*)::int FROM (SELECT 1 FROM public.ad_spend WHERE ad_id='${AD}' GROUP BY ad_account_id, campaign_id) y)            AS por_identidade,
      (SELECT count(*)::int FROM (SELECT 1 FROM public.ad_spend WHERE ad_id='${AD}' GROUP BY creative_key) z)                          AS criativo_por_nome,
      (SELECT count(*)::int FROM (SELECT 1 FROM public.ad_spend WHERE ad_id='${AD}' GROUP BY ad_account_id, creative_key) w)           AS criativo_por_identidade;`);
  const l = r.at(-1) ?? r[0];
  checar("agrupar por campaign_name FUNDE (1 linha)", l.por_nome === 1, `${l.por_nome} grupo(s) — este é o defeito`);
  checar("agrupar por (conta, campaign_id) SEPARA", l.por_identidade === 2, `${l.por_identidade} grupos`);
  checar("agrupar por creative_key FUNDE (1 linha)", l.criativo_por_nome === 1, `${l.criativo_por_nome} grupo(s) — este é o defeito`);
  checar("agrupar por (conta, creative_key) SEPARA", l.criativo_por_identidade === 2, `${l.criativo_por_identidade} grupos`);
}

console.log("\n═══ 4. MOEDA POR CONTA — USD e BRL na mesma tabela ═══");
console.log("Na regra antiga, um único META_AD_ACCOUNT_CURRENCY valia para as duas.\n");
{
  const r = await comCenario(`
    SELECT ad_account_id, spend_currency, exchange_rate::float8 AS taxa,
           spend_original::float8 AS original, spend::float8 AS brl
      FROM public.ad_spend WHERE ad_id = '${AD}' ORDER BY ad_account_id;`);
  const linhas = Array.isArray(r) ? r.filter((x) => x && x.ad_account_id) : [];
  const usd = linhas.find((x) => x.ad_account_id === A);
  const brl = linhas.find((x) => x.ad_account_id === B);
  checar("conta A gravada em USD", usd?.spend_currency === "USD", `${usd?.spend_currency}`);
  checar("conta B gravada em BRL", brl?.spend_currency === "BRL", `${brl?.spend_currency}`);
  checar("A converteu pela taxa do dólar", Math.abs(usd.brl - usd.original * TAXA_USD) < 0.01, `${usd.original} × ${usd.taxa} = ${usd.brl}`);
  checar("B NÃO foi convertida (taxa 1)", brl.taxa === 1 && Math.abs(brl.brl - brl.original) < 0.01, `${brl.original} × ${brl.taxa} = ${brl.brl}`);
  // O erro que a regra global produziria: aplicar 5,0 também na conta BRL.
  const seFosseGlobal = usd.original * TAXA_USD + brl.original * TAXA_USD;
  const correto = usd.brl + brl.brl;
  checar("regra global daria número errado", Math.abs(seFosseGlobal - correto) > 0.01,
    `global=R$ ${seFosseGlobal.toFixed(2)} vs correto=R$ ${correto.toFixed(2)} (${((seFosseGlobal / correto - 1) * 100).toFixed(0)}% a mais)`);
}

console.log("\n═══ 5. GASTO ÓRFÃO E CONTA COM HISTÓRICO ═══");
{
  let recusouOrfao = false;
  try {
    await sql(`BEGIN;
      INSERT INTO public.ad_spend (date, ad_id, spend) VALUES ('${DIA}', 'ORFAO_TESTE', 1);
    ROLLBACK;`);
  } catch (e) { recusouOrfao = /null value in column "ad_account_id"|not-null/i.test(String(e.message)); }
  checar("gasto sem conta é recusado", recusouOrfao, recusouOrfao ? "23502 NOT NULL" : "o banco aceitou gasto órfão");

  let recusouConta = false;
  try {
    await sql(`BEGIN;
      ${CENARIO}
      DELETE FROM public.meta_ad_accounts WHERE ad_account_id = '${A}';
    ROLLBACK;`);
  } catch (e) { recusouConta = /violates foreign key|still referenced/i.test(String(e.message)); }
  checar("apagar conta COM gasto é recusado", recusouConta, recusouConta ? "23503 FK RESTRICT" : "a conta foi apagada");

  let recusouContaDesconhecida = false;
  try {
    await sql(`BEGIN;
      INSERT INTO public.ad_spend (date, ad_account_id, ad_id, spend) VALUES ('${DIA}', 'act_0000000000', 'X', 1);
    ROLLBACK;`);
  } catch (e) { recusouContaDesconhecida = /violates foreign key|is not present/i.test(String(e.message)); }
  checar("gasto de conta fora do cadastro é recusado", recusouContaDesconhecida, recusouContaDesconhecida ? "23503 FK" : "aceitou conta desconhecida");
}

console.log("\n═══ 6. NADA FICOU NA BASE ═══");
{
  const r = await sql(`
    SELECT (SELECT count(*)::int FROM public.meta_ad_accounts WHERE ad_account_id IN ('${A}','${B}','act_0000000000')) AS contas_teste,
           (SELECT count(*)::int FROM public.ad_spend WHERE ad_id IN ('${AD}','ORFAO_TESTE','X')) AS linhas_teste;`);
  const l = r.at(-1) ?? r[0];
  checar("nenhuma conta de teste persistiu", l.contas_teste === 0, `${l.contas_teste}`);
  checar("nenhuma linha de teste persistiu", l.linhas_teste === 0, `${l.linhas_teste}`);
}

console.log("\n" + "═".repeat(70));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
