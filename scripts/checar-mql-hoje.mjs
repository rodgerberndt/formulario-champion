// Uso: SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/checar-mql-hoje.mjs
// Somente leitura. Cruza: leads de hoje x eventos CAPI disparados hoje.
const PAT = process.env.SUPABASE_ACCESS_TOKEN;
if (!PAT) { console.error("Falta SUPABASE_ACCESS_TOKEN"); process.exit(1); }
async function sql(query) {
  if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke)\b/i.test(query)) throw new Error("SOMENTE LEITURA");
  const r = await fetch("https://api.supabase.com/v1/projects/qzzyfohzoxiefwbmtclt/database/query", {
    method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 600)); return JSON.parse(t);
}
const cols = await sql(`select column_name from information_schema.columns where table_schema='public' and table_name='leads' and (column_name ilike '%score%' or column_name ilike '%campaign%' or column_name ilike '%mql%' or column_name ilike '%created%' or column_name ilike '%name%') order by 1`);
console.log("colunas leads:", cols.map(c => c.column_name).join(", "));
const scoreCol = cols.find(c => /^score$|lead_score|score_total/.test(c.column_name))?.column_name || "score";
const leads = await sql(`select id, created_at at time zone 'America/Sao_Paulo' as hora, ${scoreCol} as score, campaign_id, utm_campaign, site_source_name from public.leads where created_at >= (now() at time zone 'America/Sao_Paulo')::date at time zone 'America/Sao_Paulo' order by created_at`);
console.log("\nLEADS DE HOJE:", leads.length); console.table(leads);
const capi = await sql(`select created_at at time zone 'America/Sao_Paulo' as hora, origem, lead_id, status, left(detalhe,160) as detalhe from public.capi_dispatch_log where created_at >= (now() at time zone 'America/Sao_Paulo')::date at time zone 'America/Sao_Paulo' order by created_at`);
console.log("\nCAPI DISPATCH HOJE:", capi.length); console.table(capi);
