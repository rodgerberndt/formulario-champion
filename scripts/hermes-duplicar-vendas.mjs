/**
 * Dispara a ação `duplicar_vendas` do HERMES a partir do banco, usando a chave
 * que o cron `hermes-run` já carrega — a chave nunca sai do Postgres.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/hermes-duplicar-vendas.mjs plano
 *   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/hermes-duplicar-vendas.mjs executar
 */
const PAT = process.env.SUPABASE_ACCESS_TOKEN;
if (!PAT) { console.error("Falta SUPABASE_ACCESS_TOKEN"); process.exit(1); }
const REF = "qzzyfohzoxiefwbmtclt";
const ORIGEM = process.env.ORIGEM || "120255118647380054";
const MODELO = process.env.MODELO || "ABO - OBJ MQL";
const NOME = process.env.NOME_NOVO || "CA02 - Bid Cap - VENDAS - Portfólio";
const executar = process.argv[2] === "executar";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 600)); return JSON.parse(t);
}
const q = new URLSearchParams({ action: "duplicar_vendas", origem: ORIGEM, modelo: MODELO, nome: NOME,
  ...(executar ? { executar: "1" } : {}),
  // Campanha que uma tentativa anterior já criou: reaproveita e só cria o que falta.
  ...(process.env.CAMPANHA ? { campanha_id: process.env.CAMPANHA } : {}),
  // Telefone do destino "site e ligações". Sem ele, o HERMES usa o do modelo.
  ...(process.env.TELEFONE ? { telefone: process.env.TELEFONE } : {}) });
const url = `https://${REF}.supabase.co/functions/v1/hermes?${q}`;
const [{ id }] = await sql(`
  select net.http_post(
    url := '${url.replace(/'/g, "''")}',
    headers := (select (regexp_match(command, '(\{"Content-Type"[^}]*\})'))[1]::jsonb from cron.job where jobname = 'hermes-run'),
    timeout_milliseconds := 150000
  ) as id`);
console.log(executar ? "EXECUTANDO" : "PLANO", "| request", id);
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const rows = await sql(`select status_code, left(content, 6000) as content, error_msg from net._http_response where id = ${id}`);
  if (rows.length) {
    const { status_code, content, error_msg } = rows[0];
    console.log("HTTP", status_code, error_msg || "");
    try { console.log(JSON.stringify(JSON.parse(content), null, 1)); } catch { console.log(content); }
    process.exit(status_code === 200 ? 0 : 2);
  }
}
console.log("Sem resposta em 180s. Confira net._http_response id", id);
