export const ADMIN_TOKEN_KEY = "admin_analytics_token";
export const ADMIN_AUTH_EXPIRED_EVENT = "admin-auth-expired";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isAdminTokenExpired(token: string | null | undefined, skewSeconds = 30): boolean {
  if (!token) return true;

  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) return true;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return exp <= nowInSeconds + skewSeconds;
}

export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function notifyAdminAuthExpired(message = "Sessão expirada. Faça login novamente.") {
  window.dispatchEvent(
    new CustomEvent(ADMIN_AUTH_EXPIRED_EVENT, {
      detail: { message },
    })
  );
}

export function getAdminToken() {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);

  if (!token || isAdminTokenExpired(token)) {
    clearAdminToken();
    notifyAdminAuthExpired();
    return null;
  }

  return token;
}

let adminFetchQueue: Promise<void> = Promise.resolve();

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function fetchAdmin(url: string, init: RequestInit = {}) {
  const previousRequest = adminFetchQueue;
  let releaseQueue: () => void = () => undefined;
  adminFetchQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousRequest.catch(() => undefined);

  const token = getAdminToken();
  if (!token) {
    releaseQueue();
    throw new Error("Sessão expirada");
  }

  const headers = new Headers(init.headers);
  headers.set("x-admin-token", token);

  if (!headers.has("apikey")) {
    headers.set("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  }

  const method = (init.method || "GET").toUpperCase();
  const canRetry = method === "GET";
  const maxAttempts = canRetry ? 4 : 1;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers,
        });

        if (response.status === 401) {
          clearAdminToken();
          notifyAdminAuthExpired();
          throw new Error("Sessão expirada");
        }

        if ([502, 503, 504].includes(response.status) && attempt < maxAttempts - 1) {
          await wait(900 * Math.pow(2, attempt) + Math.random() * 250);
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof Error && error.message === "Sessão expirada") throw error;
        if (attempt < maxAttempts - 1) {
          await wait(900 * Math.pow(2, attempt) + Math.random() * 250);
          continue;
        }
        throw error;
      }
    }

    throw new Error("Falha ao carregar dados");
  } finally {
    releaseQueue();
  }
}