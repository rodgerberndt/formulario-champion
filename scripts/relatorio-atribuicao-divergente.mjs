/**
 * QUAIS LEADS FORAM CREDITADOS AO ANÚNCIO ERRADO — relatório, não conserto.
 *
 * ── O que ele responde ─────────────────────────────────────────────────────
 * Para cada lead desde 14/09/2026, compara o anúncio GRAVADO no lead com o
 * ÚLTIMO TOQUE PAGO da sessão dele antes do envio, e mostra os dois lado a
 * lado. É a lista para o Rodger decidir a correção retroativa — que NÃO é
 * feita aqui.
 *
 * ── Por que `landing_hits` e não `lead_sessions` ───────────────────────────
 * `lead_sessions` tem UMA linha por sessão, e até 18/09 ela guardava o
 * PRIMEIRO toque para sempre (é exatamente o defeito que a migration
 * 20260918170000 conserta). Quem tem a jornada inteira é `landing_hits`: uma
 * linha por visita.
 *
 * De onde sai o anúncio de cada visita, nesta ordem:
 *   1. a query string da `path`, quando ela foi registrada inteira — é a única
 *      fonte que traz `campaign_id`/`adset_id`/`ad_id` (não há coluna para
 *      eles nessa tabela). Medido em 18/09: só 293 de 1.101 visitas desde
 *      14/09 têm `ad_id=` na path;
 *   2. as COLUNAS `utm_medium`/`utm_content`/`utm_term`/`placement_raw`, que o
 *      beacon preenche mesmo quando manda só o pathname — 949 das 1.101. É por
 *      elas que o Emerson e o André villa aparecem: a path deles é "/", e o
 *      nome do anúncio está na coluna;
 *   3. `meta_ads_cache`, só para TRADUZIR o nome do anúncio em ids. Nome é
 *      apresentação e ID manda (`feedback_anuncio_nao_e_criativo`), então
 *      quando o nome casa com mais de um anúncio o script mostra os candidatos
 *      e NÃO sugere UPDATE de id.
 *
 * ── Garantias ──────────────────────────────────────────────────────────────
 * SOMENTE SELECT. Nenhum UPDATE, INSERT ou DELETE é executado, nem montado
 * para ser executado por engano: o UPDATE sugerido sai COMENTADO na saída.
 * Nada é disparado para o Meta. Corrigir lead já enviado à CAPI cria
 * divergência permanente (project_exclusao_de_lead_divergencia_meta): se a
 * correção for aprovada, mexer SÓ nas colunas de atribuição, sem redisparar.
 *
 * Rode com:
 *   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/relatorio-atribuicao-divergente.mjs
 *   node scripts/relatorio-atribuicao-divergente.mjs 2026-09-01   (outra data de corte)
 */
import fs from "node:fs";

const DESDE = process.argv[2] || "2026-09-14";

const PAT = (() => {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const caminho =
    "C:/Users/Rodge/AppData/Local/Temp/claude/e--Obsidian-conhecimentos/d7f9263c-8419-4a59-8f2a-4a8519bb8404/scratchpad/.pat";
  try {
    return fs.readFileSync(caminho, "utf8").trim();
  } catch {
    console.error("Defina SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).");
    process.exit(1);
  }
})();

async function sql(query) {
  // Trava de segurança: este script não tem o direito de escrever.
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke)\b/i.test(query)) {
    throw new Error("Este script é SOMENTE LEITURA. Comando de escrita recusado.");
  }
  const r = await fetch("https://api.supabase.com/v1/projects/qzzyfohzoxiefwbmtclt/database/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 600));
  return JSON.parse(t);
}

// ── A régua de "é pago", a mesma do front e do banco ───────────────────────
const MEDIUMS_PAGOS = new Set(["paid_social", "paidsocial", "cpc", "ppc", "paid", "paid_search"]);
const semMacro = (v) => (!v || /\{\{|\}\}/.test(v) || v === "(not set)" || v === "" ? null : v);

