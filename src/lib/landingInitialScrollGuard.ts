/**
 * Backup guard chamado pelo React após o lock pré-React no <head>.
 * O lock principal vive em index.html. Aqui só forçamos topo 1x e
 * garantimos manual scroll restoration enquanto o app monta.
 */
export function installLandingInitialScrollGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  if (window.location.pathname !== "/") {
    return () => {};
  }

  try {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  } catch {
    /* noop */
  }

  const forceTop = () => {
    try { window.scrollTo(0, 0); } catch { /* noop */ }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  };

  forceTop();
  const raf = window.requestAnimationFrame(forceTop);

  return () => {
    window.cancelAnimationFrame(raf);
  };
}
