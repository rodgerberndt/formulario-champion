import { useEffect } from "react";

function isPreviewEnvironment() {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    import.meta.env.DEV ||
    hostname.includes("lovableproject.com") ||
    hostname.includes("lovable.app") ||
    hostname.includes("localhost") ||
    hostname.includes("127.0.0.1")
  );
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

/**
 * Registers the minimal push-only service worker (see public/sw.js) in production.
 * Skipped in local/preview environments so it doesn't interfere with Vite HMR.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (isPreviewEnvironment()) {
      unregisterServiceWorkers().catch((error) => {
        console.warn("Service worker cleanup failed:", error);
      });
      return;
    }

    // Faxina do OneSignal antes de registrar o nosso.
    //
    // Quem já abriu o painel tem o OneSignalSDKWorker.js registrado no escopo
    // "/", e ele não some sozinho só porque o script saiu do index.html. Com dois
    // workers no mesmo escopo o `navigator.serviceWorker.ready` pode devolver o
    // errado, e o subscribe com a nossa chave VAPID falha calado — que é a
    // explicação mais provável para push_subscriptions ter ficado vazia.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) =>
        Promise.all(
          regs
            .filter((r) => {
              const script = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
              return script.includes("OneSignal");
            })
            .map((r) => r.unregister()),
        ),
      )
      .catch(() => {})
      .finally(() => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then(() => navigator.serviceWorker.ready)
          .then((reg) => {
            // O service worker precisa saber onde fica o Supabase para confirmar
            // recebimento e renovar a inscrição quando não há aba aberta.
            reg.active?.postMessage({
              tipo: "config",
              supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            });
          })
          .catch((error) => {
            console.error("Service Worker registration failed:", error);
          });
      });
  }, []);
}
