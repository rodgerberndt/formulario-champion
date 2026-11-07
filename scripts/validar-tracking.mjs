// Validação do tracking no navegador, do jeito que o curso manda: olhar o
// momento de acionamento de cada evento, não o resumo.
//
//   node scripts/validar-tracking.mjs [url-base]
//
// Abre a landing com um fbclid de teste, e confere:
//   1. o pixel disparou PageView com eventID;
//   2. o beacon landing-hit levou o mesmo pv_event_id + cookies;
//   3. os cookies _fbp/_fbc existem;
//   4. o loader morto do GTM não é mais chamado;
//   5. ao entrar no /quiz, o pixel disparou PageView de novo (rota SPA).
// Não preenche o quiz: lead de teste cria notificação para o time. A parte
// de Lead/MQL/Schedule/MeetingHeld/Purchase se valida no Test Events do
// Gerenciador de Eventos com META_TEST_EVENT_CODE setado (ver README no vault).
import { chromium } from "playwright";

const base = process.argv[2] || "https://www.championadstudio.com";
const b = await chromium.launch();
// UA de navegador de verdade: o fbevents.js não dispara nada quando se identifica como HeadlessChrome.
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
const p = await ctx.newPage();
const pixel = []; const beacons = []; const outros = []; const erros = [];
p.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 160)); });
p.on("pageerror", (e) => erros.push("pageerror: " + String(e).slice(0, 160)));
const respostas = [];
p.on("response", (r) => { if (r.url().includes("/functions/v1/landing-hit") && r.request().method() === "POST") respostas.push(r.status()); });
p.on("request", (r) => {
  const u = r.url();
  if (/facebook\.com\/tr/.test(u)) pixel.push(u);
  else if (u.includes("/functions/v1/landing-hit") && r.method() === "POST") beacons.push(r.postData() || (r.postDataBuffer() ? r.postDataBuffer().toString() : ""));
  else if (/api\.championadstudio\.com|googletagmanager/.test(u)) outros.push(u);
});
await p.goto(`${base}/?utm_source=teste-validacao&fbclid=TESTE_${Date.now()}`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(3000);

const param = (u, k) => new URL(u).searchParams.get(k);
const pvs = pixel.filter((u) => param(u, "ev") === "PageView");
const eids = pvs.map((u) => param(u, "eid"));
console.log("PageView do pixel:", pvs.length, "| eventID:", eids);
const beacon = beacons.map((x) => { try { return JSON.parse(x); } catch { return null; } }).find(Boolean);
console.log("beacon landing-hit: pedidos=" + beacons.length + " respostas=" + JSON.stringify(respostas), beacon ? { pv_event_id: beacon.pv_event_id, fbp: beacon.fbp, fbc: beacon.fbc, page_url: beacon.page_url } : "NÃO ENVIADO");
const cookies = await ctx.cookies();
console.log("cookies:", cookies.filter((c) => /^_fb[pc]$|champion_index/.test(c.name)).map((c) => c.name + "=" + c.value.slice(0, 40)));
console.log("erros de console:", erros.length ? erros : "nenhum");
console.log("loader morto chamado:", outros.length ? outros : "não (ok)");
// O sendBeacon manda um Blob e o Playwright não expõe o corpo: quando o
// pedido saiu e voltou 200, o id só se confere no banco (landing_hits.pv_event_id).
const okDedup = beacon ? eids.includes(beacon.pv_event_id) : (beacons.length > 0 && respostas.includes(200));
console.log(okDedup ? (beacon ? "OK: pixel e servidor com o mesmo PageView event_id" : "OK: beacon enviado e aceito (200); conferir pv_event_id em landing_hits") : "FALHA: beacon não saiu ou event_id não bate");

pixel.length = 0;
await p.goto(`${base}/quiz`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await p.waitForTimeout(2500);
console.log("PageView no /quiz (carga direta):", pixel.filter((u) => param(u, "ev") === "PageView").length);
await b.close();
