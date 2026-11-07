/**
 * O ÚLTIMO TOQUE PAGO NA SESSÃO, E A PRECEDÊNCIA DO GATILHO.
 *
 * Teste da migration 20260918170000. Tudo dentro de BEGIN … ROLLBACK: nenhuma
 * sessão, lead ou visita de produção é criada, e nenhum evento sai para o Meta
 * (o `net.http_post` do gatilho de CAPI é enfileirado em tabela e o ROLLBACK
 * desfaz a fila junto).
 *
 * O que cada bloco prova:
 *   1. As colunas e as funções novas existem.
 *   2. Um clique pago DIFERENTE reescreve o bloco de anúncio da sessão, e o
 *      primeiro toque é arquivado em `primeiro_toque_pago`.
 *   3. Um toque ORGÂNICO (o link da bio) não muda nada e devolve false.
 *   4. O MESMO anúncio de novo não é troca: só completa o que faltava.
 *   5. O valor do NAVEGADOR vence a sessão no insert do lead.
 *   6. O lead sem anúncio resgata o da sessão — que agora é o último toque.
 *   7. Com `session_id`, o caminho por IP NÃO roda: sessão de outra pessoa no
 *      mesmo NAT não contamina.
 *   8. Sem `session_id`, o caminho por IP roda — e nele o valor do lead
 *      continua mandando (era o COALESCE invertido).
 *   9. Macro da Meta não vira dado em nenhum caminho.
 *  10. Nada persistiu.
 *
 * ── ARMADILHA DO TRANSPORTE (18/09/2026) ───────────────────────────────────
 * O endpoint `/database/query` da Management API devolve APENAS o resultado do
 * ÚLTIMO statement da query. Provado:
 *
 *   SELECT 1 AS primeiro; SELECT 2 AS segundo;   →   [{"segundo":2}]
 *
 * A primeira versão deste teste lia o retorno da RPC de um `SELECT
 * atualizar_anuncio_da_sessao(...)` colocado NO MEIO do bloco, e depois lia a
 * sessão. O retorno nunca chegava ao Node — as duas checagens "a RPC devolveu
 * true/false" falhavam com a RPC funcionando perfeitamente (as 8 checagens do
 * estado da sessão, no mesmo bloco, passavam). Era falha do teste, não do
 * banco.
 *
 * A correção: o retorno é carimbado numa TEMP TABLE dentro da transação e sai
 * junto com a leitura final, no mesmo statement. `ON COMMIT DROP` e o ROLLBACK
 * cuidam da limpeza. Quem escrever teste novo aqui: leia o que precisar SEMPRE
 * no último statement.
 *
 * RODE SÓ DEPOIS DE APLICAR a migration 20260918170000.
 *   node --env-file=<...>/formulario-champion.supabase.env scripts/testar-ultimo-toque-pago.mjs
 *   (ou SUPABASE_ACCESS_TOKEN="sbp_..." node scripts/testar-ultimo-toque-pago.mjs)
 */
import fs from "node:fs";

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
  const r = await fetch("https://api.supabase.com/v1/projects/qzzyfohzoxiefwbmtclt/database/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 600));
  return JSON.parse(t);
}

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

const S1 = "00000000-0000-4000-8000-0000000771a1"; // a sessão do lead
const S2 = "00000000-0000-4000-8000-0000000771a2"; // outra pessoa, mesmo IP
const L1 = "00000000-0000-4000-8000-00000007ead1";
const IP = "203.0.113.78"; // faixa reservada para documentação (RFC 5737)

/** Sessão nascida no PRIMEIRO clique: anúncio A. */
const sessaoA = (id = S1, ip = IP) => `
  INSERT INTO public.lead_sessions (id, first_page, last_page, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, campaign_id, adset_id, ad_id, placement_raw, ip_address, device_type, fbclid)
  VALUES ('${id}', '/HD3', '/HD3', 'ig', 'paid_social', 'CAMPANHA A',
    'Nulle #5', 'Case Nulle B', 'CAMP_A', 'ADSET_A', 'AD_A', 'Instagram_Reels', '${ip}', 'mobile', 'fbclid_A');`;

