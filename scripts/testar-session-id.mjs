/**
 * O session_id sobrevive da chegada até o envio, com navegador de verdade.
 *
 * O defeito de 11/09/2026 não era o id deixar de nascer — ele nasce em 93% a
 * 100% das visitas, conforme o ambiente. Era o id NÃO CHEGAR ao insert do lead
 * quando o Web Storage evaporava no meio da visita, o que acontece no navegador
 * embutido do Instagram no iOS. Os dois leads afetados tinham a sessão inteira
 * gravada e o evento `submit` com o id certo um segundo depois.
 *
 * Por isso o cenário decisivo aqui é o 3: APAGAR localStorage e sessionStorage
 * e recarregar. Antes da correção o id trocava — e trocar é pior que faltar,
 * porque parte a jornada em duas pessoas diferentes. Depois, o cookie de
 * domínio (que guarda O MESMO id, não uma heurística) devolve o original.
 *
 * As chamadas ao Supabase são interceptadas: o teste lê o corpo do POST de
 * `lead_sessions` para saber qual id seria gravado, e então ABORTA. Nenhuma
 * sessão, visita ou lead é criado.
 *
 * Rode com:  node scripts/testar-session-id.mjs [url-base]
 * Sem argumento, usa http://localhost:4173 (vite preview).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:4173";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

const QUERY_COMPLETA =
  "utm_source=ig&utm_medium=paid_social&utm_campaign=CA+05+-+Validados+-+Leads&utm_content=Case+Ighor+%234" +
  "&utm_term=SH0&utm_placement=Instagram_Reels&campaign_id=120252040734020116" +
  "&adset_id=120252041120300116&ad_id=120252041120330116";
const QUERY_PARCIAL = "utm_source=ig&utm_medium=paid_social";

const AMBIENTES = [
  {
    rot: "Instagram iOS webview",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G83 Instagram 445.0.0.34.44 (iPhone14,3; iOS 26_6_1; pt_BR)",
  },
  {
    rot: "Instagram Android webview",
    ua: "Mozilla/5.0 (Linux; Android 15; 2311DRK48G Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/153.0.0.0 Mobile Safari/537.36 Instagram 445.0.0.34.44",
  },
  {
    rot: "Chrome desktop",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  },
  {
    rot: "Safari iOS",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1",
  },
];

const navegador = await chromium.launch();

/**
 * Abre um contexto isolado que nunca fala com o Supabase de verdade, mas
 * guarda o corpo de cada POST para o teste inspecionar.
 */
async function abrirContexto(ua, { sabotarStorage = false } = {}) {
  const contexto = await navegador.newContext({ userAgent: ua });
  const corpos = [];
  await contexto.route("**/*supabase.co/**", async (rota) => {
    const req = rota.request();
    let corpo = null;
    try { corpo = req.postData(); } catch { /* sendBeacon nem sempre expõe */ }
    corpos.push({ url: req.url(), corpo });
    await rota.abort("failed");
  });
  if (sabotarStorage) {
    // Reproduz armazenamento BLOQUEADO (levanta exceção), que é o
    // comportamento de webview com dados de site desligados — diferente de
    // armazenamento apenas vazio.
    await contexto.addInitScript(() => {
      const explodir = () => { throw new DOMException("negado", "SecurityError"); };
      const morto = { getItem: explodir, setItem: explodir, removeItem: explodir, clear: explodir, key: explodir, length: 0 };
      try { Object.defineProperty(window, "localStorage", { get: () => morto, configurable: true }); } catch { /* ignore */ }
      try { Object.defineProperty(window, "sessionStorage", { get: () => morto, configurable: true }); } catch { /* ignore */ }
    });
  }
  return { contexto, corpos };
}

const lerCookieSid = async (contexto) => {
  const c = (await contexto.cookies()).find((x) => x.name === "champion_index");
  return c ? decodeURIComponent(c.value) : null;
};

const lerLs = (pagina) =>
  pagina.evaluate(() => { try { return localStorage.getItem("champion_session_id"); } catch { return null; } }).catch(() => null);

/** Qual id o POST de `lead_sessions` levaria ao banco. */
const idDaSessaoNoPost = (corpos) => {
  for (const c of corpos) {
    if (!c.corpo || !/lead_sessions/.test(c.url)) continue;
    try {
      const j = JSON.parse(c.corpo);
      if (j && j.id) return j.id;
    } catch { /* ignore */ }
  }
  return null;
};

