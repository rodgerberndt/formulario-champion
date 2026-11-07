/**
 * Aplica migrations no Supabase via Management API.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/aplicar-migrations.mjs 20260828140000_meetings_tres_estados.sql [outra.sql ...]
 *
 * Sem argumento, aplica as duas migrations de 28/08 (três estados + agenda).
 * As migrations são idempotentes (IF NOT EXISTS / CREATE OR REPLACE), então
 * rodar duas vezes não quebra nada — exceto o backfill de status, que só tem
 * efeito real na primeira, porque depois nenhuma linha continua com o valor
 * default.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "qzzyfohzoxiefwbmtclt";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("Defina SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).");
  process.exit(1);
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["20260828140000_meetings_tres_estados.sql", "20260828150000_agenda_reunioes.sql"];

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

for (const file of files) {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", file), "utf8");
  process.stdout.write(`Aplicando ${file}… `);
  await runQuery(sql);
  console.log("OK");
}

// Conferência: como ficou a distribuição dos três estados depois do backfill.
const check = await runQuery(
  "SELECT status, COUNT(*) AS total FROM public.meetings GROUP BY status ORDER BY status;",
);
console.log("\nReuniões por situação:");
console.table(check);
