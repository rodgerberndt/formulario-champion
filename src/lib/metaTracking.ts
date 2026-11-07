// Dados de navegação que o Meta precisa para identificar a pessoa, capturados
// no navegador e guardados junto do lead. É a metade "banco de dados" do
// método Allan Tracker (ver vault: Método Allan Tracker - Resumo), sem GTM e
// sem Stape: quem guarda é o Supabase, e o indexador é o próprio lead.
//
// `_fbp` = cookie do navegador (o pixel cria em toda visita).
// `_fbc` = cookie do clique de anúncio (o pixel cria quando a URL traz fbclid).
// O fbc é o que liga a conversão ao anúncio. Se o cookie não existir mas a URL
// trouxer fbclid, montamos o mesmo formato (fb.1.<ms do clique>.<fbclid>) e
// guardamos por 1 ano, para o lead que volta pela bio semanas depois ainda
// sair com o clique certo.

// Relativo, e não pelo alias `@/`: este arquivo é carregado direto pelo teste
// (`scripts/testar-atribuicao-paga.mjs`), fora do Vite, onde o alias não existe.
import { lerAtribuicaoDaAba, temIdentificadorPago } from "./atribuicaoPaga";

const FBC_KEY = "champion_fbc";
/**
 * O fbc do clique PAGO, guardado à parte do fbc "qualquer um".
 *
 * ── Por que dois cofres (18/09/2026) ───────────────────────────────────────
 * O app do Instagram anexa `fbclid` a QUALQUER link externo clicado dentro
 * dele, inclusive o da bio. Esse fbclid é REAL, o pixel escreve o cookie
 * `_fbc` com ele, e ele sobrescrevia o fbc do clique no anúncio de horas
 * antes. O lead saía para o Meta com o clique da bio: mesmo formato, mesma
 * validade, e nenhum anúncio do outro lado.
 *
 * Decodificado em base64url, o fbclid de clique em anúncio carrega o campo
 * `adid` (o id do anúncio); o que o app anexa a link orgânico NÃO carrega
 * (medido nos 4 casos de 18/09). É essa a diferença que separa os dois aqui.
 */
const FBC_PAGO_KEY = "champion_fbc_pago";
const FBC_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const INDEX_COOKIE = "champion_index";

export function getCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Atributo `domain` do cookie, já pronto para concatenar — ou vazio.
 *
 * Host sem ponto (localhost, o preview do build) NÃO aceita `Domain=`: o
 * navegador descarta o cookie inteiro, silenciosamente. Sem isto o teste de
 * navegador validaria um caminho que só existe em produção.
 */
