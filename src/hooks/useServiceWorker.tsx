import { useEffect, useState, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        setRegistration(reg);

        // Check for updates
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

        // Handle controller change
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        console.log("Service Worker registered successfully");
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
