import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installLandingInitialScrollGuard } from "./lib/landingInitialScrollGuard";

async function cleanupPreviewServiceWorkers() {
  if (typeof window === "undefined") return;

  const hostname = window.location.hostname;
  const isPreviewHost =
    hostname.includes("lovableproject.com") ||
    hostname.includes("lovable.app") ||
    hostname.includes("localhost") ||
    hostname.includes("127.0.0.1");

  if (!import.meta.env.DEV && !isPreviewHost) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("Failed to cleanup preview service workers", error);
  }
}

async function bootstrap() {
  const cleanupInitialScrollGuard = installLandingInitialScrollGuard();
  createRoot(document.getElementById("root")!).render(<App />);

  void cleanupPreviewServiceWorkers();

  window.addEventListener(
    "pagehide",
    () => {
      cleanupInitialScrollGuard();
    },
    { once: true },
  );
}

bootstrap();
