/**
 * Cache das respostas do admin, com dois níveis de validade e persistência.
 *
 * O problema: a edge function tem cold start e algumas rotas custam segundos.
 * Guardar em memória resolveu reabrir a mesma aba, mas todo F5 recomeçava do
 * zero — e é no F5 que a espera dói mais.
 *
 * A política aqui tem DUAS bordas, não uma:
 *
 *   fresco  (até `ttl`)       → devolve na hora, sem tocar na rede.
 *   velho   (até `staleTtl`)  → devolve na hora TAMBÉM, e revalida por baixo.
 *                               A tela aparece instantânea com o dado da última
 *                               visita e se corrige sozinha quando a resposta
 *                               nova chega.
 *   vencido (depois disso)    → espera a rede, como antes.
 *
 * Isso é stale-while-revalidate. O ganho percebido vem quase todo daí: o que
 * demorava 3 segundos passa a pintar imediatamente, e a atualização acontece
 * enquanto a pessoa já está lendo.
 *
 * **Onde fica guardado:** `sessionStorage`, não `localStorage`. O painel mostra
 * WhatsApp, e-mail e faturamento de leads; esse dado não pode ficar no disco
 * depois que a aba fecha. sessionStorage sobrevive ao F5 e à navegação — que é
 * exatamente o caso que importa — e some quando a aba é fechada.
 *
 * A escrita é sempre feita dentro de try/catch: modo privativo, cota estourada
 * e storage desabilitado precisam degradar para cache só em memória, nunca
 * quebrar a tela.
 */

interface CacheEntry {
  value: unknown;
  /** Depois disto o valor ainda serve, mas precisa ser revalidado. */
  expiresAt: number;
  /** Depois disto o valor não serve mais nem para pintar a tela. */
  staleUntil: number;
}

const store = new Map<string, CacheEntry>();

/**
 * Versão do formato guardado.
 *
 * O cache persiste entre deploys dentro da mesma aba. Se a forma de uma
 * resposta mudar, o código novo leria o objeto antigo e quebraria no render —
 * um erro difícil de rastrear porque só acontece para quem já tinha a aba
 * aberta. Subir este número descarta tudo que ficou para trás.
 */
const CACHE_VERSION = "11";
const STORAGE_PREFIX = `champion_admin_cache:v${CACHE_VERSION}:`;

/** Apaga o que versões anteriores deixaram guardado. */
function limparVersoesAntigas(): void {
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith("champion_admin_cache:") && !k.startsWith(STORAGE_PREFIX)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* storage indisponível: nada a limpar */ }
}
limparVersoesAntigas();

/**
 * Por quanto tempo um valor vencido ainda pode pintar a tela.
 *
 * Vinte minutos: o suficiente para cobrir F5, troca de aba e voltar do café,
 * e curto o bastante para nada realmente antigo aparecer como se fosse atual.
 * Como a revalidação dispara junto, o que o olho vê velho já está sendo trocado.
 */
const STALE_WINDOW = 20 * 60_000;

/** Acima disto não persiste: não vale encher a cota por uma resposta gigante. */
const MAX_PERSISTED_BYTES = 512 * 1024;

/** Avisa a tela de que uma revalidação trouxe dado novo para esta rota. */
export const CACHE_REVALIDATED_EVENT = "champion:admin-cache-revalidated";

function emitRevalidated(path: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CACHE_REVALIDATED_EVENT, { detail: { path } }));
}

function persist(key: string, entry: CacheEntry): void {
  try {
    const json = JSON.stringify(entry);
    if (json.length > MAX_PERSISTED_BYTES) return;
    sessionStorage.setItem(STORAGE_PREFIX + key, json);
  } catch {
    // Cota estourada ou storage bloqueado: o cache em memória continua valendo.
  }
}

function readPersisted(key: string): CacheEntry | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (typeof parsed?.staleUntil !== "number") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function dropPersisted(key: string): void {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch { /* nada a fazer */ }
}

/** Limpa tudo que este cache gravou. Chamado no logout. */
export function clearPersistedCache(): void {
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch { /* nada a fazer */ }
}

/** Requisições em voo, para dois pedidos iguais não virarem duas chamadas. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Quanto tempo cada rota pode ficar guardada.
 *
 * A jornada de um lead é história: não muda depois que aconteceu, então dura
 * bastante. Métricas mudam com venda e reunião novas, então duram pouco.
 */
const TTL_BY_PATH: Record<string, number> = {
  "/lead-journey": 15 * 60_000,
  "/landing-behavior": 3 * 60_000,
  "/weekly-metrics": 3 * 60_000,
  "/commercial-goals": 3 * 60_000,
  "/commercial-plan": 5 * 60_000,
  "/creatives": 90_000,
  "/metrics": 90_000,
  "/sales-cycle": 90_000,
  "/manual-sales": 60_000,
  "/meetings": 60_000,
  "/leads": 45_000,
  "/campaigns": 90_000,
};

const DEFAULT_TTL = 60_000;