/** Lê os parâmetros de anúncio da query string registrada em `landing_hits.path`. */
function paramsDaPath(path) {
  if (!path) return {};
  const i = path.indexOf("?");
  if (i < 0) return {};
  let p;
  try {
    p = new URLSearchParams(path.slice(i + 1));
  } catch {
    return {};
  }
  const num = (v) => (v && /^\d+$/.test(v) ? v : null);
  const utm_campaign = semMacro(p.get("utm_campaign"));
  const utm_content = semMacro(p.get("utm_content"));
  return {
    campaign_id: semMacro(p.get("campaign_id")) || num(utm_campaign),
    adset_id: semMacro(p.get("adset_id")),
    ad_id: semMacro(p.get("ad_id")) || num(utm_content),
    utm_source: semMacro(p.get("utm_source")),
    utm_medium: semMacro(p.get("utm_medium")),
    utm_campaign,
    utm_content,
    utm_term: semMacro(p.get("utm_term")),
    placement: semMacro(p.get("utm_placement") || p.get("placement")),
  };
}

const ehPago = (d) =>
  !!(d.campaign_id || d.adset_id || d.ad_id || MEDIUMS_PAGOS.has((d.utm_medium || "").toLowerCase()));

const brt = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const ou = (v) => (v === null || v === undefined || v === "" ? "(vazio)" : String(v));

// ── 1. Os leads do período ─────────────────────────────────────────────────
const leads = await sql(`
  SELECT l.id, l.created_at, l.nome_completo, l.session_id,
         l.campaign_id, l.adset_id, l.ad_id, l.utm_campaign, l.utm_content,
         l.utm_term, l.utm_source, l.utm_medium, l.placement, l.attribution_source
    FROM public.leads l
   WHERE l.created_at >= '${DESDE}'::date
   ORDER BY l.created_at;`);

// ── 2. Todas as visitas dessas sessões ─────────────────────────────────────
const sessoes = [...new Set(leads.map((l) => l.session_id).filter((s) => /^[0-9a-f-]{36}$/i.test(s || "")))];

const hits = sessoes.length
  ? await sql(`
      SELECT session_id, created_at, path, placement_raw,
             utm_source, utm_medium, utm_campaign, utm_content, utm_term
        FROM public.landing_hits
       WHERE session_id IN (${sessoes.map((s) => `'${s}'`).join(",")})
       ORDER BY created_at;`)
  : [];

// ── 2b. O catálogo de anúncios, para traduzir NOME em ID ───────────────────
const catalogo = await sql(`
  SELECT ad_id, adset_id, campaign_id, ad_name, adset_name, campaign_name
    FROM public.meta_ads_cache WHERE ad_name IS NOT NULL;`);

/** Resolve os ids a partir do nome do anúncio (+ campanha, quando ajuda). */
function idsPeloNome(adName, campanhaName) {
  if (!adName) return { candidatos: [] };
  let cand = catalogo.filter((c) => c.ad_name === adName);
  if (cand.length > 1 && campanhaName) {
    const porCampanha = cand.filter((c) => c.campaign_name === campanhaName);
    if (porCampanha.length) cand = porCampanha;
  }
  // Mesmo anúncio, mesma conta, sincronizado mais de uma vez: se todos os ids
  // são iguais, não é ambiguidade de verdade.
  const unicos = [...new Set(cand.map((c) => c.ad_id))];
  if (unicos.length === 1) return { ...cand[0], candidatos: cand };
  return { candidatos: cand };
}

const porSessao = new Map();
for (const h of hits) {
  if (!porSessao.has(h.session_id)) porSessao.set(h.session_id, []);
  porSessao.get(h.session_id).push(h);
}

// ── 3. E a linha da sessão, para mostrar o que o gatilho teria resgatado ───
const sessoesRows = sessoes.length
  ? await sql(`
      SELECT id, created_at, campaign_id, adset_id, ad_id, utm_campaign, utm_content,
             utm_term, placement_raw
        FROM public.lead_sessions
       WHERE id IN (${sessoes.map((s) => `'${s}'`).join(",")});`)
  : [];
