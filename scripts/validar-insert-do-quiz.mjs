/**
 * Prova que o INSERT do quiz, com as colunas novas, continua sendo aceito.
 *
 * Usa a forma EXATA do payload que o Quiz monta hoje, passa pelos quatro
 * triggers BEFORE INSERT da tabela, e termina em ROLLBACK. Nenhum lead de
 * producao e criado.
 */
import fs from "node:fs";
const PAT = fs.readFileSync("./.pat", "utf8").trim();
const run = (q) => fetch("https://api.supabase.com/v1/projects/qzzyfohzoxiefwbmtclt/database/query", {
  method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
}).then(async (r) => { const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 500)); return JSON.parse(t); });

const ID = "00000000-0000-4000-8000-0000feed0001";
const BRK = '{"faturamento":18,"mercado":12,"dor_desejo":8,"compromisso_whatsapp":13,"aceita_call":12,"entendimento_site":5}';

let passou = 0, falhou = 0;
const checar = (n, ok, d = "") => { if (ok) passou++; else falhou++; console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`); };

console.log("\n=== 3. O INSERT DO QUIZ CONTINUA SENDO ACEITO ===");
console.log("Forma exata do payload atual, passando pelos 4 triggers, com ROLLBACK.\n");

const INSERT = `
INSERT INTO public.leads (
  id, nome_completo, whatsapp, instagram, email, mercado, operacoes_ativas,
  investimento_faixa, faturamento_declarado, dor_desejo, trafego_faixa,
  score, score_breakdown, score_version, score_calculated_at,
  tier, nps_score, raw_answers_json, attribution_source, ip_address,
  fbp, fbc, user_agent, page_url, session_id,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  fbclid, gclid, campaign_id, adset_id, ad_id, placement, site_source_name
) VALUES (
  '${ID}', 'FIXTURE ROLLBACK', '+550000000000', 'fixture', 'fixture@exemplo.invalido',
  'Dropshipping', 2, 'De R$ 100 mil a R$ 150 mil', 120000, 'Delegar para ganhar mais tempo',
  NULL, 68, '${BRK}'::jsonb, 'v2.3', now(),
  'Enterprise', 9, '{"fixture":true}'::jsonb, 'direct_ad', '0.0.0.0',
  'fb.1.0.fixture', 'fb.1.0.fixture', 'fixture-ua', 'https://exemplo.invalido/quiz', 'fixture-session',
  'ig', 'paid_social', 'FIXTURE CAMP', 'FIXTURE AD', 'FIXTURE ADSET',
  'fixture-fbclid', NULL, '1', '2', '3', 'instagram_reels', 'ig'
);`;

try {
  const r = await run(`BEGIN;
    ${INSERT}
    SELECT
      (score_breakdown IS NOT NULL) AS gravou_breakdown,
      (score_version = 'v2.3') AS gravou_versao,
      (score_calculated_at IS NOT NULL) AS gravou_calc,
      score, tier,
      ((score_breakdown->>'faturamento')::int + (score_breakdown->>'mercado')::int
       + (score_breakdown->>'dor_desejo')::int + (score_breakdown->>'compromisso_whatsapp')::int
       + (score_breakdown->>'aceita_call')::int + (score_breakdown->>'entendimento_site')::int) AS soma_breakdown,
      (adset_id IS NOT NULL) AS gravou_adset
    FROM public.leads WHERE id = '${ID}';
  ROLLBACK;`);
  const l = r.find((x) => x && typeof x.score === "number") ?? r.at(-1);
  checar("o insert com as colunas novas foi aceito", !!l, "os 4 triggers BEFORE INSERT rodaram");
  checar("score_breakdown gravou", l?.gravou_breakdown === true);
  checar("score_version gravou", l?.gravou_versao === true, "v2.3");
  checar("score_calculated_at gravou", l?.gravou_calc === true);
  checar("o breakdown e legivel como JSON", typeof l?.soma_breakdown === "number", `soma = ${l?.soma_breakdown}`);
  checar("score e tier continuam gravando", l?.score === 68 && l?.tier === "Enterprise", `${l?.score} / ${l?.tier}`);
  checar("adset_id grava quando a URL manda", l?.gravou_adset === true, "confirma o caminho da Phase 0");
} catch (e) {
  checar("o insert com as colunas novas foi aceito", false, String(e.message).slice(0, 220));
}

const sobrou = await run(`SELECT count(*)::int AS n FROM public.leads WHERE id = '${ID}';`);
checar("nenhum lead de fixture persistiu", (sobrou[0]?.n ?? sobrou.at(-1)?.n) === 0, "ROLLBACK confirmado");

console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhou) process.exit(1);
