/**
 * Suíte de confiabilidade do nascimento de lead no CAPI.
 *
 *   node scripts/testar-capi-confiabilidade.mjs             # tudo
 *   node scripts/testar-capi-confiabilidade.mjs --estrutura  # só o que não escreve
 *
 * SEGURANÇA: antes de criar qualquer lead de teste, o script liga
 * `capi_infra_config.test_event_code`. Com ele, todo evento despachado vai para
 * o Test Events do Gerenciador e NÃO entra no conjunto de dados vivo — nenhuma
 * conversão falsa é inventada para o Meta. O `finally` desliga mesmo se o
 * script morrer no meio, e apaga tudo que criou.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "").trim()]; })
);
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const CODIGO_TESTE = "TESTE_CONFIAB";
const MARCA = "ZZTESTE_CAPI";

let ok = 0, falhou = 0, pulou = 0;
const t = (nome, cond, detalhe = "") => {
  if (cond === null) { pulou++; console.log(`  - ${nome}${detalhe ? " — " + detalhe : ""}`); return; }
  if (cond) { ok++; console.log(`  OK   ${nome}`); }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`); }
};

async function rest(path, opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation", ...(opts.headers || {}),
    },
  });
  const txt = await r.text();
  let body = null;
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  return { status: r.status, body };
}
const rpc = (nome, args = {}) => rest(`rpc/${nome}`, { method: "POST", body: JSON.stringify(args) });
const fn = async (nome, body) => {
  const r = await fetch(`${URL_}/functions/v1/${nome}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const criados = { leads: [], sessoes: [] };

async function limpar() {
  for (const id of criados.leads) {
    await rest(`capi_events_log?lead_id=eq.${id}`, { method: "DELETE" });
    await rest(`capi_event_claims?lead_id=eq.${id}`, { method: "DELETE" });
    await rest(`capi_dispatch_log?lead_id=eq.${id}`, { method: "DELETE" });
    await rest(`leads?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of criados.sessoes) await rest(`lead_sessions?id=eq.${id}`, { method: "DELETE" });
}

async function criarSessao(ip) {
  const id = crypto.randomUUID();
  const r = await rest("lead_sessions", {
    method: "POST",
    body: JSON.stringify([{ id, ip_address: ip, user_agent: `${MARCA}/1.0`, first_page: "/HD3" }]),
  });
  if (r.status >= 300) throw new Error(`sessao: ${r.status} ${JSON.stringify(r.body)}`);
  criados.sessoes.push(id);
  return id;
}

async function criarLead({ sessionId = null, ip = null, idadeMin = 0 } = {}) {
  const id = crypto.randomUUID();
  const linha = {
    id,
    nome_completo: `${MARCA} ${id.slice(0, 6)}`,
    whatsapp: `+5511${Math.floor(9e7 + Math.random() * 1e7)}`,
    email: `${MARCA.toLowerCase()}.${id.slice(0, 6)}@exemplo-invalido.test`,
    // NOT NULL sem default em `leads`: instagram, mercado e dor_desejo.
    instagram: `@${MARCA.toLowerCase()}`,
    mercado: "Outro",
    dor_desejo: `${MARCA} — linha de teste automatizado, removida no fim da suite.`,
    investimento_faixa: "De R$ 5 mil a R$ 10 mil",
    tier: "Medium",
    score: 40,
    ip_address: ip,
    session_id: sessionId,
    ...(idadeMin ? { created_at: new Date(Date.now() - idadeMin * 60000).toISOString() } : {}),
  };
  const r = await rest("leads", { method: "POST", body: JSON.stringify([linha]) });
  if (r.status >= 300) throw new Error(`lead: ${r.status} ${JSON.stringify(r.body)}`);
  criados.leads.push(id);
  return id;
}

console.log(`\n=== Confiabilidade do CAPI — ${new Date().toISOString()} ===\n`);

let temInfra = false;
try {
  console.log("1) ESTRUTURA");
  const cfg = await rest("capi_infra_config?select=*");
  temInfra = cfg.status === 200 && Array.isArray(cfg.body) && cfg.body.length === 1;
  t("capi_infra_config existe com 1 linha", temInfra, `status ${cfg.status}`);
  if (temInfra) {
    t("function_base_url preenchida", !!cfg.body[0].function_base_url);
    t("anon_key preenchida", !!cfg.body[0].anon_key);
    t("gatilho_ativo = true", cfg.body[0].gatilho_ativo === true);
    t("test_event_code desligado em repouso", cfg.body[0].test_event_code == null, `veio ${cfg.body[0].test_event_code}`);
  }
  const dl = await rest("capi_dispatch_log?select=id&limit=1");
  t("capi_dispatch_log existe", dl.status === 200, `status ${dl.status}`);
  const rc = await rpc("reconciliar_capi_leads", { p_horas: 1, p_max: 0 });
  t("reconciliar_capi_leads exposta", rc.status === 200, `status ${rc.status} ${JSON.stringify(rc.body).slice(0, 140)}`);

  if (!temInfra) {
    console.log("\n>> Migration 20260909180000 NAO aplicada. Os testes de comportamento nao rodam.");
    console.log(">> SUPABASE_ACCESS_TOKEN=sbp_... node scripts/aplicar-migrations.mjs 20260909180000_capi_gatilho_e_reconciliacao.sql\n");
  }
  if (process.argv.includes("--estrutura") || !temInfra) throw { pular: true };

  await rest("capi_infra_config?id=eq.1", { method: "PATCH", body: JSON.stringify({ test_event_code: CODIGO_TESTE }) });
  console.log(`\n(modo teste LIGADO: eventos vao para o Test Events, codigo ${CODIGO_TESTE})`);

  console.log("\n2) PROPAGACAO DE IP DA SESSAO PARA O LEAD");
  const s1 = await criarSessao("203.0.113.10");
  const l1 = await criarLead({ sessionId: s1, ip: null });
  const v1 = (await rest(`leads?id=eq.${l1}&select=ip_address,user_agent`)).body[0];
  t("lead nasce com o IP da sessao", v1.ip_address === "203.0.113.10", `veio ${v1.ip_address}`);
  t("lead nasce com o user agent da sessao", String(v1.user_agent || "").includes(MARCA), `veio ${v1.user_agent}`);
  const l1b = await criarLead({ sessionId: s1, ip: "198.51.100.1" });
  const v1b = (await rest(`leads?id=eq.${l1b}&select=ip_address`)).body[0];
  t("IP vindo do front nao e sobrescrito", v1b.ip_address === "198.51.100.1", `veio ${v1b.ip_address}`);
  const l1c = await criarLead({ sessionId: null, ip: null });
  t("lead sem sessao continua entrando", !!l1c);

  console.log("\n3) NAVEGADOR SOME (o caso do lead 77d9204a)");
  const s2 = await criarSessao("203.0.113.20");
  const l2 = await criarLead({ sessionId: s2 });
  await dorme(2000);
  const d2 = (await rest(`capi_dispatch_log?lead_id=eq.${l2}&select=origem,status,request_id`)).body || [];
  t("gatilho despachou sem o front", d2.some((x) => x.origem === "trigger" && x.status === "despachado"), JSON.stringify(d2));
  await dorme(10000);
  const c2 = (await rest(`leads?id=eq.${l2}&select=capi_events_sent`)).body[0].capi_events_sent || {};
  t("evento Lead marcado no lead", c2.Lead === true, JSON.stringify(c2));
  const lg2 = (await rest(`capi_events_log?lead_id=eq.${l2}&select=event_name,status,test_event_code`)).body || [];
  t("log registrou os envios", lg2.filter((x) => x.status === "sent").length >= 2, JSON.stringify(lg2.map((x) => `${x.event_name}:${x.status}`)));
  t("nenhum envio vazou para o conjunto vivo", lg2.every((x) => x.status !== "sent" || x.test_event_code === CODIGO_TESTE), JSON.stringify(lg2.map((x) => x.test_event_code)));

  console.log("\n4) NAVEGADOR E SERVIDOR CONCORRENDO");
  const s3 = await criarSessao("203.0.113.30");
  const l3 = await criarLead({ sessionId: s3 });
  const ids = Object.fromEntries(["CompleteRegistration", "Lead", "MQL", "Sprint"].map((e) => [e, `${l3}_${e}`]));
  const rajada = await Promise.all([
    fn("fire-capi-events", { lead_db_id: l3, caller: "front", event_ids: ids, test_event_code: CODIGO_TESTE }),
    fn("fire-capi-events", { lead_db_id: l3, caller: "kommo", test_event_code: CODIGO_TESTE }),
    fn("fire-capi-events", { lead_db_id: l3, caller: "retro", test_event_code: CODIGO_TESTE }),
  ]);
  t("as 3 chamadas responderam 200", rajada.every((r) => r.status === 200), JSON.stringify(rajada.map((r) => r.status)));
  await dorme(5000);
  const lg3 = (await rest(`capi_events_log?lead_id=eq.${l3}&select=event_name,status`)).body || [];
  const porNome = {};
  for (const e of lg3.filter((x) => x.status === "sent")) porNome[e.event_name] = (porNome[e.event_name] || 0) + 1;
  const duplicados = Object.entries(porNome).filter(([, n]) => n > 1);
  t("nenhum evento enviado duas vezes", duplicados.length === 0, `duplicados: ${JSON.stringify(duplicados)}`);
  t("houve dedup registrada", lg3.some((x) => x.status === "deduplicated" || x.status === "skipped"), JSON.stringify(lg3.map((x) => x.status)));
  const cl3 = (await rest(`capi_event_claims?lead_id=eq.${l3}&select=event_id,sent_at`)).body || [];
  t("toda reserva foi confirmada", cl3.length > 0 && cl3.every((c) => c.sent_at), JSON.stringify(cl3));

  console.log("\n5) RESERVA ORFA E REPROCESSAMENTO");
  const s4 = await criarSessao("203.0.113.40");
  await rest("capi_infra_config?id=eq.1", { method: "PATCH", body: JSON.stringify({ gatilho_ativo: false }) });
  const l4 = await criarLead({ sessionId: s4, idadeMin: 5 });
  await dorme(1000);
  const d4a = (await rest(`capi_dispatch_log?lead_id=eq.${l4}&select=status`)).body || [];
  t("gatilho desligado nao despacha", d4a.every((x) => x.status !== "despachado"), JSON.stringify(d4a));
  await rest("capi_event_claims", {
    method: "POST",
    body: JSON.stringify([{
      event_id: `${l4}_Lead`, event_name: "Lead", lead_id: l4, caller: "orfa-simulada",
      claimed_at: new Date(Date.now() - 20 * 60000).toISOString(),
    }]),
  });
  await rest("capi_infra_config?id=eq.1", { method: "PATCH", body: JSON.stringify({ gatilho_ativo: true }) });
  const rec = await rpc("reconciliar_capi_leads", { p_horas: 1, p_max: 10 });
  const res = Array.isArray(rec.body) ? rec.body[0] : rec.body;
  t("reconciliacao achou o lead pendente", (res?.pendentes ?? 0) >= 1, JSON.stringify(res));
  t("reconciliacao soltou a reserva orfa", (res?.orfas_soltas ?? 0) >= 1, JSON.stringify(res));
  await dorme(10000);
  const c4 = (await rest(`leads?id=eq.${l4}&select=capi_events_sent`)).body[0].capi_events_sent || {};
  t("lead abandonado foi reprocessado", c4.Lead === true, JSON.stringify(c4));
  const d4b = (await rest(`capi_dispatch_log?lead_id=eq.${l4}&select=origem,status`)).body || [];
  t("despacho veio da reconciliacao", d4b.some((x) => x.origem === "reconciliacao" && x.status === "despachado"), JSON.stringify(d4b));

  console.log("\n6) BATIMENTO CARDIACO");
  const antes = ((await rest("capi_dispatch_log?origem=eq.reconciliacao&select=id&order=id.desc&limit=1")).body || [])[0]?.id ?? 0;
  await rpc("reconciliar_capi_leads", { p_horas: 1, p_max: 5 });
  const depois = ((await rest("capi_dispatch_log?origem=eq.reconciliacao&select=id&order=id.desc&limit=1")).body || [])[0]?.id ?? 0;
  t("varredura sem pendencia ainda deixa linha", depois > antes, `${antes} -> ${depois}`);
} catch (e) {
  if (!e?.pular) { falhou++; console.log(`\nERRO: ${e?.message || e}`); }
} finally {
  if (temInfra) {
    await rest("capi_infra_config?id=eq.1", {
      method: "PATCH",
      body: JSON.stringify({ test_event_code: null, gatilho_ativo: true, reconcilia_ativa: true }),
    });
    console.log("\n(modo teste DESLIGADO)");
  }
  await limpar();
  const sobra = (await rest(`leads?nome_completo=like.${MARCA}*&select=id`)).body;
  console.log(`limpeza: ${criados.leads.length} leads e ${criados.sessoes.length} sessoes removidos | sobras: ${Array.isArray(sobra) ? sobra.length : "?"}`);
  console.log(`\n=== ${ok} passaram | ${falhou} falharam | ${pulou} pulados ===\n`);
  process.exit(falhou ? 1 : 0);
}
