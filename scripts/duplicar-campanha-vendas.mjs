/**
 * Duplica uma campanha inteira (conjuntos + anúncios, mesmos criativos, mesmo
 * lance) como uma campanha NOVA de objetivo VENDAS, copiando a configuração de
 * conversão (destino, evento, pixel) de uma campanha-modelo.
 *
 * Uso:
 *   META_ACCESS_TOKEN="EAA..." node scripts/duplicar-campanha-vendas.mjs inspecionar
 *   META_ACCESS_TOKEN="EAA..." node scripts/duplicar-campanha-vendas.mjs executar
 *
 * A campanha nova nasce PAUSADA. Conjuntos e anúncios herdam o status da origem,
 * então basta ligar a campanha para ela rodar igual à original.
 */
const TOKEN = process.env.META_ACCESS_TOKEN;
if (!TOKEN) { console.error("Falta META_ACCESS_TOKEN"); process.exit(1); }
const V = "v21.0";
const ACC = process.env.ACC || "act_1733204057869041";
const ORIGEM = process.env.ORIGEM || "120255118647380054";          // CA02 - Bid Cap - MQL - Portfólio
const MODELO_NOME = process.env.MODELO_NOME || "ABO - OBJ MQL";      // campanha cuja config de conversão será copiada
const NOME_NOVO = process.env.NOME_NOVO || "CA02 - Bid Cap - VENDAS - Portfólio";
const modo = process.argv[2] || "inspecionar";

