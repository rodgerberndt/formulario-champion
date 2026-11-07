/**
 * Placement: da URL até o lead, com navegador de verdade.
 *
 * O defeito corrigido em 11/09/2026 só aparecia no SEGUNDO carregamento: a
 * recuperação por bio sobrescrevia o sessionStorage com `placement: null`
 * cravado. Um teste que só abre a página uma vez passaria com o bug presente.
 * Por isso cada fixture aqui é exercitada em três momentos:
 *
 *   1. chegada pelo anúncio, com os parâmetros na URL
 *   2. navegação interna (SPA, sem recarregar)
 *   3. RECARREGAMENTO numa URL SEM parâmetros — o momento do bug
 *
 * As chamadas de rede para o Supabase são abortadas: o teste não cria lead,
 * sessão nem visita. O que ele lê é o estado que o navegador guardou, que é
 * exatamente o que o insert do lead usa (`getUtmForDb`).
 *
 * O que ele NÃO cobre: `champion_attribution` no localStorage. O hook
 * `useAttribution` existe mas não está montado em nenhuma página, então esse
 * armazenamento nunca é escrito. Fica registrado como achado, não testado aqui.
 *
 * Rode com:  node scripts/testar-placement.mjs [url-base]
 * Sem argumento, usa http://localhost:4173 (vite preview).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:4173";

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

const FIXTURES = [
  {
    rot: "Instagram Reels",
    query: "utm_source=ig&utm_medium=paid_social&utm_campaign=CA+05+-+Validados+-+Leads&utm_content=Case+Ighor+%234&utm_term=SH0&utm_placement=Instagram_Reels&campaign_id=120252040734020116&adset_id=120252041120300116&ad_id=120252041120330116",
    esperado: "Instagram_Reels",
  },
  {
    rot: "Facebook Feed",
    query: "utm_source=fb&utm_medium=paid_social&utm_campaign=Camp+Teste&utm_content=Ad+Teste&utm_placement=Facebook_Feed&campaign_id=111&adset_id=222&ad_id=333",
    esperado: "Facebook_Feed",
  },
  {
    rot: "Audience Network (an)",
    query: "utm_source=an&utm_medium=paid_social&utm_campaign=Camp+Teste&utm_content=Ad+Teste&utm_placement=an&campaign_id=111&adset_id=222&ad_id=333",
    esperado: "an",
  },
  {
    rot: "legado: placement sem utm_",
    query: "utm_source=ig&utm_medium=paid_social&utm_campaign=Camp+Teste&placement=Instagram_Stories&campaign_id=111&ad_id=333",
    esperado: "Instagram_Stories",
  },
  {
    rot: "macro nao expandida",
    query: "utm_source=ig&utm_medium=paid_social&utm_campaign=Camp+Teste&utm_placement=%7B%7Bplacement%7D%7D&campaign_id=111",
    esperado: null,
  },
  {
    rot: "sem placement nenhum",
    query: "utm_source=ig&utm_medium=paid_social&utm_campaign=Camp+Teste&campaign_id=111&ad_id=333",
    esperado: null,
  },
];

const navegador = await chromium.launch();

/**
 * Lê o estado guardado pelo navegador.
 *
 * Com retry porque a própria SPA navega depois do `domcontentloaded` (rota que
 * redireciona, variante que troca de página), e isso destrói o contexto de
 * execução no meio do `evaluate`. Sem o retry o teste falha por corrida, não
 * por defeito do produto.
 */
async function lerEstado(pagina, tentativas = 4) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await pagina.evaluate(() => {
        const ler = (chave, store) => { try { const v = store.getItem(chave); return v ? JSON.parse(v) : null; } catch { return null; } };
        return {
          utm: ler("champion_utm", sessionStorage),
          attribution: ler("champion_attribution", localStorage),
        };
      });
    } catch {
      await pagina.waitForTimeout(700);
    }
  }
  return { utm: null, attribution: null };
}

