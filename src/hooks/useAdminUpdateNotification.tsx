import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const UPDATE_DISMISSED_KEY = "champion_update_dismissed_v";

/**
 * Shows a persistent toast on /admin when a new SW update is detected,
 * prompting users to reinstall the PWA.
 */
export function useAdminUpdateNotification() {
  const location = useLocation();
  const hasShown = useRef(false);

  useEffect(() => {
    if (!location.pathname.startsWith("/admin")) return;
    if (!("serviceWorker" in navigator)) return;

    const checkForUpdate = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      const handleUpdate = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller &&
            !hasShown.current
          ) {
            hasShown.current = true;
            showUpdateToast();
          }
        });
      };

      // Check if there's already a waiting worker
      if (reg.waiting && navigator.serviceWorker.controller && !hasShown.current) {
        hasShown.current = true;
        showUpdateToast();
      }

      reg.addEventListener("updatefound", handleUpdate);

      // Force check for updates
      reg.update().catch(() => {});
    };

    checkForUpdate();
  }, [location.pathname]);
}

function showUpdateToast() {
  toast({
    title: "🚀 Nova atualização",
    description: "Recomenda-se reinstalar o app para aplicar as melhorias.",
    duration: Infinity,
  });
}
