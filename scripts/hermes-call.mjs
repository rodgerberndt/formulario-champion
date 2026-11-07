// Chama qualquer ação do HERMES pelo banco, com a chave que o cron já carrega.
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/hermes-call.mjs "action=ads&campaign_id=123"
const PAT = process.env.SUPABASE_ACCESS_TOKEN; const REF = "qzzyfohzoxiefwbmtclt";
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 600)); return JSON.parse(t);
}
const url = `https://${REF}.supabase.co/functions/v1/hermes?${process.argv[2]}`;
const [{ id }] = await sql(`select net.http_post(url := '${url.replace(/'/g, "''")}',
  headers := (select (regexp_match(command, '(\{"Content-Type"[^}]*\})'))[1]::jsonb from cron.job where jobname = 'hermes-run'),
  timeout_milliseconds := 150000) as id`);
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const rows = await sql(`select status_code, content, error_msg from net._http_response where id = ${id}`);
  if (rows.length) { const { status_code, content, error_msg } = rows[0]; if (error_msg) console.error(error_msg); process.stdout.write(content); process.exit(status_code === 200 ? 0 : 2); }
}
console.error("timeout");