export function ttlFor(path: string): number {
  return TTL_BY_PATH[path] ?? DEFAULT_TTL;
}

export function cacheKey(path: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return path;
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return `${path}?${sorted}`;
}

export type CacheState = "fresco" | "velho";

export interface CacheHit<T> {
  value: T;
  state: CacheState;
}

/**
 * Devolve o valor guardado e diz em que estado ele está.
 *
 * Procura primeiro na memória e, se não achar, no sessionStorage — é assim que
 * o primeiro carregamento depois de um F5 encontra o que a visita anterior já
 * tinha buscado.
 */
export function peekCached<T = unknown>(key: string): CacheHit<T> | undefined {
  let entry = store.get(key);
  if (!entry) {
    entry = readPersisted(key);
    if (entry) store.set(key, entry);
  }
  if (!entry) return undefined;

  const agora = Date.now();
  if (entry.staleUntil < agora) {
    store.delete(key);
    dropPersisted(key);
    return undefined;
  }
  return {
    value: entry.value as T,
    state: entry.expiresAt >= agora ? "fresco" : "velho",
  };
}

/** Compatibilidade: só devolve valor quando ele está fresco de verdade. */
export function getCached<T = unknown>(key: string): T | undefined {
  const hit = peekCached<T>(key);
  return hit?.state === "fresco" ? hit.value : undefined;
}

export function setCached(key: string, value: unknown, ttlMs: number, revalidado = false): void {
  const agora = Date.now();
  const entry: CacheEntry = {
    value,
    expiresAt: agora + ttlMs,
    staleUntil: agora + ttlMs + STALE_WINDOW,
  };
  store.set(key, entry);
  persist(key, entry);
  if (revalidado) emitRevalidated(key.split("?")[0]);
}

export function getInFlight<T = unknown>(key: string): Promise<T> | undefined {
  return inFlight.get(key) as Promise<T> | undefined;
}

export function trackInFlight<T>(key: string, promise: Promise<T>): Promise<T> {
  inFlight.set(key, promise as Promise<unknown>);
  void promise.finally(() => {
    if (inFlight.get(key) === (promise as Promise<unknown>)) inFlight.delete(key);
  });
  return promise;
}

/**
 * Limpa o cache. Chamado depois de gravar qualquer coisa (venda, reunião,
 * premissa do plano): escrever muda o que as leituras devolvem, e cache que
 * sobrevive a uma escrita é como o painel volta a mentir.
 */
export function invalidateAdminCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    clearPersistedCache();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      dropPersisted(key);
    }
  }
  // O que só existe no storage (a aba foi recarregada e ainda não foi lido)
  // também precisa cair, senão a escrita "some" no próximo F5.
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(STORAGE_PREFIX) && k.slice(STORAGE_PREFIX.length).startsWith(prefix)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* nada a fazer */ }
}

/** Roda algo quando a aba estiver ociosa, sem competir com o que o usuário pediu. */
export function whenIdle(fn: () => void, timeout = 2000): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof ric === "function") ric(fn, { timeout });
  else window.setTimeout(fn, 300);
}

// ─────────────────────────────────────────────────────────────────────────────
// Medição
//
// Otimizar sem medir é chute. Aqui fica o tempo e o tamanho de cada resposta do
// admin, para dar para responder "o que demora" com número em vez de opinião.
// `window.__adminPerf()` imprime a tabela no console do navegador.
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteTiming {
  path: string;
  ms: number;
  bytes: number;
  cached: boolean;
  at: number;
}

const timings: RouteTiming[] = [];
const MAX_TIMINGS = 300;

export function recordTiming(t: RouteTiming): void {
  timings.push(t);
  if (timings.length > MAX_TIMINGS) timings.shift();
}

export function getTimings(): RouteTiming[] {
  return [...timings];
}

/** Resumo por rota: quantas vezes, tempo mediano, pior tempo, payload médio. */
export function timingSummary(): Array<{
  path: string; n: number; mediana: number; pior: number; kb: number; cacheHits: number;
}> {
  const porRota = new Map<string, RouteTiming[]>();
  for (const t of timings) {
    if (!porRota.has(t.path)) porRota.set(t.path, []);
    porRota.get(t.path)!.push(t);
  }
  const linhas = [...porRota.entries()].map(([path, ts]) => {
    const reais = ts.filter((t) => !t.cached);
    const ms = reais.map((t) => t.ms).sort((a, b) => a - b);
    const mediana = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
    const pior = ms.length ? ms[ms.length - 1] : 0;
    const bytes = reais.length ? reais.reduce((sum, t) => sum + t.bytes, 0) / reais.length : 0;
    return {
      path,
      n: ts.length,
      mediana: Math.round(mediana),
      pior: Math.round(pior),
      kb: Math.round(bytes / 1024),
      cacheHits: ts.length - reais.length,
    };
  });
  return linhas.sort((a, b) => b.pior - a.pior);
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__adminPerf = () => {
    // eslint-disable-next-line no-console
    console.table(timingSummary());
    return timingSummary();
  };
}