/**
 * Chama a RPC e CARIMBA o retorno numa temp table.
 *
 * O retorno não pode ser lido de um statement do meio: o transporte só entrega
 * o último (ver o cabeçalho). Carimbado aqui, ele sai junto da leitura final.
 */
const chamar = (args) => `
  CREATE TEMP TABLE IF NOT EXISTS retorno_rpc (valor boolean) ON COMMIT DROP;
  DELETE FROM retorno_rpc;
  INSERT INTO retorno_rpc (valor) SELECT public.atualizar_anuncio_da_sessao(${args});`;

/** O segundo clique pago, anúncio B — é a RPC que o navegador chama. */
const cliqueB = (id = S1) => chamar(`'${id}', 'CAMP_B', 'ADSET_B', 'AD_B', NULL,
    'ig', 'paid_social', 'CAMPANHA B', 'Nulle #6', 'Case Nulle C', 'Facebook_Feed', 'fbclid_B', NULL`);

/** A volta pelo link da bio: orgânica. */
const toqueDaBio = (id = S1) => chamar(`'${id}', NULL, NULL, NULL, NULL,
    'ig', 'social', NULL, 'link_in_bio', NULL, NULL, 'fbclid_da_bio', NULL`);

/**
 * Leitura final da sessão, com o retorno da RPC embutido.
 * Só pode ser usada DEPOIS de um `chamar(...)`, que é quem cria a temp table.
 */
const lerSessao = (id = S1) => `
  SELECT coalesce(ad_id,'(nulo)') ad, coalesce(adset_id,'(nulo)') adset,
         coalesce(campaign_id,'(nulo)') camp, coalesce(utm_content,'(nulo)') content,
         coalesce(utm_term,'(nulo)') term, coalesce(placement_raw,'(nulo)') plc,
         coalesce(fbclid,'(nulo)') fbclid, toques_pagos toques,
         coalesce(primeiro_toque_pago->>'ad_id','(nulo)') ad_primeiro,
         (SELECT valor FROM retorno_rpc LIMIT 1) AS trocou
    FROM public.lead_sessions WHERE id = '${id}';`;

/** Insert do lead com o que o NAVEGADOR mandou. */
const lead = ({ id = L1, sid = S1, ad = null, content = null, src = "ig", ip = IP } = {}) => `
  INSERT INTO public.leads (id, nome_completo, whatsapp, instagram, mercado, investimento_faixa, dor_desejo,
    score, tier, raw_answers_json, session_id, ip_address,
    utm_source, utm_medium, utm_campaign, utm_content, campaign_id, adset_id, ad_id)
  VALUES ('${id}', 'FIXTURE ULTIMO TOQUE', '+55000000${id.slice(-4)}', 'fixture', 'Dropshipping',
    'De R$ 100 mil a R$ 150 mil', 'Delegar para ganhar mais tempo',
    80, 'Enterprise', '{"fixture":true}'::jsonb,
    ${sid === null ? "NULL" : `'${sid}'`}, ${ip === null ? "NULL" : `'${ip}'`},
    ${src === null ? "NULL" : `'${src}'`}, 'social', NULL,
    ${content === null ? "NULL" : `'${content}'`}, NULL, NULL,
    ${ad === null ? "NULL" : `'${ad}'`});`;

const lerLead = (id = L1) => `
  SELECT coalesce(ad_id,'(nulo)') ad, coalesce(adset_id,'(nulo)') adset,
         coalesce(campaign_id,'(nulo)') camp, coalesce(utm_content,'(nulo)') content,
         coalesce(placement,'(nulo)') plc, coalesce(attribution_source,'(nulo)') att,
         coalesce(utm_source,'(nulo)') src
    FROM public.leads WHERE id = '${id}';`;