function cookieDomain(): string {
  const h = window.location.hostname;
  if (/championadstudio\.com$/.test(h)) return "; domain=.championadstudio.com";
  if (/assessoriachampion\.com$/.test(h)) return "; domain=.assessoriachampion.com";
  if (!h.includes(".")) return "";
  return `; domain=${h}`;
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/${cookieDomain()}; SameSite=Lax; Secure`;
  } catch { /* ignore */ }
}

export function getFbp(): string | null {
  return getCookie("_fbp");
}

/**
 * O `_fbp`, criando o cookie se ele ainda não existir.
 *
 * POR QUE ISTO EXISTE (24/09/2026). O `_fbp` faltava em 82% dos PageView e em
 * 21% dos eventos de lead, medido no `capi_events_log`. A causa não é bug de
 * código, é ORDEM: o `_fbp` é escrito pelo pixel, e o PageView da CAPI sai no
 * `DOMContentLoaded`, que costuma vir antes de o `fbevents.js` terminar de
 * carregar. Na primeira visita de cada pessoa, o cookie ainda não existe na
 * hora em que ele seria lido, e o evento vai para a Meta sem esse parâmetro.
 *
 * Esperar pelo pixel atrasaria o PageView, e é justamente o evento que precisa
 * sair cedo. Então a ordem se inverte: quem escreve primeiro somos nós. O
 * `fbevents.js` não sobrescreve um `_fbp` que já encontra no domínio — ele
 * adota o valor existente. Por isso os dois lados passam a falar do mesmo id,
 * em vez de um valor nascer sem o outro saber.
 *
 * O formato é o do próprio Meta e precisa ser exatamente este, senão o valor é
 * descartado do outro lado: `fb.1.<epoch em ms>.<inteiro aleatório>`.
 * Os 90 dias são a validade que o pixel usa.
 */
export function obterOuCriarFbp(): string | null {
  try {
    const existente = getCookie("_fbp");
    if (existente && /^fb\.1\.\d+\.\d+$/.test(existente)) return existente;
    // `Math.random()` basta: este número não protege nada, só distingue
    // navegadores. O que importa é o formato e a estabilidade no tempo.
    const aleatorio = Math.floor(Math.random() * 1e10);
    const novo = `fb.1.${Date.now()}.${aleatorio}`;
    setCookie("_fbp", novo, 90 * 24 * 60 * 60);
    // Só devolve se o navegador aceitou de fato: em aba anônima com cookies
    // bloqueados a escrita falha em silêncio, e mandar um valor que o pixel
    // nunca verá criaria divergência entre o evento do navegador e o do
    // servidor, que é pior do que não mandar nada.
    return getCookie("_fbp");
  } catch {
    return null;
  }
}

/**
 * O payload do `fbclid`, decodificado.
 *
 * O Meta manda o fbclid em base64url com campos binários dentro
 * (`pdof…extn…aem…adid…srtc…app_id…`). Não é documentado e não precisa ser:
 * aqui só se procura a PRESENÇA do campo `adid`, e a decodificação é toda
 * best effort — fbclid de formato antigo (`IwAR0…`) não decodifica em nada
 * legível e cai no `false`, que é o lado seguro (não promove a pago o que não
 * se consegue provar que é pago).
 */
export function fbclidEhDeCliquePago(fbclid: string | null | undefined): boolean {
  if (!fbclid || fbclid.includes("{{")) return false;
  try {
    const b64 = fbclid.replace(/-/g, "+").replace(/_/g, "/");
    const completo = b64 + "===".slice((b64.length + 3) % 4);
    const bruto = atob(completo);
    return /adid/.test(bruto);
  } catch {
    return false;
  }
}

/** O fbclid que está dentro de um `fb.1.<ms>.<fbclid>`. */
export function fbclidDoFbc(fbc: string | null | undefined): string | null {
  if (!fbc) return null;
  const m = /^fb\.1\.\d+\.(.+)$/.exec(fbc);
  return m ? m[1] : null;
}

/** O fbc veio de clique em anúncio? */
export function fbcEhDeCliquePago(fbc: string | null | undefined): boolean {
  return fbclidEhDeCliquePago(fbclidDoFbc(fbc));
}

/**
 * fbc do clique de anúncio.
 *
 * ── A ordem, e o porquê de cada degrau (18/09/2026) ────────────────────────
 *   1. cookie `_fbc` do pixel, QUANDO ele é de clique pago — é o valor mais
 *      fresco e o que o próprio pixel do navegador está usando;
 *   2. `fbclid` PAGO na URL desta visita (clique em anúncio agora);
 *   3. o fbc PAGO guardado (1 ano), quando o toque creditado desta visita é
 *      pago — é o caso da volta pela bio depois do clique no anúncio, em que
 *      a atribuição foi resgatada e o fbc precisa vir do mesmo toque;
 *   4. só então o que houver: cookie orgânico, fbclid orgânico da URL, ou o
 *      último fbc guardado. Nada aqui é inventado; é o comportamento antigo,
 *      preservado para quem nunca teve clique pago.
 *
 * O degrau 3 é o que conserta o caso do Emerson: `fbp` de 06:26 (clique no
 * anúncio) e `fbc` de 06:53 (volta pela bio). Antes, o fbc da bio vencia por
 * ser mais novo, e o lead chegava ao Meta com um clique que não era de anúncio
 * nenhum — enquanto a atribuição, resgatada, dizia que era.
 */
export function getFbc(): string | null {
  const cookie = getCookie("_fbc");
  const cookieValido = cookie && /^fb\.1\.\d+\.\S+$/.test(cookie) ? cookie : null;

  // 1. cookie do pixel, se for do clique pago.
  if (cookieValido && fbcEhDeCliquePago(cookieValido)) {
    persistFbc(cookieValido);
    return cookieValido;
  }

  // 2. clique pago nesta URL.
  let daUrl: string | null = null;
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid && !fbclid.includes("{{")) {
      daUrl = `fb.1.${Date.now()}.${fbclid}`;
      if (fbclidEhDeCliquePago(fbclid)) {
        persistFbc(daUrl);
        return daUrl;
      }
    }
  } catch { /* ignore */ }

  // 3. o fbc pago guardado, quando o toque creditado é pago.
  const pagoGuardado = getStoredFbcPago();
  if (pagoGuardado && atribuicaoCreditadaEhPaga()) return pagoGuardado;

  // 4. o que houver, como antes.
  if (cookieValido) {
    persistFbc(cookieValido);
    return cookieValido;
  }
  if (daUrl) {
    persistFbc(daUrl);
    return daUrl;
  }
  return getStoredFbc();
}

/**
 * O toque que ESTA visita credita é pago?
 *
 * Lê a decisão que `atribuicaoPaga` já gravou na aba (clique pago desta visita
 * ou toque pago resgatado do disco). Import direto, e não uma cópia da regra:
 * o que decide "pago" mora num lugar só.
 */
function atribuicaoCreditadaEhPaga(): boolean {
  try {
    return temIdentificadorPago(lerAtribuicaoDaAba());
  } catch {
    return false;
  }
}

function persistFbc(value: string) {
  try {
    localStorage.setItem(FBC_KEY, JSON.stringify({ v: value, t: Date.now() }));
  } catch { /* ignore */ }
  // O cofre do pago só recebe o que é comprovadamente pago, e nunca é
  // sobrescrito por valor orgânico.
  if (fbcEhDeCliquePago(value)) {
    try {
      localStorage.setItem(FBC_PAGO_KEY, JSON.stringify({ v: value, t: Date.now() }));
    } catch { /* ignore */ }
  }
}

function lerCofreFbc(chave: string): string | null {
  try {
    const raw = localStorage.getItem(chave);
    if (!raw) return null;
    const { v, t } = JSON.parse(raw);
    if (!v || !t || Date.now() - t > FBC_TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function getStoredFbc(): string | null {
  return lerCofreFbc(FBC_KEY);
}

/** O fbc do último clique PAGO, dentro da janela de 1 ano. */
export function getStoredFbcPago(): string | null {
  return lerCofreFbc(FBC_PAGO_KEY);
}

/**
 * Espelha o session id num cookie de domínio por 1 ano. O localStorage é
 * por origem (www x apex x subdomínio) e some quando o navegador limpa dados
 * de site; o cookie sobrevive mais e serve de indexador estável.
 */
export function ensureIndexCookie(sessionId: string | null | undefined) {
  if (!sessionId) return;
  if (getCookie(INDEX_COOKIE) === sessionId) return;
  setCookie(INDEX_COOKIE, sessionId, 365 * 24 * 60 * 60);
}

const SESSION_STORAGE_KEY = "champion_session_id";

/**
 * O id da sessão desta aba, em memória.
 *
 * ── Por que memória, e não só storage ──────────────────────────────────────
 * Até 11/09/2026 o insert do lead lia SÓ o armazenamento, enquanto o resto do
 * rastreamento trabalhava com o id que o `TrackingProvider` guarda num ref.
 * Quando o armazenamento falhava no meio da visita, os dois discordavam — e a
 * discordância aparecia exatamente onde mais doía: o lead nascia sem sessão
 * enquanto TODOS os eventos dele, inclusive o `submit` do segundo seguinte,
 * saíam com o id certo.
 *
 * Foi o que aconteceu com 2 dos 11 leads nascidos depois que a coluna passou a
 * ser preenchida, ambos no navegador embutido do Instagram no iOS: sessão
 * completa em `lead_sessions`, funil inteiro gravado, `leads.session_id` nulo.
 * Nos dois, os cookies do Meta (`_fbp`, `_fbc`) chegaram — quem sumiu foi o
 * Web Storage.
 *
 * Daí a ordem aqui: memória (nunca falha dentro da página) → localStorage →
 * cookie de domínio. O cookie é o mesmo id, não uma heurística: nada de IP,
 * nada de user agent, nada inventado. Se não houver id em lugar nenhum, NULL.
 */
let sessionIdEmMemoria: string | null = null;

/**
 * Registra o id assim que ele é conhecido — antes de qualquer ida à rede.
 * Chamado pelo `TrackingProvider` no instante em que resolve a sessão.
 */
export function lembrarSessionId(sessionId: string | null | undefined) {
  if (!sessionId) return;
  sessionIdEmMemoria = sessionId;
  ensureIndexCookie(sessionId);
}

/**
 * Descarta o id em todas as camadas. Usado quando o banco avisa que a sessão
 * não existe mais: sem isto o cookie ressuscitaria o id que o localStorage
 * acabou de jogar fora.
 */
export function esquecerSessionId() {
  sessionIdEmMemoria = null;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* ignore */ }
  setCookie(INDEX_COOKIE, "", 0);
}

export function getSessionId(): string | null {
  if (sessionIdEmMemoria) return sessionIdEmMemoria;
  let doStorage: string | null = null;
  try {
    doStorage = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch { /* storage indisponível: segue para o cookie */ }
  const id = doStorage || getCookie(INDEX_COOKIE);
  // Primeira leitura bem-sucedida vira a memória da aba, para que uma falha
  // de armazenamento no meio do caminho não derrube as leituras seguintes.
  if (id) sessionIdEmMemoria = id;
  return id;
}

/** Tudo que vai junto do lead para a CAPI conseguir identificar a pessoa. */
export function getNavigationForLead(): { fbp: string | null; fbc: string | null; user_agent: string; page_url: string; session_id: string | null } {
  return {
    // `obterOuCriarFbp` e não `getFbp`: quem preenche o formulário rápido, ou
    // chega por um navegador que atrasou o pixel, gravava o lead sem `fbp`
    // (faltava em 21% dos eventos de lead, medido em 24/09/2026). Aqui o
    // cookie já existe na maioria das vezes, e quando não existe é criado no
    // formato do Meta, que o pixel depois adota em vez de sobrescrever.
    fbp: obterOuCriarFbp(),
    fbc: getFbc(),
    user_agent: navigator.userAgent.slice(0, 500),
    page_url: window.location.href.split("#")[0].slice(0, 500),
    session_id: getSessionId(),
  };
}

// ── Advanced matching do pixel ─────────────────────────────────────────────
// O pixel só aceita dados da pessoa no `fbq('init')`. Numa SPA o init já
// aconteceu quando o lead preenche o formulário, então guardamos os dados aqui
// e a página de obrigado é aberta com navegação completa (index.html lê isto
// e inicializa o pixel já com e-mail, telefone e nome). Mesma exigência do
// curso: "advanced matching manual, nós decidimos o que mandar".
const AM_KEY = "champion_am";

export interface AdvancedMatching {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  external_id?: string;
}

function limpa(v: string): string {
  return v.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

export function saveAdvancedMatching(lead: { email?: string | null; whatsapp?: string | null; nome?: string | null; leadId?: string | null }) {
  const am: AdvancedMatching = {};
  if (lead.email) am.em = limpa(lead.email);
  if (lead.whatsapp) {
    let d = lead.whatsapp.replace(/\D/g, "").replace(/^0+/, "");
    if (!d.startsWith("55") && d.length >= 10 && d.length <= 11) d = "55" + d;
    if (d.length >= 10) am.ph = d;
  }
  if (lead.nome) {
    const parts = limpa(lead.nome).split(/\s+/).filter(Boolean);
    if (parts[0]) am.fn = parts[0];
    if (parts.length > 1) am.ln = parts[parts.length - 1];
  }
  if (lead.leadId) am.external_id = lead.leadId;
  try {
    localStorage.setItem(AM_KEY, JSON.stringify(am));
  } catch { /* ignore */ }
}

/** Ids determinísticos por lead e evento: navegador e servidor geram o mesmo. */
export function eventIdsForLead(leadId: string): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const ev of ["CompleteRegistration", "Lead", "MQL", "Sprint", "ViewContent", "InitiateCheckout"]) ids[ev] = `${leadId}_${ev}`;
  return ids;
}

export function newEventId(prefix: string): string {
  const rnd = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rnd}`;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Dispara um evento do pixel com eventID, sem quebrar se o pixel foi bloqueado. */
export function pixelTrack(event: string, params: Record<string, unknown> = {}, eventID?: string, custom = false) {
  try {
    if (typeof window.fbq !== "function") return;
    window.fbq(custom ? "trackCustom" : "track", event, params, eventID ? { eventID } : undefined);
  } catch { /* ignore */ }
}
