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

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("Service Worker registration failed:", error);
    });
  }, []);
}
