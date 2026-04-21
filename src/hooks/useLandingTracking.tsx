import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "champion_session_id";
// PERF: flush a cada 30s em vez de 3s — reduz 10x as requisições de rede
const FLUSH_INTERVAL_MS = 30_000;
const MAX_SINGLE_FLUSH_MS = 5 * 60_000;

export function useLandingTracking(page = "/") {
  const sessionIdRef = useRef<string | null>(null);
  const sectionStartRef = useRef<Map<string, number>>(new Map());
  const sectionOrderRef = useRef<Map<string, number>>(new Map());
  const sectionLoggedRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const intervalRef = useRef<number | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  const pageHideHandlerRef = useRef<(() => void) | null>(null);
  const beforeUnloadHandlerRef = useRef<(() => void) | null>(null);
  const clickHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const isFlushingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const cleanup = () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      flushAllSectionTimes();
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (visibilityHandlerRef.current) {
        document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
        visibilityHandlerRef.current = null;
      }
      if (pageHideHandlerRef.current) {
        window.removeEventListener("pagehide", pageHideHandlerRef.current);
        pageHideHandlerRef.current = null;
      }
      if (beforeUnloadHandlerRef.current) {
        window.removeEventListener("beforeunload", beforeUnloadHandlerRef.current);
        beforeUnloadHandlerRef.current = null;
      }
      if (clickHandlerRef.current) {
        document.removeEventListener("click", clickHandlerRef.current, { capture: true } as EventListenerOptions);
        clickHandlerRef.current = null;
      }
      sectionStartRef.current.clear();
      sectionOrderRef.current.clear();
      sectionLoggedRef.current.clear();
    };

    const init = () => {
      const sid = localStorage.getItem(SESSION_KEY);
      if (!sid) {
        retryTimer = window.setTimeout(init, 800);
        return;
      }
      if (cancelled) return;
      sessionIdRef.current = sid;
      setupSectionTracking(sid);
      setupClickTracking(sid);
      setupTimeFlush(sid);
    };

    init();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function setupSectionTracking(sessionId: string) {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("section[data-track-id], [data-track-id]:not([data-track-click])")
    ).filter((el) => !el.hasAttribute("data-track-click"));

    if (sections.length === 0) {
      window.setTimeout(() => setupSectionTracking(sessionId), 1000);
      return;
    }

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          const id = el.dataset.trackId;
          if (!id) return;

          const order = parseInt(el.dataset.trackOrder || "0", 10);
          sectionOrderRef.current.set(id, order);

          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
          if (visible) {
            if (!sectionStartRef.current.has(id)) {
              sectionStartRef.current.set(id, Date.now());
            }
            if (!sectionLoggedRef.current.has(id)) {
              sectionLoggedRef.current.add(id);
              void ensureSectionRow(sessionId, id, order);
            }
            return;
          }

          if (sectionStartRef.current.has(id)) {
            void flushSectionTime(sessionId, id, true);
          }
        });
      },
      // PERF: 1 threshold só (0.2) em vez de 4 — reduz callbacks do observer
      { threshold: 0.2 }
    );

    sections.forEach((section) => observerRef.current?.observe(section));
  }

  async function ensureSectionRow(sessionId: string, sectionId: string, order: number) {
    const { error } = await supabase
      .from("section_views")
      .upsert(
        {
          session_id: sessionId,
          section_id: sectionId,
          section_order: order,
          page,
          time_spent_ms: 0,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "session_id,section_id,page", ignoreDuplicates: false }
      );

    if (error) {
      console.error("ensureSectionRow error", { sectionId, error });
    }
  }

  async function flushSectionTime(sessionId: string, sectionId: string, resetClock = false) {
    const start = sectionStartRef.current.get(sectionId);
    if (!start || isFlushingRef.current) return;

    const now = Date.now();
    const elapsed = Math.min(Math.max(0, now - start), MAX_SINGLE_FLUSH_MS);
    if (elapsed <= 0) return;

    isFlushingRef.current = true;
    const order = sectionOrderRef.current.get(sectionId) || 0;

    const { error } = await supabase.rpc("increment_section_time", {
      p_session_id: sessionId,
      p_section_id: sectionId,
      p_section_order: order,
      p_page: page,
      p_add_ms: Math.round(elapsed),
    });

    isFlushingRef.current = false;

    if (error) {
      console.error("increment_section_time error", { sectionId, error });
      return;
    }

    if (resetClock) {
      sectionStartRef.current.delete(sectionId);
    } else {
      sectionStartRef.current.set(sectionId, now);
    }
  }

  async function flushAllSectionTimes() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const visibleIds = Array.from(sectionStartRef.current.keys());
    await Promise.all(visibleIds.map((sectionId) => flushSectionTime(sid, sectionId, false)));
  }

  function setupTimeFlush(sessionId: string) {
    intervalRef.current = window.setInterval(() => {
      void flushAllSectionTimes();
    }, FLUSH_INTERVAL_MS);

    // PERF: removido flush precoce de 1.2s e handlers duplicados.
    // Mantemos apenas pagehide (mais confiável que beforeunload + visibilitychange juntos)
    pageHideHandlerRef.current = () => {
      void flushAllSectionTimes();
    };
    window.addEventListener("pagehide", pageHideHandlerRef.current);
  }

  function setupClickTracking(sessionId: string) {
    clickHandlerRef.current = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest<HTMLElement>("a, button, [role='button'], [data-track-click]");
      if (!interactive) return;

      const tag = interactive.tagName.toLowerCase();
      const href = (interactive as HTMLAnchorElement).href || null;
      const text = (interactive.innerText || interactive.textContent || "").trim().slice(0, 80);

      let clickType = "button";
      if (href) {
        if (href.includes("wa.me") || href.includes("whatsapp")) clickType = "whatsapp";
        else if (!href.startsWith(window.location.origin) && href.startsWith("http")) clickType = "external";
        else if (href.includes("#")) clickType = "anchor";
        else clickType = "link";
      }
      if (interactive.dataset.trackClick) clickType = interactive.dataset.trackClick;

      const clickId =
        interactive.dataset.trackId ||
        interactive.id ||
        interactive.getAttribute("aria-label") ||
        text.slice(0, 40);

      const sectionStart = interactive.parentElement || interactive;
      const section = sectionStart.closest<HTMLElement>("section[data-track-id], [data-track-id]:not([data-track-click])");
      const sectionId = section?.dataset.trackId || null;

      void supabase.from("click_events").insert({
        session_id: sessionId,
        page,
        click_type: clickType,
        click_id: clickId || null,
        section_id: sectionId,
        href,
        label: text || null,
        metadata: { tag },
      });
    };

    document.addEventListener("click", clickHandlerRef.current, { capture: true, passive: true });
  }
}
