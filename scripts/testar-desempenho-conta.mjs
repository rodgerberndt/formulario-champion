// Testa a visão "Desempenho por conta" com DADOS REAIS, somente leitura.
//
// Carrega as duas funções puras — a do backend (contas_desempenho.ts) e a da
// tela (src/lib/desempenhoConta.ts) — busca no banco exatamente o que a rota
// /contas-desempenho busca, e confere:
//   - nada se perde nem se duplica (gasto, leads, MQL, HQL, vendas, receita);
//   - cada nível soma exatamente os filhos (conta = Σ campanhas = Σ conjuntos = Σ anúncios);
//   - a conta de um lead é a conta em que o ad_spend registrou o anúncio;
//   - o mesmo nome de anúncio em contas diferentes continua separado por ID;
//   - seletores respeitam a hierarquia.
//
// Uso: node scripts/testar-desempenho-conta.mjs [AAAA-MM-DD início] [AAAA-MM-DD fim]
// Padrão: de 2026-09-12 até hoje (datas de Brasília).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = createRequire(path.join(RAIZ, "package.json"))("esbuild");

async function carregar(arquivo) {
  const r = esbuild.buildSync({
    entryPoints: [path.join(RAIZ, arquivo)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
}
const back = await carregar("supabase/functions/admin-data/contas_desempenho.ts");
const front = await carregar("src/lib/desempenhoConta.ts");

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(2);
}

/** Só GET. Paginado. */
async function ler(tabela, query) {
  const linhas = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${BASE}/rest/v1/${tabela}?${query}&limit=1000&offset=${offset}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${await r.text()}`);
    const d = await r.json();
    linhas.push(...d);
    if (d.length < 1000) return linhas;
  }
}
const lista = (ids) => `(${ids.map((x) => `"${x}"`).join(",")})`;

const hojeBR = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const de = process.argv[2] || "2026-09-12";
const ate = process.argv[3] || hojeBR;
const fromISO = `${de}T03:00:00.000Z`;
const fimDia = new Date(Date.parse(`${ate}T03:00:00.000Z`) + 24 * 3600 * 1000 - 1).toISOString();

const CAMPOS_ID = "ad_account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date";
const [gasto, leads, contas] = await Promise.all([
  ler("ad_spend", `select=${CAMPOS_ID},spend,impressions,clicks,landing_page_views,meta_leads&ad_id=not.is.null&date=gte.${de}&date=lte.${ate}&order=id`),
  ler("leads", `select=id,created_at,nome_completo,campaign_id,adset_id,ad_id,placement,score,score_version,investimento_faixa,sdr_override,faturamento_declarado&created_at=gte.${fromISO}&created_at=lte.${fimDia}&order=created_at,id`),
  ler("meta_ad_accounts", "select=ad_account_id,account_name,currency,sync_enabled&order=ad_account_id"),
]);

const comGasto = new Set(gasto.map((g) => g.ad_id));
const semIdentidade = [...new Set(leads.map((l) => l.ad_id).filter((id) => id && !comGasto.has(id)))];
const identidadesExtras = [];
for (let i = 0; i < semIdentidade.length; i += 100) {
  identidadesExtras.push(...(await ler("ad_spend", `select=${CAMPOS_ID}&ad_id=in.${lista(semIdentidade.slice(i, i + 100))}&order=date.desc,id`)));
}
const achados = new Set(identidadesExtras.map((x) => x.ad_id));
const aindaSem = semIdentidade.filter((id) => !achados.has(id));
for (let i = 0; i < aindaSem.length; i += 100) {
  identidadesExtras.push(...(await ler("meta_ads_cache", `select=ad_account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name&ad_id=in.${lista(aindaSem.slice(i, i + 100))}`)));
}
const idsLeads = leads.map((l) => l.id);
const reunioes = [];
const vendas = [];
for (let i = 0; i < idsLeads.length; i += 100) {
  const p = lista(idsLeads.slice(i, i + 100));
  reunioes.push(...(await ler("meetings", `select=lead_id,status,attended,scheduled_at,created_at&lead_id=in.${p}`)));
  vendas.push(...(await ler("manual_sales", `select=lead_id,revenue,refunded_at&lead_id=in.${p}`)));
}

const saida = back.montarDesempenho({ gasto, identidadesExtras, leads, reunioes, vendas, contas });

let falhas = 0;
const ok = (cond, rotulo, detalhe = "") => {
  if (!cond) falhas++;
  console.log(`${cond ? "OK   " : "FALHA"}  ${rotulo}${detalhe ? "  ->  " + detalhe : ""}`);
};
const centavos = (v) => Math.round(v * 100);

console.log(`janela ${de} .. ${ate} (Brasília) | ad_spend ${gasto.length} linhas | leads ${leads.length} | reuniões ${reunioes.length} | vendas ${vendas.length}\n`);

// 1. Nada se perde nem se duplica.
const spendBruto = gasto.reduce((s, g) => s + Number(g.spend || 0), 0);
const spendSaida = saida.anuncios.reduce((s, a) => s + a.spend, 0);
ok(Math.abs(centavos(spendBruto) - centavos(spendSaida)) <= saida.anuncios.length, "gasto total preservado", `bruto ${spendBruto.toFixed(2)} saída ${spendSaida.toFixed(2)}`);
// MACRO LITERAL NÃO É ID (18/09/2026): `ad_id = "{{ad.id}}"` é clique em
// prévia de anúncio dentro do Gerenciador. O lead do Vic (16/09, score 89)
// entrava na hierarquia como "conta não identificada" com 1 HQL.
const ehMacro = (v) => typeof v === "string" && (v.includes("{{") || v.includes("}}"));
const comAd = leads.filter((l) => l.ad_id && !ehMacro(l.ad_id));
const comMacro = leads.filter((l) => ehMacro(l.ad_id));
ok(saida.leads.length === comAd.length, "todo lead com ad_id entra uma vez", `${saida.leads.length} de ${comAd.length}`);
ok(saida.leads_sem_id === leads.filter((l) => !l.ad_id).length, "leads sem ad_id contados à parte", String(saida.leads_sem_id));
ok(saida.leads_previa === comMacro.length, "lead com macro literal da Meta fica no balde de prévia", String(saida.leads_previa));
ok(saida.leads.every((l) => !ehMacro(l.ad_id)), "nenhum ad_id de macro entra na hierarquia");
ok(new Set(saida.leads.map((l) => l.id)).size === saida.leads.length, "nenhum lead duplicado");
ok(new Set(saida.anuncios.map((a) => a.ad_id)).size === saida.anuncios.length, "um anúncio por ad_id");

// 2. HQL = score gravado acima do corte DA VERSÃO do lead (73 quiz / 67 form).
const corteDe = (v) => (typeof v === "string" && v.trim().toLowerCase() === "v3-form" ? 67 : 73);
const hqlBruto = comAd.filter((l) => typeof l.score === "number" && l.score >= corteDe(l.score_version)).length;
ok(saida.leads.filter((l) => l.hql).length === hqlBruto, "HQL = score gravado >= corte da versão (73 quiz / 67 form)", String(hqlBruto));

// 3. A conta do lead é a conta que o ad_spend registrou para aquele ad_id.
const contaDoGasto = new Map();
let adEmDuasContas = 0;
for (const g of [...gasto, ...identidadesExtras]) {
  if (!g.ad_account_id) continue;
  if (contaDoGasto.has(g.ad_id) && contaDoGasto.get(g.ad_id) !== g.ad_account_id) adEmDuasContas++;
  contaDoGasto.set(g.ad_id, g.ad_account_id);
}
ok(adEmDuasContas === 0, "nenhum ad_id registrado em duas contas");
const contaErrada = saida.leads.filter((l) => contaDoGasto.has(l.ad_id) && contaDoGasto.get(l.ad_id) !== l.ad_account_id);
ok(contaErrada.length === 0, "conta do lead = conta do ad_spend do anúncio", `${contaErrada.length} divergente(s)`);

// 4. O mesmo nome em contas diferentes continua separado.
const porNome = new Map();
for (const a of saida.anuncios) {
  if (!a.ad_name) continue;
  const g = porNome.get(a.ad_name) ?? [];
  g.push(a);
  porNome.set(a.ad_name, g);
}
const repetidos = [...porNome.entries()].filter(([, g]) => new Set(g.map((a) => a.ad_account_id)).size > 1);
for (const [nome, g] of repetidos.slice(0, 6)) {
  ok(new Set(g.map((a) => a.ad_id)).size === g.length, `"${nome}" em ${new Set(g.map((a) => a.ad_account_id)).size} contas = ${g.length} anúncios distintos`);
}

// 5. A tela: cada nível soma exatamente os filhos.
const { TODAS, SELECAO_INICIAL, agregar, filhos, selecionar, opcoes, dentroDaSelecao, nivelDosFilhos } = front;
const campos = ["impressions", "clicks", "leads", "mql", "hql", "reunioes", "shows", "vendas"];
const confereSoma = (rotulo, pai, lista) => {
  const soma = (c) => lista.reduce((s, f) => s + f.agregado[c], 0);
  const spendOk = Math.abs(centavos(pai.spend) - centavos(soma("spend"))) <= lista.length;
  const receitaOk = Math.abs(centavos(pai.receita) - centavos(soma("receita"))) <= 1;
  const outros = campos.filter((c) => pai[c] !== soma(c));
  const bate = spendOk && receitaOk && outros.length === 0;
  if (!bate) ok(false, rotulo, `spend ${spendOk} receita ${receitaOk} divergentes ${outros.join(",")}`);
  return bate;
};
let niveisConferidos = 0;
let niveisOk = 0;
const percorrer = (sel, pai, rotulo) => {
  const nivel = nivelDosFilhos(sel);
  if (!nivel) return;
  const fs_ = filhos(saida.anuncios, saida.leads, sel);
  niveisConferidos++;
  if (confereSoma(rotulo, pai, fs_)) niveisOk++;
  for (const f of fs_) percorrer(selecionar(sel, nivel, f.chave), f.agregado, `${rotulo} > ${f.rotulo}`);
};
const raiz = agregar(saida.anuncios, saida.leads);
percorrer(SELECAO_INICIAL, raiz, "Todas as contas");
ok(niveisOk === niveisConferidos, "cada nível = soma exata dos filhos", `${niveisOk}/${niveisConferidos} nós conferidos`);
ok(raiz.leads === saida.leads.length && raiz.hql === hqlBruto, "raiz = total");

// 6. Seletores.
const contasComDado = filhos(saida.anuncios, saida.leads, SELECAO_INICIAL);
if (contasComDado.length) {
  const primeira = contasComDado[0].chave;
  const sel = selecionar(SELECAO_INICIAL, "conta", primeira);
  const camp = opcoes(saida.anuncios, sel, "campanha");
  ok(camp.every((o) => saida.anuncios.some((a) => a.campaign_id === o.valor && a.ad_account_id === primeira)), "opções de campanha só da conta escolhida");
  const sel2 = selecionar({ ...sel, campanha: "x", conjunto: "y", anuncio: "z" }, "conta", primeira);
  ok(sel2.campanha === TODAS && sel2.conjunto === TODAS && sel2.anuncio === TODAS, "trocar a conta zera campanha, conjunto e anúncio");
  ok(saida.leads.filter((l) => dentroDaSelecao(l, sel)).every((l) => l.ad_account_id === primeira), "leads filtrados pela conta são só dela");
}

// Resumo que a tela deve mostrar.
console.log("\nPOR CONTA (o que a tela mostra no nível raiz)");
for (const f of contasComDado) {
  const a = f.agregado;
  console.log(`  ${f.rotulo.padEnd(26)} gasto R$ ${a.spend.toFixed(2).padStart(9)}  leads ${String(a.leads).padStart(3)}  MQL ${String(a.mql).padStart(3)}  HQL   ${String(a.hql).padStart(2)}  score méd ${a.score_medio === null ? "—" : a.score_medio.toFixed(1)}  vendas ${a.vendas}  receita R$ ${a.receita.toFixed(2)}`);
}
console.log(`  sem ad_id: ${saida.leads_sem_id} | com ad_id e sem conta: ${saida.leads_sem_conta} | prévia do Gerenciador (macro literal): ${saida.leads_previa}`);

console.log(`\n${falhas === 0 ? "TUDO CERTO" : falhas + " FALHA(S)"}`);
process.exit(falhas ? 1 : 0);