for (const amb of AMBIENTES) {
  console.log(`\n═══════════ ${amb.rot} ═══════════`);
  const { contexto, corpos } = await abrirContexto(amb.ua);
  const pagina = await contexto.newPage();

  // ── 1. chegada com URL completa
  await pagina.goto(`${BASE}/?${QUERY_COMPLETA}`, { waitUntil: "domcontentloaded" });
  const cookieImediato = await lerCookieSid(contexto);
  checar("1) o cookie já existe ANTES de qualquer espera (submit rápido)", !!cookieImediato && UUID.test(cookieImediato), String(cookieImediato));

  await pagina.waitForTimeout(1500);
  const original = await lerCookieSid(contexto);
  const noLs = await lerLs(pagina);
  checar("1) cookie e localStorage carregam o MESMO id", !!original && original === noLs, `cookie=${original} ls=${noLs}`);
  checar("1) o id é UUID v4 de verdade", UUID.test(String(original)), String(original));
  checar("1) o id não mudou entre o primeiro byte e o React", cookieImediato === original, `${cookieImediato} -> ${original}`);

  const noPost = idDaSessaoNoPost(corpos);
  checar("1) é o mesmo id que iria para lead_sessions", noPost === original, `post=${noPost} cookie=${original}`);

  // ── 2. navegação interna (SPA), sem recarregar
  await pagina.evaluate(() => window.history.pushState({}, "", "/quiz")).catch(() => {});
  await pagina.waitForTimeout(800);
  checar("2) sobrevive à navegação no SPA", (await lerCookieSid(contexto)) === original, String(await lerCookieSid(contexto)));

  // ── 3. O CENÁRIO DO DEFEITO: Web Storage some no meio da visita
  await pagina.evaluate(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
  }).catch(() => {});
  const lsAposLimpeza = await lerLs(pagina);
  checar("3) o localStorage foi mesmo esvaziado (o teste é válido)", lsAposLimpeza === null, String(lsAposLimpeza));

  await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1500);
  const depois = await lerCookieSid(contexto);
  checar("3) APÓS storage varrido + reload sem parâmetros, o id é o MESMO", depois === original, `${original} -> ${depois}`);
  checar("3) e voltou para o localStorage", (await lerLs(pagina)) === original, String(await lerLs(pagina)));

  // ── 4. recarga completa comum, com parâmetros de novo
  await pagina.goto(`${BASE}/?${QUERY_PARCIAL}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1200);
  checar("4) URL parcial não cunha id novo", (await lerCookieSid(contexto)) === original, String(await lerCookieSid(contexto)));

  await contexto.close();
}

console.log("\n═══════════ ARMAZENAMENTO BLOQUEADO (webview sem dados de site) ═══════════");
console.log("localStorage e sessionStorage levantam exceção em toda chamada.\n");
for (const amb of [AMBIENTES[0], AMBIENTES[3]]) {
  const { contexto, corpos } = await abrirContexto(amb.ua, { sabotarStorage: true });
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/?${QUERY_COMPLETA}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1800);

  const cookie = await lerCookieSid(contexto);
  checar(`${amb.rot}: a página não quebrou e o id nasceu`, !!cookie && UUID.test(cookie), String(cookie));

  const noPost = idDaSessaoNoPost(corpos);
  checar(`${amb.rot}: lead_sessions receberia esse mesmo id`, !!noPost && noPost === cookie, `post=${noPost} cookie=${cookie}`);

  // Com o storage morto, o cookie é a ÚNICA memória entre cargas.
  await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1200);
  checar(`${amb.rot}: e sobrevive ao reload só pelo cookie`, (await lerCookieSid(contexto)) === cookie, String(await lerCookieSid(contexto)));

  await contexto.close();
}

console.log("\n═══════════ NADA É INVENTADO ═══════════");
console.log("Sem cookie e sem storage o id é NOVO e aleatório — nunca derivado de IP ou user agent.\n");
{
  const a = await abrirContexto(AMBIENTES[0].ua);
  const pa = await a.contexto.newPage();
  await pa.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pa.waitForTimeout(1200);
  const idA = await lerCookieSid(a.contexto);

  const b = await abrirContexto(AMBIENTES[0].ua); // MESMO user agent, mesmo IP
  const pb = await b.contexto.newPage();
  await pb.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pb.waitForTimeout(1200);
  const idB = await lerCookieSid(b.contexto);

  checar("dois visitantes com o MESMO user agent recebem ids diferentes", !!idA && !!idB && idA !== idB, `${idA} vs ${idB}`);
  await a.contexto.close();
  await b.contexto.close();
}

await navegador.close();

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
