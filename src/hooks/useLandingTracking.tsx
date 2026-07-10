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
  // Scroll attention: faixa (0-19, 5% cada) onde o viewport está centrado agora,
  // e quanto tempo (ms) já se acumulou em cada faixa desde o último flush.
  const currentBinRef = useRef<{ bin: number; since: number } | null>(null);
  const pendingBinMsRef = useRef<Map<number, number>>(new Map());
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const scrollTickingRef = useRef(false);
  const isFlushingBinsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const cleanup = () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      flushAllSectionTimes();
      void flushScrollBins(sessionIdRef.current);
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
      if (scrollHandlerRef.current) {
        window.removeEventListener("scroll", scrollHandlerRef.current);
        scrollHandlerRef.current = null;
      }
      sectionStartRef.current.clear();
      sectionOrderRef.current.clear();
      sectionLoggedRef.current.clear();
      currentBinRef.current = null;
      pendingBinMsRef.current.clear();
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
      setupScrollAttention();
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

  // Calcula em qual faixa de 5% da altura da página (0-19) o viewport está
  // centrado agora — base do heatmap de atenção por scroll.
  function computeCurrentBin(): number {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    const pct = scrollableHeight > 0 ? (viewportCenter / (scrollableHeight + window.innerHeight)) * 100 : 0;
    const clamped = Math.min(100, Math.max(0, pct));
    return Math.min(19, Math.max(0, Math.floor(clamped / 5)));
  }

  // Fecha a contagem da faixa atual, somando o tempo decorrido desde a última
  // amostra no acumulador em memória (pendingBinMsRef), sem gravar no banco ainda.
  function closeCurrentBin() {
    const cur = currentBinRef.current;
    if (!cur) return;
    const now = Date.now();
    const elapsed = Math.min(Math.max(0, now - cur.since), MAX_SINGLE_FLUSH_MS);
    if (elapsed > 0) {
      pendingBinMsRef.current.set(cur.bin, (pendingBinMsRef.current.get(cur.bin) || 0) + elapsed);
    }
    cur.since = now;
  }

  function setupScrollAttention() {
    currentBinRef.current = { bin: computeCurrentBin(), since: Date.now() };

    scrollHandlerRef.current = () => {
      if (scrollTickingRef.current) return;
      scrollTickingRef.current = true;
      requestAnimationFrame(() => {
        scrollTickingRef.current = false;
        const newBin = computeCurrentBin();
        if (currentBinRef.current && newBin !== currentBinRef.current.bin) {
          closeCurrentBin();
          currentBinRef.current.bin = newBin;
        }
      });
    };
    window.addEventListener("scroll", scrollHandlerRef.current, { passive: true });
  }

  async function flushScrollBins(sessionId: string | null) {
    if (!sessionId || isFlushingBinsRef.current) return;
    closeCurrentBin();
    const entries = Array.from(pendingBinMsRef.current.entries()).filter(([, ms]) => ms > 0);
    if (entries.length === 0) return;
    pendingBinMsRef.current.clear();
    isFlushingBinsRef.current = true;
    await Promise.all(
      entries.map(([bin, ms]) =>
        supabase.rpc("increment_scroll_bin_time", {
          p_session_id: sessionId,
          p_page: page,
          p_bin: bin,
          p_add_ms: Math.round(ms),
        })
      )
    );
    isFlushingBinsRef.current = false;
  }

  function setupTimeFlush(sessionId: string) {
    intervalRef.current = window.setInterval(() => {
      void flushAllSectionTimes();
      void flushScrollBins(sessionId);
    }, FLUSH_INTERVAL_MS);

    // PERF: removido flush precoce de 1.2s e handlers duplicados.
    // Mantemos apenas pagehide (mais confiável que beforeunload + visibilitychange juntos)
    pageHideHandlerRef.current = () => {
      void flushAllSectionTimes();
      void flushScrollBins(sessionId);
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

      // Posição relativa (%) do clique dentro da seção — base do heatmap de
      // clique/toque. Null quando não há seção rastreada por perto (ex: header fixo).
      let posXPct: number | null = null;
      let posYPct: number | null = null;
      if (section) {
        const rect = section.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          posXPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
          posYPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
        }
      }

      void supabase.from("click_events").insert({
        session_id: sessionId,
        page,
        click_type: clickType,
        click_id: clickId || null,
        section_id: sectionId,
        href,
        label: text || null,
        metadata: { tag },
        pos_x_pct: posXPct,
        pos_y_pct: posYPct,
      });
    };

    document.addEventListener("click", clickHandlerRef.current, { capture: true, passive: true });
  }
}
