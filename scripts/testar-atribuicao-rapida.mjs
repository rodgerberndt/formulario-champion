/**
 * A atribuição da lista continua devolvendo o MESMO resultado depois que o join
 * saiu do TypeScript e foi para o banco (migration 20260918200000)?
 *
 * Reimplementa aqui os dois caminhos — o antigo (duas consultas) e o novo (uma
 * RPC) — e compara lead a lead. Não basta a RPC devolver as mesmas linhas: o
 * que importa é o veredito final de cada lead (criativo, campanha, página de
 * entrada e método), porque é isso que a tela mostra e o que decide teste A/B.
 */
import fs from "node:fs";

const base = "E:/Obsidian/conhecimentos/01-Projetos/formulario-champion";
const env = Object.fromEntries(
  fs.readFileSync(`${base}/.env`, "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const U = env.VITE_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const TOL = 3 * 60_000;
const COLS = "id,ip_address,fbp,utm_content,utm_campaign,first_page,created_at";
const PLACEHOLDERS = new Set(["(not set)", "direct", "none", "undefined", "null", "-"]);
const usavel = (v) => typeof v === "string" && v.trim() && !PLACEHOLDERS.has(v.trim().toLowerCase()) && !/\{\{|\}\}/.test(v.trim());

const get = (p) => fetch(`${U}/rest/v1/${p}`, { headers: H }).then((r) => r.json());

/** O casamento lead x submit, idêntico nos dois caminhos. */
function casar(leads, ordenados, porId) {
  const res = new Map();
  const perto = (alvo) => {
    if (!ordenados.length) return null;
    let lo = 0, hi = ordenados.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ordenados[m].t < alvo) lo = m + 1; else hi = m; }
    let melhor = null;
    for (const i of [lo - 1, lo, lo + 1]) {
      const c = ordenados[i]; if (!c) continue;
      if (!melhor || Math.abs(c.t - alvo) < Math.abs(melhor.t - alvo)) melhor = c;
    }
    return !melhor || Math.abs(melhor.t - alvo) > TOL ? null : melhor.sid;
  };
  for (const l of leads) {
    const alvo = Date.parse(l.created_at);
    if (Number.isNaN(alvo)) continue;
    const s = porId.get(perto(alvo));
    if (s) res.set(l.id, {
      utm_content: usavel(s.utm_content) ? s.utm_content : null,
      utm_campaign: usavel(s.utm_campaign) ? s.utm_campaign : null,
      first_page: s.first_page || null, method: "submit",
    });
  }
  return res;
}

async function antigo(leads, from, to) {
  const ev = await get(`lead_events?select=session_id,created_at&event_name=eq.submit&created_at=gte.${from}&created_at=lte.${to}&limit=1000`);
  const ord = ev.filter((e) => e.session_id && e.created_at)
    .map((e) => ({ t: Date.parse(e.created_at), sid: e.session_id })).sort((a, b) => a.t - b.t);
  const sids = [...new Set(ord.map((o) => o.sid))];
  const lotes = []; for (let i = 0; i < sids.length; i += 150) lotes.push(sids.slice(i, i + 150));
  const ses = (await Promise.all(lotes.map((l) => get(`lead_sessions?select=${COLS}&id=in.(${l.join(",")})`)))).flat();
  return casar(leads, ord, new Map(ses.map((s) => [s.id, s])));
}

async function novo(leads, from, to) {
  const r = await fetch(`${U}/rest/v1/rpc/submits_com_sessao`, {
    method: "POST", headers: H, body: JSON.stringify({ p_from: from, p_to: to }),
  });
  const linhas = await r.json();
  if (!Array.isArray(linhas)) throw new Error(`RPC falhou: ${JSON.stringify(linhas)}`);
  const ord = linhas.filter((l) => l.session_id && l.submit_at)
    .map((l) => ({ t: Date.parse(l.submit_at), sid: l.session_id })).sort((a, b) => a.t - b.t);
  const porId = new Map(linhas.map((l) => [l.session_id, {
    id: l.session_id, ip_address: l.ip_address, fbp: l.fbp,
    utm_content: l.utm_content, utm_campaign: l.utm_campaign,
    first_page: l.first_page, created_at: l.sessao_em,
  }]));
  return casar(leads, ord, porId);
}

let passou = 0, falhou = 0;
const erro = (m) => { console.log(`  ✗ ${m}`); falhou++; };
const ok = (m) => { console.log(`  ✓ ${m}`); passou++; };

for (const dias of [7, 30, 90, 365]) {
  const from = new Date(Date.now() - dias * 864e5).toISOString(), to = new Date().toISOString();
  const leads = await get(`leads?select=id,created_at,fbp,ip_address&created_at=gte.${from}&order=created_at.desc&limit=1000`);
  const tA = performance.now(); const a = await antigo(leads, from, to); const msA = performance.now() - tA;
  const tB = performance.now(); const b = await novo(leads, from, to); const msB = performance.now() - tB;

  console.log(`\n── ${dias} dias · ${leads.length} leads ──`);
  if (a.size === b.size) ok(`mesma quantidade de leads atribuídos: ${a.size}`);
  else erro(`quantidade diferente: antigo ${a.size}, novo ${b.size}`);

  let dif = 0;
  for (const [id, va] of a) {
    const vb = b.get(id);
    if (!vb || vb.utm_content !== va.utm_content || vb.utm_campaign !== va.utm_campaign
        || vb.first_page !== va.first_page || vb.method !== va.method) {
      dif++;
      if (dif <= 3) console.log(`      lead ${id}: antigo=${JSON.stringify(va)} novo=${JSON.stringify(vb)}`);
    }
  }
  if (dif === 0) ok(`veredito idêntico para os ${a.size} leads`);
  else erro(`${dif} leads com veredito diferente`);

  for (const [id] of b) if (!a.has(id)) { erro(`lead ${id} atribuído só no caminho novo`); break; }

  const ganho = msA > 0 ? (100 - 100 * msB / msA).toFixed(0) : "0";
  if (msB < msA) ok(`mais rápido: ${msA.toFixed(0)} ms -> ${msB.toFixed(0)} ms (${ganho}%)`);
  else erro(`ficou mais lento: ${msA.toFixed(0)} ms -> ${msB.toFixed(0)} ms`);
}

console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
