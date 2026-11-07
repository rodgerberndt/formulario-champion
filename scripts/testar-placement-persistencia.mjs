/**
 * Placement: o toque guarda, e o lead resgata quando o navegador não entrega.
 *
 * Tudo dentro de BEGIN ... ROLLBACK. Nenhuma visita, sessão ou lead de produção
 * é criado.
 *
 * O que cada bloco prova:
 *   1. As colunas existem e aceitam o valor bruto da Meta.
 *   2. O lead PRESERVA o placement que o navegador mandou (o caminho feliz).
 *   3. O lead RESGATA o placement da sessão quando o navegador não mandou —
 *      que era exatamente o buraco: 149 leads `direct_ad` e só 1 com placement.
 *   4. O resgate é pelo session_id EXATO, nunca por IP: sessão de outra pessoa
 *      no mesmo IP não contamina.
 *   5. Macro `{{placement}}` não vira dado, em nenhum caminho.
 *   6. Nenhuma regressão em utm_source, campaign_id, adset_id, ad_id e no
 *      attribution_source.
 *
 * Rode com:  node scripts/testar-placement-persistencia.mjs
 */
import fs from "node:fs";

const PAT = fs.readFileSync(
  "C:/Users/Rodge/AppData/Local/Temp/claude/e--Obsidian-conhecimentos/d7f9263c-8419-4a59-8f2a-4a8519bb8404/scratchpad/.pat",
  "utf8",
).trim();

