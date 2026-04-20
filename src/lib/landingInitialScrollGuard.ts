const LOCK_RELEASE_DELAY_MS = 500;
const LOCK_SAFETY_TIMEOUT_MS = 800;

const forceScrollTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isLandingPath = () => window.location.pathname === "/";

const RELOAD_FLAG_KEY = "landing_reloaded_once";

const maybeReloadOnce = () => {
  if (typeof window === "undefined") return false;
  if (!isLandingPath()) return false;
  try {
    const navEntries = performance.getEntriesByType?.("navigation") as PerformanceNavigationTiming[] | undefined;
    const navType = navEntries?.[0]?.type;
    // Only auto-reload on first navigation (not on reload/back-forward)
    if (navType && navType !== "navigate") return false;
    if (sessionStorage.getItem(RELOAD_FLAG_KEY)) return false;
    sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
};

export function installLandingInitialScrollGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  if (!isLandingPath() || !document.body) {
    return () => {};
  }

  if (maybeReloadOnce()) {
    return () => {};
  }

  const html = document.documentElement;
  const body = document.body;
  const originalStyles = {
    htmlOverflow: html.style.overflow,
    htmlHeight: html.style.height,
    htmlScrollBehavior: html.style.scrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyHeight: body.style.height,
    bodyPosition: body.style.position,
    bodyWidth: body.style.width,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyScrollBehavior: body.style.scrollBehavior,
  };

  let released = false;
  let releaseTimer = 0;
  let safetyTimer = 0;
  let loadReleaseTimer = 0;
  let rafPrimary = 0;
  let rafSecondary = 0;

  const clearPending = () => {
    window.clearTimeout(releaseTimer);
    window.clearTimeout(safetyTimer);
    window.clearTimeout(loadReleaseTimer);
    window.cancelAnimationFrame(rafPrimary);
    window.cancelAnimationFrame(rafSecondary);
  };

  const restoreStyles = () => {
    html.style.overflow = originalStyles.htmlOverflow;
    html.style.height = originalStyles.htmlHeight;
    html.style.scrollBehavior = originalStyles.htmlScrollBehavior;
    body.style.overflow = originalStyles.bodyOverflow;
    body.style.height = originalStyles.bodyHeight;
    body.style.position = originalStyles.bodyPosition;
    body.style.width = originalStyles.bodyWidth;
    body.style.top = originalStyles.bodyTop;
    body.style.left = originalStyles.bodyLeft;
    body.style.scrollBehavior = originalStyles.bodyScrollBehavior;
  };

  const release = () => {
    if (released) return;
    released = true;
    clearPending();
    restoreStyles();
    forceScrollTop();
    rafPrimary = window.requestAnimationFrame(() => {
      forceScrollTop();
      rafSecondary = window.requestAnimationFrame(forceScrollTop);
    });
  };

  const applyLock = () => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }

    html.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    html.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.top = "0";
    body.style.left = "0";

    forceScrollTop();
  };

  const scheduleRelease = () => {
    rafPrimary = window.requestAnimationFrame(() => {
      rafSecondary = window.requestAnimationFrame(() => {
        releaseTimer = window.setTimeout(release, LOCK_RELEASE_DELAY_MS);
      });
    });

    safetyTimer = window.setTimeout(release, LOCK_SAFETY_TIMEOUT_MS);
  };

  const runGuardCycle = () => {
    clearPending();
    released = false;
    applyLock();
    scheduleRelease();
  };

  const handleWindowLoad = () => {
    loadReleaseTimer = window.setTimeout(release, 120);
  };

  const handlePageShow = () => {
    if (!isLandingPath()) return;
    runGuardCycle();
  };

  runGuardCycle();

  if (document.readyState !== "complete") {
    window.addEventListener("load", handleWindowLoad, { once: true });
  }

  window.addEventListener("pageshow", handlePageShow);

  return () => {
    clearPending();
    window.removeEventListener("load", handleWindowLoad);
    window.removeEventListener("pageshow", handlePageShow);
    restoreStyles();
  };
}