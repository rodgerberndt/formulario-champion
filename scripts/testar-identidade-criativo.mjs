// Testa a IDENTIDADE de uma linha da tabela "Performance por Criativo" e a
// soma opcional por criativo. Sem banco, sem rede: funções puras.
//
//   supabase/functions/admin-data/identidade_criativo.ts
//   src/lib/criativosAgregado.ts
//
// O que está sendo protegido, em uma frase: a linha é o par (CONTA, ANÚNCIO), a
// macro literal da Meta nunca é ID, e duas réguas de score nunca entram na
// mesma média. Os três defeitos foram medidos na auditoria de 18/09/2026.
//
// Uso: node scripts/testar-identidade-criativo.mjs

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = createRequire(path.join(RAIZ, "package.json"))("esbuild");

async function carregar(arquivo) {
  const r = esbuild.buildSync({
    entryPoints: [path.join(RAIZ, arquivo)],
    bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
}

const I = await carregar("supabase/functions/admin-data/identidade_criativo.ts");
const A = await carregar("src/lib/criativosAgregado.ts");

let passaram = 0, falharam = 0;
const ok = (cond, titulo, detalhe = "") => {
  console.log(`  ${cond ? "OK   " : "FALHA"}  ${titulo}${detalhe ? "  ·  " + detalhe : ""}`);
  cond ? passaram++ : falharam++;
};
const igual = (a, b, titulo) => ok(a === b, titulo, `${JSON.stringify(a)} ${a === b ? "=" : "≠"} ${JSON.stringify(b)}`);

// ── Índice montado como a rota monta: linhas de ad_spend ───────────────────
// `campaign_id`, `adset_id` e `spend` entram em 18/09/2026 (tarde): são eles
// que dão CONTA e desempate a um registro que só tem o nome do criativo.
const GASTO = [
  { ad_account_id: "act_CA05", ad_id: "1", ad_name: "Luis-Nathan Case #2 - V3", date: "2026-09-15", campaign_id: "camp_CA05", adset_id: "conj_CA05", spend: 1022.02 },
  { ad_account_id: "act_CA02", ad_id: "2", ad_name: "Luis-Nathan Case #2 - V3", date: "2026-09-15", campaign_id: "camp_CA02", adset_id: "conj_CA02", spend: 900.98 },
  { ad_account_id: "act_CA03", ad_id: "3", ad_name: "Luis-Nathan Case #2 - V3", date: "2026-09-15", campaign_id: "camp_CA03", adset_id: "conj_CA03", spend: 720.55 },
  { ad_account_id: "act_CA02", ad_id: "4", ad_name: "Case Ighor #7 (30-08)", date: "2026-09-14", campaign_id: "camp_CA02", adset_id: "conj_CA02", spend: 268.88 },
  // O mesmo anúncio renomeado: o nome da linha MAIS RECENTE manda.
  { ad_account_id: "act_CA02", ad_id: "5", ad_name: "Nome Velho", date: "2026-09-10", campaign_id: "camp_CA02", spend: 10 },
  { ad_account_id: "act_CA02", ad_id: "5", ad_name: "Nome Novo", date: "2026-09-16", campaign_id: "camp_CA02", spend: 10 },
];
const idx = I.montarIndiceDeAnuncios(GASTO);

console.log("\n═══ 1. MACRO LITERAL NUNCA É ID ═══\n");
igual(I.sanitizarIdentificador("{{ad.id}}"), null, "{{ad.id}} vira nulo");
igual(I.sanitizarIdentificador("{{ad.id"), null, "macro truncada no fim também vira nulo");
igual(I.sanitizarIdentificador("ad.id}}"), null, "macro truncada no início também");
igual(I.sanitizarIdentificador("(not set)"), null, "(not set) não é dado");
igual(I.sanitizarIdentificador("  "), null, "espaço em branco não é dado");
igual(I.sanitizarIdentificador("120255215325330054"), "120255215325330054", "ID de verdade passa");
ok(I.ehMacroLiteral("{{campaign.id}}") && !I.ehMacroLiteral("Case Ighor #7"), "ehMacroLiteral separa os dois");

{
  // O lead do Vic (16/09/2026, score 89): os três IDs como macro crua.
  const r = I.resolverIdentidade(
    { ad_id: "{{ad.id}}", nome: "link_in_bio", outrosIds: ["{{campaign.id}}", "{{adset.id}}"] }, idx);
  igual(r.row_key, I.CHAVE_PREVIA, "lead do Vic vai para o balde de PRÉVIA");
  igual(r.metodo, "previa", "e o método diz o que ele é");
  igual(r.ad_account_id, null, "prévia não recebe conta");
  ok(r.row_key !== I.CHAVE_SEM_ATRIBUICAO, "prévia NÃO é o mesmo balde do orgânico");
}
{
  // Macro escondida em campaign_id, com ad_id aparentemente bom.
  const r = I.resolverIdentidade({ ad_id: "1", outrosIds: ["{{campaign.id}}"] }, idx);
  igual(r.metodo, "previa", "macro em QUALQUER identificador manda a visita inteira para prévia");
}

console.log("\n═══ 2. A LINHA É (CONTA, ANÚNCIO) ═══\n");
{
  const ca05 = I.resolverIdentidade({ ad_id: "1" }, idx);
  const ca02 = I.resolverIdentidade({ ad_id: "2" }, idx);
  const ca03 = I.resolverIdentidade({ ad_id: "3" }, idx);
  ok(new Set([ca05.row_key, ca02.row_key, ca03.row_key]).size === 3,
     "o MESMO nome em 3 contas dá 3 linhas", [ca05.row_key, ca02.row_key, ca03.row_key].join(" | "));
  igual(ca05.ad_account_id, "act_CA05", "a conta vem do ad_spend, não do nome");
  igual(ca05.creative_key, ca02.creative_key,
        "e as três compartilham creative_key (é por ela que a soma opcional junta)");
  igual(ca05.creative_label, "Luis-Nathan Case #2 - V3", "o nome continua sendo o rótulo");
}
{
  const r = I.resolverIdentidade({ ad_id: "5" }, idx);
  igual(r.creative_label, "Nome Novo", "anúncio renomeado mostra o nome ATUAL (linha de gasto mais recente)");
}
{
  const r = I.resolverIdentidade({ nome: "120255215325330054" }, idx);
  igual(r.metodo, "utm_content_id", "utm_content que é ID numérico cru também é ID");
  igual(r.ad_id, "120255215325330054", "e vira o ad_id da linha");
}

console.log("\n═══ 3. SÓ O NOME: resolve quando dá, declara quando não dá ═══\n");
{
  const r = I.resolverIdentidade({ nome: "Case Ighor #7 (30-08)" }, idx);
  igual(r.metodo, "nome_unico", "nome que pertence a UM anúncio resolve");
  igual(r.ad_account_id, "act_CA02", "e traz a conta dele");
}
{
  // ── O defeito de 18/09/2026 à tarde ────────────────────────────────────
  // Nome que servia a vários anúncios virava LINHA PRÓPRIA, sem conta e sem
  // gasto. No filtro "Máximo" isso deu 82 linhas órfãs segurando a maioria
  // dos leads da base enquanto o dinheiro ficava em linhas com zero lead.
  // A regra agora: nome NUNCA cria linha. Ou casa com um anúncio, ou balde.
  const r = I.resolverIdentidade({ nome: "Luis-Nathan Case #2 - V3" }, idx);
  igual(r.metodo, "nome_por_gasto", "nome de 3 anúncios fica com o que mais gastou");
  ok(r.ad_id !== null, "e entra numa linha de anúncio de verdade", String(r.ad_id));
  ok(!r.row_key.startsWith("nome::"), "nunca mais uma linha por nome", r.row_key);
  igual(
    r.row_key,
    I.resolverIdentidade({ ad_id: "1" }, idx).row_key,
    "o desempate é o gasto: a CA05 gastou mais, então é a linha dela",
  );
}
{
  // A CONTA desempata antes do gasto. O mesmo nome, com a conta declarada,
  // vai para o anúncio DAQUELA conta — é a regra "nome dentro da mesma conta".
  const r = I.resolverIdentidade({ nome: "Luis-Nathan Case #2 - V3", ad_account_id: "act_CA02" }, idx);
  igual(r.ad_account_id, "act_CA02", "conta declarada manda no nome");
  igual(r.ad_id, "2", "e escolhe o anúncio daquela conta");
  igual(r.metodo, "nome_unico", "com um só candidato na conta, o método é o forte");
}
{
  // Sem `ad_account_id`, a campanha diz a conta. `ad_spend` conhece as duas.
  const r = I.resolverIdentidade({ nome: "Luis-Nathan Case #2 - V3", campaign_id: "camp_CA03" }, idx);
  igual(r.ad_account_id, "act_CA03", "campanha leva à conta certa");
  igual(r.ad_id, "3", "e ao anúncio daquela conta");
}
{
  // E o conjunto, um degrau abaixo.
  const r = I.resolverIdentidade({ nome: "Luis-Nathan Case #2 - V3", adset_id: "conj_CA02" }, idx);
  igual(r.ad_account_id, "act_CA02", "conjunto também leva à conta");
}
{
  // Nome que não casa com anúncio nenhum: UM balde, nunca uma linha por nome.
  const r = I.resolverIdentidade({ nome: "Criativo Que Nunca Existiu" }, idx);
  igual(r.row_key, I.CHAVE_SEM_ANUNCIO, "nome sem anúncio correspondente vai para o balde");
  igual(r.ad_account_id, null, "e não inventa conta");
  const outro = I.resolverIdentidade({ nome: "Outro Criativo Fantasma" }, idx);
  igual(outro.row_key, r.row_key, "dois nomes órfãos dividem o MESMO balde");
}
{
  for (const nome of [null, "", "link_in_bio", "{{ad.name}}", "__sem_criativo__"]) {
    const r = I.resolverIdentidade({ nome }, idx);
    const esperado = nome === "{{ad.name}}" ? I.CHAVE_PREVIA : I.CHAVE_SEM_ATRIBUICAO;
    igual(r.row_key, esperado, `"${nome}" cai no balde certo`);
  }
}

console.log("\n═══ 4. DUAS RÉGUAS DE SCORE NUNCA VIRAM UMA MÉDIA ═══\n");
{
  // Números reais da auditoria: quiz 43,8 × formulário 20,0 na mesma faixa.
  const n = I.novaNotaPorVersao();
  [52, 43, 36].forEach((x) => I.acumularNota(n, "v2.3", x));
  I.acumularNota(n, "v3-form", 20);
  const m = I.fecharNotas(n);
  igual(m.versao_dominante, "v2.3", "a versão com mais leads é a dominante");
  igual(m.media_dominante, 43.7, "a média mostrada é só a do quiz");
  igual(m.versoes["v3-form"].media, 20, "a do formulário existe, separada");
  igual(m.versoes["v3-form"].n, 1, "com o n dela");
  ok(m.misturado, "a linha declara que tem mais de uma régua");
  igual(m.n_fora, 1, "e quantos leads ficaram fora da média mostrada");
  const mediaMisturada = (52 + 43 + 36 + 20) / 4;
  ok(m.media_dominante !== Math.round(mediaMisturada * 10) / 10,
     "e NÃO é a média das duas somadas", `mistura daria ${mediaMisturada.toFixed(2)}`);
}
{
  const n = I.novaNotaPorVersao();
  I.acumularNota(n, "v2.3", 80);
  const m = I.fecharNotas(n);
  ok(!m.misturado && m.n_fora === 0, "uma régua só não acende aviso nenhum");
}
igual(I.versaoDoScore(null, "v2.3"), "v2.3", "score sem versão é o quiz (todo o histórico)");
igual(I.versaoDoScore("  V3-FORM ", "v2.3"), "v3-form", "versão é lida tolerante a caixa e espaço");
igual(I.fecharNotas(I.novaNotaPorVersao()).media_dominante, null, "linha sem lead não tem média");

console.log("\n═══ 5. FUSO ═══\n");
igual(I.offsetDoFiltro("2026-09-12T03:00:00.000Z"), -180, "from de 03:00Z = filtro montado em UTC−3 (BRT)");
igual(I.offsetDoFiltro("2026-09-11T22:00:00.000Z"), 120, "from de 22:00Z = filtro montado em UTC+2");
igual(I.offsetDoFiltro("2026-09-12T00:00:00.000Z"), 0, "from de 00:00Z = filtro em UTC");
igual(I.offsetDoFiltro(null), I.OFFSET_PADRAO_MIN, "sem from, o padrão documentado");
igual(I.offsetDoFusoEmMinutos("America/Sao_Paulo", new Date("2026-09-15T12:00:00Z")), -180, "America/Sao_Paulo é UTC−3");
igual(I.offsetDoFusoEmMinutos("America/Belem", new Date("2026-09-15T12:00:00Z")), -180, "America/Belem também");
igual(I.offsetDoFusoEmMinutos("Fuso/Inexistente", new Date()), I.OFFSET_PADRAO_MIN, "fuso desconhecido cai no padrão, não quebra");
{
  // A virada de mês que estragava o CAC: 30/09 23:30 BRT já é 01/10 em UTC.
  const viradaUtc = new Date("2026-10-01T02:30:00Z");
  igual(viradaUtc.toISOString().slice(0, 10), "2026-10-01", "em UTC já é outubro (o bug)");
  igual(I.diaNoFuso(viradaUtc, "America/Sao_Paulo"), "2026-09-30", "no fuso da conta ainda é 30/09 (a correção)");
}
{
  const f = I.diagnosticarFusos(
    [{ ad_account_id: "act_CA02", account_name: "CA 02", timezone_name: "America/Belem" },
     { ad_account_id: "act_X", account_name: "Fora", timezone_name: "Europe/Lisbon" },
     { ad_account_id: "act_Y", account_name: "Sem fuso", timezone_name: null }], -180,
    new Date("2026-09-15T12:00:00Z"));
  ok(!f[0].divergente, "conta UTC−3 não diverge do filtro BRT");
  ok(f[1].divergente, "conta em Lisboa diverge — e é dito");
  igual(f[2].fuso_usado, I.FUSO_PADRAO_CONTA, "conta sem fuso declarado usa o padrão documentado");
  igual(f[2].timezone_name, null, "e não finge que o padrão foi declarado");
}

console.log("\n═══ 6. SOMA POR CRIATIVO: conta some, taxa se recalcula ═══\n");
{
  const linhaBase = {
    clicks: 0, impressions: 0, landing_page_views: 0, tier_small_count: 0, tier_medium_count: 0,
    tier_large_count: 0, tier_enterprise_count: 0, tier_enterprise_plus_count: 0, qualified_count: 0,
    meetings_count: 0, meetings_attended_count: 0, sales_count: 0, sales_sprint_count: 0,
    sales_assessoria_count: 0, revenue: 0, revenue_sprint: 0, revenue_assessoria: 0,
    last_activity: null, is_active: false, campaigns: [], leads_by_stage: {},
  };
  const linhas = [
    { ...linhaBase, row_key: "act_CA05::1", creative_key: "v3", creative_label: "V3", ad_id: "1",
      ad_account_id: "act_CA05", account_name: "CA 05", identidade_metodo: "ad_id",
      spend: 1022.02, leads_count: 12, mql_count: 4, hql_count: 1, is_active: true,
      campaigns: ["Camp A"], score_por_versao: { "v2.3": { media: 50, n: 12 } } },
    { ...linhaBase, row_key: "act_CA02::2", creative_key: "v3", creative_label: "V3", ad_id: "2",
      ad_account_id: "act_CA02", account_name: "CA 02", identidade_metodo: "ad_id",
      spend: 900.98, leads_count: 8, mql_count: 6, hql_count: 0,
      campaigns: ["Camp B"], score_por_versao: { "v2.3": { media: 40, n: 8 }, "v3-form": { media: 9, n: 2 } } },
    { ...linhaBase, row_key: "act_CA03::3", creative_key: "v3", creative_label: "V3", ad_id: "3",
      ad_account_id: "act_CA03", account_name: "CA 03", identidade_metodo: "ad_id",
      spend: 720.55, leads_count: 6, mql_count: 4, hql_count: 2,
      campaigns: ["Camp A"], score_por_versao: { "v2.3": { media: 55, n: 6 } } },
  ];
  const [s] = A.somarPorCriativo(linhas);
  igual(A.somarPorCriativo(linhas).length, 1, "as três linhas viram uma");
  igual(Math.round(s.spend * 100) / 100, 2643.55, "gasto soma");
  igual(s.leads_count, 26, "leads somam");
  igual(s.mql_count, 14, "MQL soma");
  igual(s.hql_count, 3, "HQL soma");
  igual(Math.round(s.cost_per_mql * 100) / 100, 188.83, "R$/MQL é recalculado sobre os totais");
  const mediaDeTaxas = (1022.02 / 4 + 900.98 / 6 + 720.55 / 4) / 3;
  ok(Math.abs(s.cost_per_mql - mediaDeTaxas) > 1,
     "e NÃO é a média dos R$/MQL das linhas", `média de taxas daria ${mediaDeTaxas.toFixed(2)}`);
  igual(s.contas_somadas, 3, "a linha diz quantas contas juntou");
  igual(s.linhas_somadas, 3, "e quantas linhas");
  igual(s.ad_account_id, null, "a soma não finge pertencer a uma conta");
  igual(s.ad_id, null, "nem a um anúncio");
  igual(s.identidade_metodo, "agregado", "e o método diz o que ela é");
  ok(s.is_active, "ativa se QUALQUER uma das linhas estava ativa");
  igual(s.campaigns.length, 2, "campanhas viram a união, sem repetir");
  // Nota: ponderada por n DENTRO de cada versão, versões separadas.
  igual(s.score_por_versao["v2.3"].n, 26, "o n do quiz soma as três linhas");
  igual(s.score_por_versao["v2.3"].media, 48.1, "a média do quiz é ponderada por n");
  igual(s.score_por_versao["v3-form"].media, 9, "a do formulário continua separada");
  igual(s.score_versao_dominante, "v2.3", "a dominante é a de mais leads");
  igual(s.avg_lead_score, 48.1, "e é ela que a coluna mostra");
  ok(s.score_misturado, "a soma também declara mistura de réguas");
}
{
  const uma = [{
    row_key: "act_CA02::9", creative_key: "unico", creative_label: "Único", ad_id: "9",
    ad_account_id: "act_CA02", account_name: "CA 02", identidade_metodo: "ad_id",
    spend: 100, clicks: 10, impressions: 0, landing_page_views: 5, leads_count: 2, mql_count: 1,
    tier_small_count: 0, tier_medium_count: 0, tier_large_count: 0, tier_enterprise_count: 0,
    tier_enterprise_plus_count: 0, qualified_count: 0, meetings_count: 0, meetings_attended_count: 0,
    sales_count: 0, sales_sprint_count: 0, sales_assessoria_count: 0, revenue: 0, revenue_sprint: 0,
    revenue_assessoria: 0, last_activity: null, is_active: true, campaigns: [], leads_by_stage: {},
    score_por_versao: { "v2.3": { media: 60, n: 2 } },
  }];
  const [s] = A.somarPorCriativo(uma);
  igual(s.contas_somadas, 1, "linha sozinha: não juntou conta nenhuma");
  igual(s.ad_account_id, "act_CA02", "e mantém a conta dela");
  igual(s.ad_id, "9", "e o anúncio dela");
  igual(s.cost_per_mql, 100, "as derivadas continuam certas");
  ok(!s.score_misturado, "e não acusa mistura que não existe");
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passaram} passaram, ${falharam} falharam`);
process.exit(falharam === 0 ? 0 : 1);