for (const f of FIXTURES) {
  console.log(`\n═══ ${f.rot} ═══`);
  const contexto = await navegador.newContext();
  // Nada de rede para o backend: o teste não cria lead, sessão nem visita.
  await contexto.route("**/*supabase.co/**", (r) => r.abort("failed"));
  const pagina = await contexto.newPage();

  // ── 1. chegada pelo anúncio
  await pagina.goto(`${BASE}/?${f.query}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1200);
  let e = await lerEstado(pagina);
  const esperadoTxt = f.esperado ?? "null";
  checar(`1) na chegada, sessionStorage.placement = ${esperadoTxt}`, (e.utm?.placement ?? null) === f.esperado, `veio ${JSON.stringify(e.utm?.placement ?? null)}`);

  // ── 2. navegação interna, sem recarregar
  await pagina.evaluate(() => window.history.pushState({}, "", "/quiz")).catch(() => {});
  await pagina.waitForTimeout(900);
  e = await lerEstado(pagina);
  checar(`2) depois de navegar no SPA, continua ${esperadoTxt}`, (e.utm?.placement ?? null) === f.esperado, `veio ${JSON.stringify(e.utm?.placement ?? null)}`);

  // ── 3. RECARREGAMENTO sem parâmetros — onde o bug vivia
  await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1500);
  e = await lerEstado(pagina);
  checar(`3) APÓS RELOAD sem parâmetros, sobreviveu como ${esperadoTxt}`, (e.utm?.placement ?? null) === f.esperado, `veio ${JSON.stringify(e.utm?.placement ?? null)}`);

  // ── regressão: os outros campos não podem ter se perdido no caminho
  if (f.esperado !== null || /campaign_id/.test(f.query)) {
    const esperaCamp = /campaign_id=(\d+)/.exec(f.query)?.[1] ?? null;
    const esperaAd = /[&?]ad_id=(\d+)/.exec(f.query)?.[1] ?? null;
    const esperaAdset = /adset_id=(\d+)/.exec(f.query)?.[1] ?? null;
    checar(`3) campaign_id intacto`, (e.utm?.campaign_id ?? null) === esperaCamp, `${e.utm?.campaign_id} vs ${esperaCamp}`);
    if (esperaAdset) checar(`3) adset_id intacto`, (e.utm?.adset_id ?? null) === esperaAdset, `${e.utm?.adset_id} vs ${esperaAdset}`);
    if (esperaAd) checar(`3) ad_id intacto`, (e.utm?.ad_id ?? null) === esperaAd, `${e.utm?.ad_id} vs ${esperaAd}`);
    checar(`3) utm_source intacto`, !!e.utm?.utm_source && e.utm.utm_source !== "direct", e.utm?.utm_source);
    checar(`3) utm_campaign intacto`, !!e.utm?.utm_campaign && e.utm.utm_campaign !== "(not set)", e.utm?.utm_campaign);
  }

  await contexto.close();
}

console.log("\n═══ O QUE O INSERT DO LEAD VAI MANDAR ═══");
console.log("`getUtmForDb` lê exatamente o sessionStorage validado acima.\n");
{
  const contexto = await navegador.newContext();
  await contexto.route("**/*supabase.co/**", (r) => r.abort("failed"));
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/?${FIXTURES[0].query}`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1200);
  await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(1500);
  const utm = (await lerEstado(pagina)).utm;
  for (const [campo, esperado] of [
    ["placement", "Instagram_Reels"],
    ["utm_source", "ig"],
    ["campaign_id", "120252040734020116"],
    ["adset_id", "120252041120300116"],
    ["ad_id", "120252041120330116"],
  ]) {
    checar(`payload do lead: ${campo}`, (utm?.[campo] ?? null) === esperado, `${JSON.stringify(utm?.[campo] ?? null)}`);
  }
  await contexto.close();
}

await navegador.close();

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