const sessaoPorId = new Map(sessoesRows.map((s) => [s.id, s]));

// ── 4. Comparação ──────────────────────────────────────────────────────────
const divergentes = [];
const semToquePago = [];
let comToquePago = 0;

for (const l of leads) {
  const lista = porSessao.get(l.session_id) || [];
  // O último toque PAGO antes de o lead nascer. `<=` com folga de 1 minuto:
  // o beacon da última visita e o insert do lead podem chegar fora de ordem.
  const limite = new Date(l.created_at).getTime() + 60_000;
  const pagos = lista
    .map((h) => {
      const daPath = paramsDaPath(h.path);
      // Colunas primeiro, query string por cima: a path, quando veio inteira,
      // é a única que traz os IDs.
      const d = {
        utm_source: daPath.utm_source || semMacro(h.utm_source),
        utm_medium: daPath.utm_medium || semMacro(h.utm_medium),
        utm_campaign: daPath.utm_campaign || semMacro(h.utm_campaign),
        utm_content: daPath.utm_content || semMacro(h.utm_content),
        utm_term: daPath.utm_term || semMacro(h.utm_term),
        campaign_id: daPath.campaign_id,
        adset_id: daPath.adset_id,
        ad_id: daPath.ad_id,
        placement: daPath.placement || semMacro(h.placement_raw),
      };
      return { h, d };
    })
    .filter(({ h, d }) => new Date(h.created_at).getTime() <= limite && ehPago(d));

  if (!pagos.length) {
    if (!l.ad_id) semToquePago.push(l);
    continue;
  }
  comToquePago++;

  const ultimo = pagos[pagos.length - 1];
  const certo = { ...ultimo.d };

  // Sem ids na URL, traduz o NOME do anúncio pelo catálogo da Meta.
  if (!certo.ad_id && certo.utm_content && certo.utm_content !== "link_in_bio") {
    const resolvido = idsPeloNome(certo.utm_content, certo.utm_campaign);
    certo.ad_id = resolvido.ad_id || null;
    certo.adset_id = certo.adset_id || resolvido.adset_id || null;
    certo.campaign_id = certo.campaign_id || resolvido.campaign_id || null;
    certo.candidatos = resolvido.candidatos;
    certo.idPorNome = !!resolvido.ad_id;
  }

  // Divergência de IDENTIDADE (o que envenena a comparação de criativos):
  // ad_id diferente, ou ad_id ausente no lead e presente no toque.
  const adGravado = semMacro(l.ad_id);
  const adCerto = certo.ad_id;
  const divergeAd = adCerto && adGravado !== adCerto;
  const divergeConjunto = certo.adset_id && semMacro(l.adset_id) !== certo.adset_id;
  const divergePlacement = certo.placement && l.placement !== certo.placement;
  const divergeNome = certo.utm_content && semMacro(l.utm_content) !== certo.utm_content;

  if (divergeAd || divergeConjunto || divergePlacement || divergeNome) {
    divergentes.push({
      lead: l,
      certo,
      quando: ultimo.h.created_at,
      toques: pagos.length,
      sessao: sessaoPorId.get(l.session_id) || null,
      motivos: [
        divergeAd && "anúncio",
        divergeConjunto && "conjunto",
        divergeNome && "nome do anúncio",
        divergePlacement && "placement",
      ].filter(Boolean),
    });
  }
}

// ── 5. Relatório ───────────────────────────────────────────────────────────
console.log("═".repeat(78));
console.log(`ATRIBUIÇÃO GRAVADA × ÚLTIMO TOQUE PAGO DA SESSÃO — desde ${DESDE}`);
console.log("SOMENTE LEITURA. Nenhuma linha foi alterada.");
console.log("═".repeat(78));
console.log(`\nLeads no período: ${leads.length}`);
console.log(`Com session_id utilizável: ${leads.filter((l) => porSessao.has(l.session_id)).length}`);
console.log(`Com visita paga registrada na sessão: ${comToquePago}`);
console.log(`DIVERGENTES: ${divergentes.length}\n`);