const acharSessao = (r) => r.find((x) => x && x.toques !== undefined) ?? null;
const acharLead = (r) => r.find((x) => x && x.att !== undefined) ?? null;

console.log("═".repeat(72));
console.log("ÚLTIMO TOQUE PAGO NA SESSÃO — migration 20260918170000");
console.log("Tudo em BEGIN … ROLLBACK. Nada persiste.");
console.log("═".repeat(72));

console.log("\n═══ 1. AS PEÇAS EXISTEM ═══\n");
{
  const cols = await sql(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='lead_sessions'
       AND column_name IN ('primeiro_toque_pago','primeiro_toque_em','ultimo_toque_pago_em','toques_pagos');`);
  const tem = (c) => cols.some((x) => x.column_name === c);
  checar("lead_sessions.primeiro_toque_pago existe", tem("primeiro_toque_pago"));
  checar("lead_sessions.primeiro_toque_em existe", tem("primeiro_toque_em"));
  checar("lead_sessions.ultimo_toque_pago_em existe", tem("ultimo_toque_pago_em"));
  checar("lead_sessions.toques_pagos existe", tem("toques_pagos"));

  const fns = await sql(`
    SELECT proname FROM pg_proc
     WHERE proname IN ('atualizar_anuncio_da_sessao','sem_macro','medium_pago','recover_attribution_from_session');`);
  const temFn = (n) => fns.some((x) => x.proname === n);
  checar("função atualizar_anuncio_da_sessao existe", temFn("atualizar_anuncio_da_sessao"));
  checar("função sem_macro existe", temFn("sem_macro"));
  checar("função medium_pago existe", temFn("medium_pago"));

  const precedencia = await sql(`
    SELECT prosrc LIKE '%NEW.session_id IS NOT NULL THEN%NEW.attribution_source := CASE%' AS pula_ip,
           prosrc LIKE '%COALESCE(public.sem_macro(NEW.utm_content),  matched_session.utm_content)%' AS lead_vence
      FROM pg_proc WHERE proname = 'recover_attribution_from_session';`);
  checar("o gatilho já é a versão nova (pula o IP quando há session_id)", precedencia[0]?.pula_ip === true);
  checar("e o valor do lead vence a sessão no caminho por IP", precedencia[0]?.lead_vence === true);
}

console.log("\n═══ 2. CLIQUE PAGO DIFERENTE REESCREVE A SESSÃO ═══");
console.log("O caso do Tiago: Nulle #5 às 13:29, Nulle #6 às 15:24.\n");
{
  const r = await sql(`BEGIN;\n${sessaoA()}\n${cliqueB()}\n${lerSessao()}\nROLLBACK;`);
  const s = acharSessao(r);
  checar("a RPC devolveu true", s?.trocou === true, String(s?.trocou));
  checar("ad_id agora é o do SEGUNDO clique", s?.ad === "AD_B", String(s?.ad));
  checar("adset_id trocou junto", s?.adset === "ADSET_B", String(s?.adset));
  checar("campaign_id trocou junto", s?.camp === "CAMP_B", String(s?.camp));
  checar("utm_content trocou junto", s?.content === "Nulle #6", String(s?.content));
  checar("utm_term trocou junto", s?.term === "Case Nulle C", String(s?.term));
  checar("placement trocou junto (era o campo que ficava do toque velho)", s?.plc === "Facebook_Feed", String(s?.plc));
  checar("fbclid trocou junto (o clique é outro)", s?.fbclid === "fbclid_B", String(s?.fbclid));
  checar("nenhum campo do anúncio A sobrou (nada de Frankenstein)",
    s?.adset !== "ADSET_A" && s?.content !== "Nulle #5" && s?.plc !== "Instagram_Reels");
  checar("o primeiro toque foi ARQUIVADO, não perdido", s?.ad_primeiro === "AD_A", String(s?.ad_primeiro));
  checar("a sessão sabe que viu 2 anúncios", s?.toques === 2, String(s?.toques));
}

console.log("\n═══ 3. A BIO NÃO MEXE EM NADA ═══");
console.log("utm_source=ig e fbclid do app não são identificador pago.\n");
{
  const r = await sql(`BEGIN;\n${sessaoA()}\n${toqueDaBio()}\n${lerSessao()}\nROLLBACK;`);
  const s = acharSessao(r);
  checar("a RPC devolveu false", s?.trocou === false, String(s?.trocou));
  checar("ad_id intacto", s?.ad === "AD_A", String(s?.ad));
  checar("utm_content NÃO virou link_in_bio", s?.content === "Nulle #5", String(s?.content));
  checar("placement intacto", s?.plc === "Instagram_Reels", String(s?.plc));
  checar("fbclid do anúncio intacto", s?.fbclid === "fbclid_A", String(s?.fbclid));
  checar("nada foi arquivado (não houve troca)", s?.ad_primeiro === "(nulo)", String(s?.ad_primeiro));
}

console.log("\n═══ 4. O MESMO ANÚNCIO DE NOVO NÃO É TROCA ═══");
console.log("Recarregar a página não pode contar como segundo clique.\n");
{
  const mesmoAnuncio = chamar(`'${S1}', 'CAMP_A', 'ADSET_A', 'AD_A', NULL,
      'ig', 'paid_social', 'CAMPANHA A', 'Nulle #5', 'Case Nulle B', NULL, 'fbclid_A', NULL`);
  const r = await sql(`BEGIN;\n${sessaoA()}\n${mesmoAnuncio}\n${lerSessao()}\nROLLBACK;`);
  const s = acharSessao(r);
  checar("a RPC devolveu true (aceitou o toque, sem trocar nada)", s?.trocou === true, String(s?.trocou));
  checar("continua com 0 trocas", s?.toques === 0, String(s?.toques));
  checar("nada foi arquivado", s?.ad_primeiro === "(nulo)", String(s?.ad_primeiro));
  checar("o placement que já existia não foi apagado pelo NULL do toque novo",
    s?.plc === "Instagram_Reels", String(s?.plc));
}

console.log("\n═══ 5. O VALOR DO NAVEGADOR VENCE A SESSÃO ═══\n");
{
  const r = await sql(`BEGIN;\n${sessaoA()}\n${cliqueB()}\n${lead({ ad: "AD_DO_NAVEGADOR", content: "Anuncio da vez" })}\n${lerLead()}\nROLLBACK;`);
  const l = acharLead(r);
  checar("ad_id do navegador NÃO é sobrescrito", l?.ad === "AD_DO_NAVEGADOR", String(l?.ad));
  checar("utm_content do navegador NÃO é sobrescrito", l?.content === "Anuncio da vez", String(l?.content));
  checar("e o que faltava veio da sessão (último toque)", l?.adset === "ADSET_B", String(l?.adset));
  checar("placement veio da sessão", l?.plc === "Facebook_Feed", String(l?.plc));
}

console.log("\n═══ 6. LEAD SEM ANÚNCIO RESGATA O ÚLTIMO TOQUE ═══");
console.log("O caso do Emerson, com a sessão já corrigida.\n");
{
  const r = await sql(`BEGIN;\n${sessaoA()}\n${cliqueB()}\n${lead({ content: "link_in_bio" })}\n${lerLead()}\nROLLBACK;`);
  const l = acharLead(r);
  checar("ad_id resgatado é o do SEGUNDO clique", l?.ad === "AD_B", String(l?.ad));
  checar("e não o do primeiro", l?.ad !== "AD_A");
  checar("adset_id resgatado", l?.adset === "ADSET_B", String(l?.adset));
  checar("utm_content 'link_in_bio' conta como vazio e é substituído", l?.content === "Nulle #6", String(l?.content));
  checar("placement resgatado", l?.plc === "Facebook_Feed", String(l?.plc));
}

console.log("\n═══ 7. COM session_id, O CAMINHO POR IP NÃO RODA ═══");
console.log("Dois leads atrás do mesmo NAT não podem trocar de anúncio.\n");
{
  // O lead aponta para S1 (sem anúncio nenhum). S2, MESMO IP, tem anúncio.
  const sessaoVaziaS1 = `
    INSERT INTO public.lead_sessions (id, first_page, last_page, ip_address, device_type)
    VALUES ('${S1}', '/HD3', '/HD3', '${IP}', 'mobile');`;
  const r = await sql(`BEGIN;\n${sessaoVaziaS1}\n${sessaoA(S2)}\n${lead({ sid: S1, src: null })}\n${lerLead()}\nROLLBACK;`);
  const l = acharLead(r);
  checar("não pegou o anúncio da sessão vizinha", l?.ad === "(nulo)", String(l?.ad));
  checar("nem a campanha", l?.camp === "(nulo)", String(l?.camp));
  checar("nem o placement", l?.plc === "(nulo)", String(l?.plc));
  checar("e foi marcado como orgânico, não bio_recovery", l?.att === "organic", String(l?.att));
}

console.log("\n═══ 8. SEM session_id, O IP AINDA SALVA — mas o lead manda ═══\n");
{
  const r = await sql(`BEGIN;\n${sessaoA(S2)}\n${lead({ sid: null, src: null })}\n${lerLead()}\nROLLBACK;`);
  const l = acharLead(r);
  checar("o caminho por IP continua existindo", l?.att === "bio_recovery", String(l?.att));
  checar("e traz o anúncio", l?.ad === "AD_A", String(l?.ad));

  // Agora com o lead trazendo o SEU valor: ele tem que vencer.
  const r2 = await sql(`BEGIN;\n${sessaoA(S2)}\n${lead({ sid: null, src: null, content: "Anuncio que o navegador viu" })}\n${lerLead()}\nROLLBACK;`);
  const l2 = acharLead(r2);
  checar("utm_content do navegador vence o da sessão achada por IP",
    l2?.content === "Anuncio que o navegador viu", String(l2?.content));
  checar("e o que faltava ainda é preenchido", l2?.ad === "AD_A", String(l2?.ad));
}

console.log("\n═══ 9. MACRO NÃO É DADO ═══\n");
{
  const r = await sql(`BEGIN;\n${sessaoA()}\n${lead({ ad: "{{ad.id}}" })}\n${lerLead()}\nROLLBACK;`);
  const l = acharLead(r);
  checar("macro do navegador não sobrevive, e o resgate assume", l?.ad === "AD_A", String(l?.ad));

  const rpcComMacro = chamar(`'${S1}', '{{campaign.id}}', '{{adset.id}}', '{{ad.id}}', NULL,
      'ig', 'paid_social', '{{campaign.name}}', '{{ad.name}}', NULL, '{{placement}}', NULL, NULL`);
  const r2 = await sql(`BEGIN;\n${sessaoA()}\n${rpcComMacro}\n${lerSessao()}\nROLLBACK;`);
  const s = acharSessao(r2);
  checar("macro não reescreve a sessão (nenhum id sobrevive à limpeza)",
    s?.ad === "AD_A" && s?.content === "Nulle #5", `${s?.ad} / ${s?.content}`);
}

console.log("\n═══ 10. NADA PERSISTIU ═══\n");
{
  const r = await sql(`SELECT
    (SELECT count(*)::int FROM public.leads WHERE nome_completo = 'FIXTURE ULTIMO TOQUE') AS leads,
    (SELECT count(*)::int FROM public.lead_sessions WHERE id IN ('${S1}','${S2}')) AS sessoes;`);
  const l = r[0] ?? r.at(-1);
  checar("nenhum lead de fixture", l?.leads === 0, String(l?.leads));
  checar("nenhuma sessão de fixture", l?.sessoes === 0, String(l?.sessoes));
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