async function g(path, params = {}, method = "GET") {
  const url = new URL(`https://graph.facebook.com/${V}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    method === "GET" ? url.searchParams.set(k, val) : body.set(k, val);
  }
  if (method === "GET") url.searchParams.set("access_token", TOKEN); else body.set("access_token", TOKEN);
  const r = await fetch(url, method === "GET" ? {} : { method, body });
  const j = await r.json();
  if (j.error) throw new Error(`${method} ${path}: ${j.error.message} (code ${j.error.code}${j.error.error_subcode ? "/" + j.error.error_subcode : ""}) ${j.error.error_user_msg || ""}`);
  return j;
}
async function todos(path, params) {
  let out = [], j = await g(path, { limit: 200, ...params });
  out.push(...(j.data || []));
  while (j.paging?.next) { const r = await fetch(j.paging.next); j = await r.json(); out.push(...(j.data || [])); }
  return out;
}
const limpa = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

const CAMP_F = "id,name,objective,buying_type,bid_strategy,daily_budget,lifetime_budget,special_ad_categories,status,effective_status,spend_cap";
const ADSET_F = "id,name,status,effective_status,daily_budget,lifetime_budget,bid_amount,bid_strategy,targeting,start_time,end_time,attribution_spec,optimization_goal,billing_event,promoted_object,destination_type,is_dynamic_creative,pacing_type,dsa_beneficiary,dsa_payor";
const AD_F = "id,name,status,effective_status,adset_id,creative{id},conversion_domain,tracking_specs";

// ── Leitura ────────────────────────────────────────────────────────────────
const origem = await g(ORIGEM, { fields: CAMP_F });
const campanhas = await todos(`${ACC}/campaigns`, { fields: "id,name,objective,effective_status" });
const modelo = campanhas.find(c => c.name.trim() === MODELO_NOME);
if (!modelo) throw new Error(`Campanha-modelo "${MODELO_NOME}" não encontrada. Nomes: ${campanhas.map(c => c.name).join(" | ")}`);
const modeloAdsets = await todos(`${modelo.id}/adsets`, { fields: ADSET_F });
const modeloRef = modeloAdsets.find(a => a.effective_status === "ACTIVE") || modeloAdsets[0];
if (!modeloRef) throw new Error("Campanha-modelo sem conjuntos.");
const adsets = (await todos(`${ORIGEM}/adsets`, { fields: ADSET_F })).filter(a => !["DELETED", "ARCHIVED"].includes(a.effective_status));
const ads = (await todos(`${ORIGEM}/ads`, { fields: AD_F })).filter(a => !["DELETED", "ARCHIVED"].includes(a.effective_status));

console.log("ORIGEM:", JSON.stringify(origem));
console.log("MODELO:", modelo.id, modelo.name, modelo.objective);
console.log("CONFIG DE CONVERSÃO DO MODELO (conjunto", modeloRef.name + "):", JSON.stringify(limpa({
  optimization_goal: modeloRef.optimization_goal, billing_event: modeloRef.billing_event,
  promoted_object: modeloRef.promoted_object, destination_type: modeloRef.destination_type,
  attribution_spec: modeloRef.attribution_spec, bid_strategy: modeloRef.bid_strategy })));
console.log(`\nCONJUNTOS DA ORIGEM (${adsets.length}):`);
for (const a of adsets) console.log(` - ${a.id} | ${a.name} | ${a.effective_status} | bid ${a.bid_amount ?? "-"} | ${a.bid_strategy ?? "-"} | daily ${a.daily_budget ?? "-"} | ${a.optimization_goal} | dest ${a.destination_type ?? "-"} | ads: ${ads.filter(x => x.adset_id === a.id).length}`);
console.log(`ANÚNCIOS (${ads.length}), status:`, ads.reduce((m, x) => (m[x.effective_status] = (m[x.effective_status] || 0) + 1, m), {}));

if (modo !== "executar") { console.log("\nModo inspecionar: nada criado. Rode com `executar` para criar."); process.exit(0); }

// ── Criação ────────────────────────────────────────────────────────────────
const criados = { campaign: null, adsets: [], ads: [] };
try {
  const camp = await g(`${ACC}/campaigns`, limpa({
    name: NOME_NOVO, objective: "OUTCOME_SALES", buying_type: origem.buying_type || "AUCTION",
    special_ad_categories: origem.special_ad_categories || [], status: "PAUSED",
    daily_budget: origem.daily_budget, lifetime_budget: origem.lifetime_budget,
    bid_strategy: origem.daily_budget || origem.lifetime_budget ? origem.bid_strategy : undefined,
    spend_cap: origem.spend_cap,
  }), "POST");
  criados.campaign = camp.id;
  console.log("\nCampanha criada:", camp.id, NOME_NOVO);

  const mapa = {};
  for (const a of adsets) {
    const futuro = a.start_time && new Date(a.start_time) > new Date() ? a.start_time : undefined;
    const novo = await g(`${ACC}/adsets`, limpa({
      name: a.name, campaign_id: camp.id, status: a.status,
      daily_budget: a.daily_budget, lifetime_budget: a.lifetime_budget,
      bid_amount: a.bid_amount, bid_strategy: a.bid_strategy,
      targeting: a.targeting, start_time: futuro, end_time: a.end_time,
      attribution_spec: a.attribution_spec, is_dynamic_creative: a.is_dynamic_creative,
      pacing_type: a.pacing_type, dsa_beneficiary: a.dsa_beneficiary, dsa_payor: a.dsa_payor,
      // Conversão: vem do MODELO (objetivo Vendas, destino site e ligações)
      optimization_goal: modeloRef.optimization_goal, billing_event: modeloRef.billing_event,
      promoted_object: modeloRef.promoted_object, destination_type: modeloRef.destination_type,
    }), "POST");
    mapa[a.id] = novo.id; criados.adsets.push(novo.id);
    console.log("  conjunto:", a.name, "->", novo.id);
    for (const ad of ads.filter(x => x.adset_id === a.id)) {
      const novoAd = await g(`${ACC}/ads`, limpa({
        name: ad.name, adset_id: novo.id, status: ad.status,
        creative: { creative_id: ad.creative.id }, conversion_domain: ad.conversion_domain,
      }), "POST");
      criados.ads.push(novoAd.id);
      console.log("     anúncio:", ad.name, "->", novoAd.id);
    }
  }
  console.log("\nPRONTO. Campanha nova PAUSADA:", camp.id, "| conjuntos:", criados.adsets.length, "| anúncios:", criados.ads.length);
} catch (e) {
  console.error("\nFALHOU:", e.message);
  console.error("Criados até aqui (apagar se quiser recomeçar):", JSON.stringify(criados));
  process.exit(2);
}