async function sql(query) {
  const r = await fetch("https://api.supabase.com/v1/projects/qzzyfohzoxiefwbmtclt/database/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 500));
  return JSON.parse(t);
}

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

const S1 = "00000000-0000-4000-8000-0000000551a1";
const S2 = "00000000-0000-4000-8000-0000000551a2";
const L1 = "00000000-0000-4000-8000-00000001ead1";
const IP = "203.0.113.77"; // faixa reservada para documentação (RFC 5737)

/** Monta uma sessão de fixture com o placement pedido. */
const sessao = (id, plc) => `
  INSERT INTO public.lead_sessions (id, first_page, last_page, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, campaign_id, adset_id, ad_id, placement_raw, ip_address, device_type)
  VALUES ('${id}', '/HD3', '/HD3', 'ig', 'paid_social', 'CAMP FIXTURE',
    'AD FIXTURE', 'ADSET FIXTURE', '111', '222', '333', ${plc === null ? "NULL" : `'${plc}'`}, '${IP}', 'mobile');`;

/** Monta o insert do lead com o que o NAVEGADOR mandou. */
const lead = ({ id = L1, sid = S1, plc = null, src = "ig" }) => `
  INSERT INTO public.leads (id, nome_completo, whatsapp, instagram, mercado, investimento_faixa, dor_desejo,
    score, tier, raw_answers_json, session_id, ip_address,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    campaign_id, adset_id, ad_id, placement)
  VALUES ('${id}', 'FIXTURE ROLLBACK', '+55000000${id.slice(-4)}', 'fixture', 'Dropshipping',
    'De R$ 100 mil a R$ 150 mil', 'Delegar para ganhar mais tempo',
    80, 'Enterprise', '{"fixture":true}'::jsonb, '${sid}', '${IP}',
    ${src === null ? "NULL" : `'${src}'`}, 'paid_social', 'CAMP FIXTURE', 'AD FIXTURE', 'ADSET FIXTURE',
    '111', '222', '333', ${plc === null ? "NULL" : `'${plc}'`});`;

const lerLead = (id = L1) => `
  SELECT coalesce(placement,'(nulo)') plc, coalesce(attribution_source,'(nulo)') att,
         coalesce(utm_source,'(nulo)') src, coalesce(campaign_id,'(nulo)') camp,
         coalesce(adset_id,'(nulo)') adset, coalesce(ad_id,'(nulo)') ad
    FROM public.leads WHERE id = '${id}';`;

const rodar = async (corpo) => {
  const r = await sql(`BEGIN;\n${corpo}\n${lerLead()}\nROLLBACK;`);
  return r.find((x) => x && x.plc !== undefined) ?? null;
};

console.log("\n═══ 1. AS COLUNAS EXISTEM E GUARDAM O VALOR BRUTO ═══\n");
{
  const cols = await sql(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND column_name IN ('placement_raw','placement')
       AND table_name IN ('landing_hits','lead_sessions','leads') ORDER BY table_name;`);
  const tem = (t, c) => cols.some((x) => x.table_name === t && x.column_name === c);
  checar("landing_hits.placement_raw existe", tem("landing_hits", "placement_raw"));
  checar("lead_sessions.placement_raw existe", tem("lead_sessions", "placement_raw"));
  checar("leads.placement existe", tem("leads", "placement"));

  const r = await sql(`BEGIN;
    INSERT INTO public.landing_hits (path, placement_raw) VALUES ('/FIXTURE-ROLLBACK?utm_placement=Instagram_Reels', 'Instagram_Reels');
    SELECT coalesce(placement_raw,'(nulo)') AS plc FROM public.landing_hits WHERE path = '/FIXTURE-ROLLBACK?utm_placement=Instagram_Reels' LIMIT 1;
  ROLLBACK;`);
  const l = r.find((x) => x && x.plc !== undefined);
  checar("landing_hits guarda o literal da Meta", l?.plc === "Instagram_Reels", String(l?.plc));
}

console.log("\n═══ 2. CAMINHO FELIZ — o navegador mandou, o lead preserva ═══\n");
for (const valor of ["Instagram_Reels", "Facebook_Feed", "an", "Instagram_Stories"]) {
  const l = await rodar(sessao(S1, null) + lead({ plc: valor }));
  checar(`navegador mandou "${valor}" e o lead guardou`, l?.plc === valor, String(l?.plc));
}

console.log("\n═══ 3. O RESGATE — o navegador NÃO mandou, a sessão tinha ═══");
console.log("Era aqui que 148 de 149 leads `direct_ad` perdiam o posicionamento.\n");
{
  const l = await rodar(sessao(S1, "Instagram_Reels") + lead({ plc: null }));
  checar("o lead resgatou o placement da sessão", l?.plc === "Instagram_Reels", String(l?.plc));
  checar("continua marcado como direct_ad", l?.att === "direct_ad", String(l?.att));
}

console.log("\n═══ 4. O RESGATE É PELO TOQUE, NÃO PELO IP ═══");
console.log("Sessão de OUTRA pessoa no MESMO IP não pode contaminar.\n");
{
  // O lead aponta para S1 (sem placement). S2, no mesmo IP, tem placement.
  const l = await rodar(sessao(S1, null) + sessao(S2, "Facebook_Feed") + lead({ sid: S1, plc: null }));
  checar("não pegou o placement da sessão vizinha", l?.plc === "(nulo)", String(l?.plc));
  checar("e continua sem inventar valor", l?.plc !== "Facebook_Feed");
}

console.log("\n═══ 5. MACRO NÃO É DADO ═══\n");
{
  const l1 = await rodar(sessao(S1, null) + lead({ plc: "{{placement}}" }));
  checar("macro vinda do navegador vira NULL", l1?.plc === "(nulo)", String(l1?.plc));
  const l2 = await rodar(sessao(S1, "{{placement}}") + lead({ plc: null }));
  checar("macro guardada na sessão não é resgatada", l2?.plc === "(nulo)", String(l2?.plc));
}

console.log("\n═══ 6. SEM PLACEMENT EM LUGAR NENHUM, CONTINUA NULL ═══\n");
{
  const l = await rodar(sessao(S1, null) + lead({ plc: null }));
  checar("nada é inventado", l?.plc === "(nulo)", String(l?.plc));
}

console.log("\n═══ 7. NENHUMA REGRESSÃO NOS DEMAIS CAMPOS ═══\n");
{
  const l = await rodar(sessao(S1, "Instagram_Reels") + lead({ plc: null }));
  checar("utm_source intacto", l?.src === "ig", String(l?.src));
  checar("campaign_id intacto", l?.camp === "111", String(l?.camp));
  checar("adset_id intacto", l?.adset === "222", String(l?.adset));
  checar("ad_id intacto", l?.ad === "333", String(l?.ad));
  checar("attribution_source intacto", l?.att === "direct_ad", String(l?.att));

  // O caminho longo (sem utm válido) continua fazendo bio_recovery por IP.
  const b = await rodar(sessao(S1, "Instagram_Reels") + lead({ plc: null, src: null }));
  checar("o caminho de bio_recovery continua funcionando", b?.att === "bio_recovery", String(b?.att));
  checar("e ele recupera utm_source da sessão", b?.src === "ig", String(b?.src));
  checar("e o placement também chega por lá", b?.plc === "Instagram_Reels", String(b?.plc));
}

console.log("\n═══ 8. NADA PERSISTIU ═══\n");
{
  const r = await sql(`SELECT
    (SELECT count(*)::int FROM public.leads WHERE nome_completo = 'FIXTURE ROLLBACK') AS leads,
    (SELECT count(*)::int FROM public.lead_sessions WHERE id IN ('${S1}','${S2}')) AS sessoes,
    (SELECT count(*)::int FROM public.landing_hits WHERE path LIKE '/FIXTURE-ROLLBACK%') AS hits;`);
  const l = r[0] ?? r.at(-1);
  checar("nenhum lead de fixture", l?.leads === 0, String(l?.leads));
  checar("nenhuma sessão de fixture", l?.sessoes === 0, String(l?.sessoes));
  checar("nenhuma visita de fixture", l?.hits === 0, String(l?.hits));
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
