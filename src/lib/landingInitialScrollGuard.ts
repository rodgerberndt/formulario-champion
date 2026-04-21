const LOCK_RELEASE_DELAY_MS = 1200;
const LOCK_SAFETY_TIMEOUT_MS = 3000;
const USER_INTENT_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "touchstart", "wheel", "keydown"];

const forceScrollTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

const isLandingPath = () => window.location.pathname === "/";

export function installLandingInitialScrollGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  if (!isLandingPath() || !document.body) {
    return () => {};
  }

  const html = document.documentElement;
  const body = document.body;
  const originalStyles = {
    htmlOverflow: html.style.overflow,
    htmlHeight: html.style.height,
    htmlScrollBehavior: html.style.scrollBehavior,
    htmlOverflowAnchor: html.style.getPropertyValue("overflow-anchor"),
    bodyOverflow: body.style.overflow,
    bodyHeight: body.style.height,
    bodyPosition: body.style.position,
    bodyWidth: body.style.width,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyScrollBehavior: body.style.scrollBehavior,
    bodyOverflowAnchor: body.style.getPropertyValue("overflow-anchor"),
  };

  let released = false;
  let releaseTimer = 0;
  let safetyTimer = 0;
  let loadReleaseTimer = 0;
  let guardRaf = 0;
  let rafPrimary = 0;
  let rafSecondary = 0;

  const enforceTopWhileLocked = () => {
    if (released) return;
    if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0 || document.body.scrollTop !== 0) {
      forceScrollTop();
    }
  };

  const clearPending = () => {
    window.clearTimeout(releaseTimer);
    window.clearTimeout(safetyTimer);
    window.clearTimeout(loadReleaseTimer);
    window.cancelAnimationFrame(guardRaf);
    window.cancelAnimationFrame(rafPrimary);
    window.cancelAnimationFrame(rafSecondary);
  };

  const bindLockListeners = () => {
    window.removeEventListener("scroll", enforceTopWhileLocked);
    window.addEventListener("scroll", enforceTopWhileLocked, { passive: true });

    USER_INTENT_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, release, true);
      window.addEventListener(eventName, release, { capture: true, passive: true });
    });
  };

  const unbindLockListeners = () => {
    window.removeEventListener("scroll", enforceTopWhileLocked);

    USER_INTENT_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, release, true);
    });
  };

  const startGuardLoop = () => {
    const tick = () => {
      enforceTopWhileLocked();
      if (!released) {
        guardRaf = window.requestAnimationFrame(tick);
      }
    };

    guardRaf = window.requestAnimationFrame(tick);
  };

  const restoreStyles = () => {
    html.style.overflow = originalStyles.htmlOverflow;
    html.style.height = originalStyles.htmlHeight;
    html.style.scrollBehavior = originalStyles.htmlScrollBehavior;
    if (originalStyles.htmlOverflowAnchor) {
      html.style.setProperty("overflow-anchor", originalStyles.htmlOverflowAnchor);
    } else {
      html.style.removeProperty("overflow-anchor");
    }
    body.style.overflow = originalStyles.bodyOverflow;
    body.style.height = originalStyles.bodyHeight;
    body.style.position = originalStyles.bodyPosition;
    body.style.width = originalStyles.bodyWidth;
    body.style.top = originalStyles.bodyTop;
    body.style.left = originalStyles.bodyLeft;
    body.style.scrollBehavior = originalStyles.bodyScrollBehavior;
    if (originalStyles.bodyOverflowAnchor) {
      body.style.setProperty("overflow-anchor", originalStyles.bodyOverflowAnchor);
    } else {
      body.style.removeProperty("overflow-anchor");
    }
  };

  const release = () => {
    if (released) return;
    released = true;
    clearPending();
    unbindLockListeners();
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
    html.style.setProperty("overflow-anchor", "none");
    body.style.overflow = "hidden";
    body.style.height = "100%";
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.top = "0";
    body.style.left = "0";
    body.style.setProperty("overflow-anchor", "none");

    forceScrollTop();
  };

  const scheduleRelease = () => {
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(release, LOCK_RELEASE_DELAY_MS);
    safetyTimer = window.setTimeout(release, LOCK_SAFETY_TIMEOUT_MS);
  };

  const runGuardCycle = () => {
    clearPending();
    released = false;
    applyLock();
    bindLockListeners();
    startGuardLoop();

    if (document.readyState === "complete") {
      scheduleRelease();
    }
  };

  const handleWindowLoad = () => {
    loadReleaseTimer = window.setTimeout(scheduleRelease, 120);
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (!isLandingPath()) return;
    if (!event.persisted) return;
    runGuardCycle();
  };

  runGuardCycle();

  if (document.readyState !== "complete") {
    window.addEventListener("load", handleWindowLoad, { once: true });
  }

  window.addEventListener("pageshow", handlePageShow);

  return () => {
    clearPending();
    unbindLockListeners();
    window.removeEventListener("load", handleWindowLoad);
    window.removeEventListener("pageshow", handlePageShow);
    restoreStyles();
  };
}