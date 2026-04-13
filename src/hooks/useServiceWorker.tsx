import { useEffect, useState, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

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

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
}

export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const previewMode = isPreviewEnvironment();

    if (previewMode) {
      unregisterServiceWorkers().catch((error) => {
        console.warn("Service worker cleanup failed:", error);
      });
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        setRegistration(reg);

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
              toast({
                title: "Atualização disponível",
                description: "Clique para atualizar o app.",
                action: (
                  <button
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={() => {
                      newWorker.postMessage({ type: "SKIP_WAITING" });
                      window.location.reload();
                    }}
                  >
                    Atualizar agora
                  </button>
                ),
              });
            }
          });
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      } catch (error) {
        console.error("Service Worker registration failed:", error);
      }
    };

    registerSW();
  }, []);

  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }, [registration]);

  return {
    updateAvailable,
    applyUpdate,
    registration,
  };
}
