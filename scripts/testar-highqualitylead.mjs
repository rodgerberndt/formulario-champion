/**
 * HighQualityLead — evento OBSERVACIONAL, score acima do corte DA VERSÃO do
 * score do lead: 73 no quiz (v2.3, e em todo lead histórico sem versao gravada)
 * e 67 no formulário curto (v3-form, 17/09/2026).
 *
 * O que este teste prova, e como:
 *
 *   1. A CONDIÇÃO é testada contra os limiares LIDOS DO PRÓPRIO MÓDULO
 *      (supabase/functions/_shared/hql.ts). Se alguém mudar 73 ou 67 no código,
 *      o teste lê o novo valor e as asserções de fronteira acusam a mudança.
 *   2. O DEDUPE é testado contra a CONSTRAINT REAL do Postgres, dentro de uma
 *      transação que termina em ROLLBACK. Não é simulação: é o mesmo índice
 *      único que protege produção.
 *   3. A ORDEM e o ISOLAMENTO DE FALHA são lidos do código — que o envio do HQL
 *      vem depois de todos os outros, e que `enviar` não relança exceção.
 *
 * Nenhum lead de produção é criado, alterado ou lido. Nenhum evento é enviado
 * para a Meta.
 *
 * Rode com:  node scripts/testar-highqualitylead.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
function checar(nome, ok, detalhe = "") {
  if (ok) passou++; else { falhou++; falhas.push(`${nome}${detalhe ? " — " + detalhe : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? "  · " + detalhe : ""}`);
}

const fonte = fs.readFileSync(path.join(RAIZ, "supabase/functions/fire-capi-events/index.ts"), "utf8");

// A regra de verdade, importada do módulo único (espelho de src/lib/hql.ts).
const esbuild = createRequire(path.join(RAIZ, "package.json"))("esbuild");
const compilado = await esbuild.build({
  entryPoints: [path.join(RAIZ, "supabase/functions/_shared/hql.ts")],
  bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
});
const hql = await import("data:text/javascript;base64," + Buffer.from(compilado.outputFiles[0].text).toString("base64"));

console.log("\n═══ 1. O LIMIAR VEM DO CÓDIGO, NÃO DO TESTE ═══\n");
checar("o corte do quiz é 73", hql.LIMIAR_HQL_QUIZ === 73, String(hql.LIMIAR_HQL_QUIZ));
checar("o corte do formulário curto é 67", hql.LIMIAR_HQL_FORM === 67, String(hql.LIMIAR_HQL_FORM));
checar("lead sem versão gravada cai no corte do quiz", hql.limiarHql(null) === 73, "o histórico inteiro do banco");
checar("versão desconhecida cai no corte do quiz", hql.limiarHql("v9.9") === 73, "errar para o corte mais alto não inventa HQL");

// A função é IMPORTADA, não reescrita aqui: não existe segunda regra de HQL.
const disparaHQL = (score, versao) => hql.ehHighQualityLead(score, versao);
checar("o fire-capi-events usa `ehHighQualityLead`", /ehHighQualityLead\(scoreDoLead, versaoDoScore\)/.test(fonte));
checar("o fire-capi-events NÃO tem limiar escrito na mão", !/LIMIAR_HQL\s*=\s*\d+/.test(fonte));
checar("o fire-capi-events importa de ../_shared/hql.ts", /from "\.\.\/_shared\/hql\.ts"/.test(fonte));

console.log("\n═══ 2. A FRONTEIRA DO SCORE, NAS DUAS RÉGUAS ═══");
console.log("Os casos 73 e 67 são os que mais importam: `>` em vez de `>=` passaria despercebido em produção.\n");
const V_QUIZ = hql.SCORE_VERSION_QUIZ;
const V_FORM = hql.SCORE_VERSION_FORM;
for (const [score, versao, esperado, rot] of [
  [0, V_QUIZ, false, "quiz, score 0"],
  [40, V_QUIZ, false, "quiz, score 40"],
  [72, V_QUIZ, false, "quiz, score 72 — logo abaixo"],
  [73, V_QUIZ, true, "quiz, score 73 — a fronteira"],
  [74, V_QUIZ, true, "quiz, score 74 — logo acima"],
  [100, V_QUIZ, true, "quiz, score 100"],
  [72, null, false, "histórico sem versão, score 72"],
  [73, null, true, "histórico sem versão, score 73"],
  [66, V_FORM, false, "formulário, score 66 — logo abaixo"],
  [67, V_FORM, true, "formulário, score 67 — a fronteira"],
  [70, V_FORM, true, "formulário, score 70 — seria 0 HQL na régua velha"],
  [70, V_QUIZ, false, "quiz, score 70 — a MESMA nota, e não é HQL"],
]) {
  checar(`${rot}: ${esperado ? "dispara" : "NÃO dispara"}`, disparaHQL(score, versao) === esperado);
}
for (const [valor, rot] of [[null, "score nulo"], [undefined, "score ausente"], ["73", "score como texto"]]) {
  checar(`${rot}: NÃO dispara`, disparaHQL(valor, V_QUIZ) === false, "score não-numérico nunca vira HQL");
}

console.log("\n═══ 3. DEDUPE — CONTRA A CONSTRAINT REAL DO BANCO ═══");
console.log("Tudo dentro de BEGIN ... ROLLBACK: nada é gravado.\n");
{
  const idx = await sql(`SELECT indexdef FROM pg_indexes WHERE tablename = 'capi_event_claims' AND indexdef ILIKE '%UNIQUE%';`);
  const def = (idx.find((x) => x && x.indexdef) || {}).indexdef || "";
  checar("existe índice ÚNICO em capi_event_claims", /UNIQUE/i.test(def), def.slice(0, 90));
  checar("a chave é (event_id, event_name)", /\(event_id,\s*event_name\)/.test(def), "é o que garante 1 evento lógico por lead");

  const LEAD = "00000000-0000-4000-8000-00000000dead";
  const EV = `${LEAD}_HighQualityLead`;

  // Dois chamadores (front e trigger) tentando o MESMO evento lógico.
  let bloqueou = false, erro = "";
  try {
    await sql(`BEGIN;
      INSERT INTO public.capi_event_claims (event_id, event_name) VALUES ('${EV}', 'HighQualityLead');
      INSERT INTO public.capi_event_claims (event_id, event_name) VALUES ('${EV}', 'HighQualityLead');
    ROLLBACK;`);
  } catch (e) { erro = String(e.message); bloqueou = /duplicate key|23505/i.test(erro); }
  checar("o MESMO event_id duas vezes é recusado", bloqueou, bloqueou ? "23505 — front, trigger e reconciliation convergem num só" : erro.slice(0, 120));

  // O mesmo lead com OUTRO evento continua passando: o dedupe é por evento.
  let outroPassou = false;
  try {
    const r = await sql(`BEGIN;
      INSERT INTO public.capi_event_claims (event_id, event_name) VALUES ('${EV}', 'HighQualityLead');
      INSERT INTO public.capi_event_claims (event_id, event_name) VALUES ('${LEAD}_MQL', 'MQL');
      SELECT count(*)::int AS n FROM public.capi_event_claims WHERE event_id LIKE '${LEAD}%';
    ROLLBACK;`);
    const linha = r.find((x) => x && typeof x.n === "number");
    outroPassou = linha?.n === 2;
  } catch { outroPassou = false; }
  checar("HQL e MQL do mesmo lead coexistem", outroPassou, "o dedupe é por (lead, evento), não por lead");

  const sobrou = await sql(`SELECT count(*)::int AS n FROM public.capi_event_claims WHERE event_id LIKE '${LEAD}%';`);
  checar("nada de teste persistiu", (sobrou[0]?.n ?? sobrou.at(-1)?.n) === 0, "ROLLBACK confirmado");
}

console.log("\n═══ 4. ORDEM — O HQL NÃO PODE ALCANÇAR OS OUTROS ═══\n");
{
  const pos = (re) => fonte.search(re);
  const iCR = pos(/await enviar\("CompleteRegistration"\)/);
  const iLead = pos(/await enviar\("Lead"\)/);
  const iTier = pos(/await enviar\(tierEventName\)/);
  const iMql = pos(/await enviar\("MQL"/);
  const iSprint = pos(/await enviar\("Sprint"\)/);
  const iHql = pos(/await enviar\("HighQualityLead"\)/);
  checar("HighQualityLead existe no despachante", iHql > 0);
  checar("vem depois de CompleteRegistration", iHql > iCR, `${iCR} → ${iHql}`);
  checar("vem depois de Lead", iHql > iLead);
  checar("vem depois de Lead_<Tier>", iHql > iTier);
  checar("vem depois de MQL", iHql > iMql);
  checar("vem depois de Sprint", iHql > iSprint);
}

console.log("\n═══ 5. ISOLAMENTO DE FALHA ═══");
console.log("Se o HQL falhar, os outros já foram e ninguém relança exceção.\n");
{
  const corpoEnviar = fonte.slice(fonte.indexOf("const enviar = async"), fonte.indexOf('// 1. CompleteRegistration'));
  checar("`enviar` tem try/catch", /try\s*\{/.test(corpoEnviar) && /catch\s*\(/.test(corpoEnviar));
  checar("o catch NÃO relança", !/catch[\s\S]{0,200}throw/.test(corpoEnviar), "falha vira item em eventsFailed");
  checar("a falha é registrada em eventsFailed", /eventsFailed\.push/.test(corpoEnviar));
  checar("HTTP não-ok também entra em eventsFailed", /if \(res\.ok\)[\s\S]{0,80}else eventsFailed\.push/.test(corpoEnviar));

  // O bloco do HQL não pode ter nada que interrompa o fluxo.
  const blocoHql = fonte.slice(fonte.indexOf("const scoreDoLead"), fonte.indexOf("if (eventsToSend.length > 0)"));
  checar("o bloco do HQL não lança nem retorna", !/throw|return/.test(blocoHql));
  checar("o bloco do HQL não toca capiSent de outros eventos", !/capiSent\[/.test(blocoHql));
}

console.log("\n═══ 6. NENHUMA INFRAESTRUTURA PARALELA ═══\n");
{
  checar("usa o mesmo `enviar` dos demais", /await enviar\("HighQualityLead"\)/.test(fonte));
  checar("não cria tabela nova", !/create table/i.test(fonte));
  checar("não cria endpoint novo", (fonte.match(/Deno\.serve/g) || []).length === 1);
  checar("não define fórmula de score", !/pontos|PONTOS_|breakdown/i.test(fonte.slice(fonte.indexOf("const scoreDoLead"), fonte.indexOf("if (eventsToSend.length > 0)"))));
  checar("o event_id continua determinístico", /const eventId = sharedEventIds\[eventName\] \|\| `\$\{lead_db_id\}_\$\{eventName\}`/.test(fonte));

  // eventIdsForLead do front NÃO lista HighQualityLead — e não deve, porque o
  // evento é server-side. Se um dia o front precisar, o id precisa bater.
  const tracking = fs.readFileSync(path.join(RAIZ, "src/lib/metaTracking.ts"), "utf8");
  const frontLista = /HighQualityLead/.test(tracking);
  checar("o front NÃO dispara HQL (evento é server-side)", !frontLista, frontLista ? "front lista o evento — verificar duplicidade" : "só o servidor envia");
}

console.log("\n═══ 7. NADA MAIS FOI TOCADO ═══\n");
{
  checar("CompleteRegistration intacto", /await enviar\("CompleteRegistration"\);/.test(fonte));
  checar("Lead intacto", /await enviar\("Lead"\);/.test(fonte));
  checar("Lead_<Tier> intacto", /const tierEventName = `Lead_\$\{tier\.replace\("\+", "Plus"\)\}`/.test(fonte));
  checar("MQL mantém value/currency", /await enviar\("MQL", valor \? \{ value: valor, currency: "BRL" \} : \{\}\)/.test(fonte));
  checar("Sprint intacto", /await enviar\("Sprint"\);/.test(fonte));
  checar("o select do lead ganhou score e score_version, e nada mais", /select\("capi_events_sent, tier, investimento_faixa, page_url, score, score_version"\)/.test(fonte));
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