for (const d of divergentes) {
  const l = d.lead;
  console.log("─".repeat(78));
  console.log(`${l.nome_completo}  ·  ${brt(l.created_at)}  ·  lead ${l.id}`);
  console.log(`  sessão ${l.session_id}  ·  ${d.toques} toque(s) pago(s) na jornada`);
  console.log(`  diverge em: ${d.motivos.join(", ")}`);
  console.log(`  último toque pago: ${brt(d.quando)}`);
  console.log("");
  const linha = (rotulo, gravado, certo) =>
    console.log(
      `   ${rotulo.padEnd(14)} gravado: ${ou(gravado).padEnd(34)} certo: ${ou(certo)}`,
    );
  linha("ad_id", l.ad_id, d.certo.ad_id);
  linha("adset_id", l.adset_id, d.certo.adset_id);
  linha("campaign_id", l.campaign_id, d.certo.campaign_id);
  linha("utm_content", l.utm_content, d.certo.utm_content);
  linha("utm_term", l.utm_term, d.certo.utm_term);
  linha("utm_campaign", l.utm_campaign, d.certo.utm_campaign);
  linha("placement", l.placement, d.certo.placement);
  if (d.sessao) {
    console.log(
      `   (a linha da sessão diz ad_id=${ou(d.sessao.ad_id)}, utm_content=${ou(d.sessao.utm_content)} — é ela que o gatilho lê)`,
    );
  }
  if (d.certo.idPorNome) {
    console.log("   (os ids do 'certo' vieram do catálogo meta_ads_cache pelo NOME do anúncio)");
  }
  if (d.certo.candidatos && d.certo.candidatos.length > 1 && !d.certo.idPorNome) {
    console.log(`   ATENÇÃO: o nome "${d.certo.utm_content}" casa com ${d.certo.candidatos.length} anúncios:`);
    for (const c of d.certo.candidatos) console.log(`      ad_id=${c.ad_id}  ${c.campaign_name}`);
    console.log("   Decida o ad_id à mão. O UPDATE abaixo sai sem id de anúncio.");
  }
  // COLUNA SEM VALOR CONHECIDO NÃO ENTRA NO UPDATE. Zerar o que está lá
  // trocaria um dado errado por nenhum dado, e nenhum dado não é melhoria:
  // o `placement` da maioria das visitas não chega em `landing_hits` (a path
  // registrada é só o pathname), então ele costuma cair aqui.
  const pares = [
    ["ad_id", d.certo.ad_id],
    ["adset_id", d.certo.adset_id],
    ["campaign_id", d.certo.campaign_id],
    ["utm_content", d.certo.utm_content],
    ["utm_term", d.certo.utm_term],
    ["utm_campaign", d.certo.utm_campaign],
    ["placement", d.certo.placement],
  ];
  const desconhecidos = pares.filter(([, v]) => !v).map(([c]) => c);
  if (desconhecidos.length) {
    console.log(
      `   sem valor conhecido no toque certo (ficam como estão): ${desconhecidos.join(", ")}`,
    );
  }
  console.log("\n   -- UPDATE SUGERIDO, NÃO EXECUTADO. Confira antes de rodar à mão:");
  console.log(
    `   -- UPDATE public.leads SET ${pares
      .filter(([, v]) => v)
      .map(([c, v]) => `${c} = '${String(v).replace(/'/g, "''")}'`)
      .join(", ")} WHERE id = '${l.id}';`,
  );
  console.log("");
}

if (semToquePago.length) {
  console.log("─".repeat(78));
  console.log(`Sem anúncio e sem visita paga registrada (orgânicos de verdade): ${semToquePago.length}`);
  for (const l of semToquePago) console.log(`   ${brt(l.created_at)}  ${l.nome_completo}`);
}

console.log("\n" + "═".repeat(78));
console.log("NADA FOI ALTERADO. Os UPDATEs acima estão comentados de propósito.");
console.log("Lembrete: corrigir SÓ as colunas de atribuição e NÃO redisparar CAPI");
console.log("(project_exclusao_de_lead_divergencia_meta).");
