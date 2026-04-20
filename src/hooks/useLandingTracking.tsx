import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "champion_session_id";
const FLUSH_INTERVAL_MS = 8000; // envia tempos acumulados a cada 8s

/**
 * Tracks landing page behavior:
 * - Section views (IntersectionObserver on every <section data-track-id="...">)
 * - Scroll depth milestones (25/50/75/100%)
 * - Click events on CTAs / WhatsApp / anchors / external links
 *
 * Reads session id from localStorage (set by useTracking).
 */
export function useLandingTracking(page = "/") {
  const sessionIdRef = useRef<string | null>(null);
  // Quando a seção entrou em vista (timestamp ms). null = não está visível.
  const sectionStartRef = useRef<Map<string, number>>(new Map());
  // Ordem da seção (capturada do data-track-order)
  const sectionOrderRef = useRef<Map<string, number>>(new Map());
  // Tempo acumulado pendente de flush para o servidor
  const pendingTimeRef = useRef<Map<string, number>>(new Map());
  const sectionLoggedRef = useRef<Set<string>>(new Set());
  const scrollLoggedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    // Wait a tick so useTracking has had a chance to write the session id
    const init = () => {
      const sid = localStorage.getItem(SESSION_KEY);
      if (!sid) {
        // try again shortly
        setTimeout(init, 800);
        return;
      }
      sessionIdRef.current = sid;
      setupSectionTracking(sid);
      setupScrollTracking(sid);
      setupClickTracking(sid);
      setupTimeFlush(sid);
    };
    init();

    return () => {
      // flush time spent for visible sections on unmount
      flushAllSectionTimes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // --- SECTION TRACKING ---
  function setupSectionTracking(sessionId: string) {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("section[data-track-id], [data-track-id]:not([data-track-click])")
    ).filter((el) => !el.hasAttribute("data-track-click"));
    if (sections.length === 0) {
      // try again a bit later (sections may render after first paint)
      setTimeout(() => setupSectionTracking(sessionId), 1500);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          const id = el.dataset.trackId!;
          const order = parseInt(el.dataset.trackOrder || "0", 10);
          sectionOrderRef.current.set(id, order);

          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;

          if (visible) {
            // Marca início somente se ainda não estava visível
            if (!sectionStartRef.current.has(id)) {
              sectionStartRef.current.set(id, Date.now());
            }
            if (!sectionLoggedRef.current.has(id)) {
              sectionLoggedRef.current.add(id);
              insertSectionView(sessionId, id, order);
            }
          } else if (sectionStartRef.current.has(id)) {
            // Saiu da viewport: acumula o tempo localmente (NÃO envia ainda)
            const start = sectionStartRef.current.get(id)!;
            const elapsed = Date.now() - start;
            sectionStartRef.current.delete(id);
            const cur = pendingTimeRef.current.get(id) || 0;
            pendingTimeRef.current.set(id, cur + Math.min(elapsed, 5 * 60 * 1000));
          }
        });
      },
      { threshold: [0, 0.2, 0.5, 0.8] }
    );

    sections.forEach((s) => observer.observe(s));
  }

  async function insertSectionView(sessionId: string, sectionId: string, order: number) {
    try {
      // Garante linha base (ON CONFLICT DO NOTHING via .upsert seria ideal,
      // mas tabela tem unique index e .insert ignora silenciosamente em caso de conflito).
      await supabase.from("section_views").insert({
        session_id: sessionId,
        section_id: sectionId,
        section_order: order,
        page,
        time_spent_ms: 0,
      });
    } catch (e) {
      // ignore (likely duplicate -> unique index)
    }
  }

  /**
   * Para cada seção com tempo pendente OU visível, soma o tempo acumulado
   * desde o último flush e chama a RPC atômica `increment_section_time`.
   * Isto evita race conditions e garante que o tempo NUNCA seja zero.
   */
  function flushPendingTimes(sessionId: string, includeCurrentlyVisible: boolean) {
    const now = Date.now();

    // Para seções ainda visíveis: capturar o tempo decorrido e reiniciar o relógio
    if (includeCurrentlyVisible) {
      sectionStartRef.current.forEach((start, id) => {
        const elapsed = now - start;
        if (elapsed > 0) {
          const cur = pendingTimeRef.current.get(id) || 0;
          pendingTimeRef.current.set(id, cur + Math.min(elapsed, 5 * 60 * 1000));
          sectionStartRef.current.set(id, now); // reinicia o relógio
        }
      });
    }

    // Envia tudo o que está pendente
    pendingTimeRef.current.forEach((ms, id) => {
      if (ms <= 0) return;
      const order = sectionOrderRef.current.get(id) || 0;
      void supabase.rpc("increment_section_time", {
        p_session_id: sessionId,
        p_section_id: id,
        p_section_order: order,
        p_page: page,
        p_add_ms: Math.round(ms),
      });
    });
    pendingTimeRef.current.clear();
  }

  /**
   * Configura flush periódico (8s) e em eventos de saída de página.
   */
  function setupTimeFlush(sessionId: string) {
    const interval = window.setInterval(() => {
      flushPendingTimes(sessionId, true);
    }, FLUSH_INTERVAL_MS);

    const onHide = () => flushPendingTimes(sessionId, true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);

    (window as any).__landingTimeFlushCleanup = () => {
      window.clearInterval(interval);
    };
  }

  function flushAllSectionTimes() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    flushPendingTimes(sid, true);
  }

  // --- SCROLL TRACKING ---
  function setupScrollTracking(sessionId: string) {
    const milestones = [25, 50, 75, 100];

    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.min(100, (scrollTop / docHeight) * 100);

      milestones.forEach((m) => {
        if (pct >= m && !scrollLoggedRef.current.has(m)) {
          scrollLoggedRef.current.add(m);
          void supabase.from("scroll_milestones").insert({
            session_id: sessionId,
            page,
            milestone: m,
          }).then(() => {});
        }
      });
    };

    let ticking = false;
    const handler = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          onScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handler, { passive: true });
    onScroll(); // initial check

    // store cleanup on a global so React unmount can remove
    (window as any).__landingScrollCleanup = () => {
      window.removeEventListener("scroll", handler);
    };
  }

  // --- CLICK TRACKING ---
  function setupClickTracking(sessionId: string) {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      // walk up to find an interactive element
      const interactive = target.closest<HTMLElement>(
        "a, button, [role='button'], [data-track-click]"
      );
      if (!interactive) return;

      const tag = interactive.tagName.toLowerCase();
      const href = (interactive as HTMLAnchorElement).href || null;
      const text = (interactive.innerText || interactive.textContent || "")
        .trim()
        .slice(0, 80);

      // detect type
      let clickType = "button";
      if (href) {
        if (href.includes("wa.me") || href.includes("whatsapp")) clickType = "whatsapp";
        else if (href.startsWith(window.location.origin) === false && href.startsWith("http")) clickType = "external";
        else if (href.includes("#")) clickType = "anchor";
        else clickType = "link";
      }
      if (interactive.dataset.trackClick) clickType = interactive.dataset.trackClick;

      const clickId =
        interactive.dataset.trackId ||
        interactive.id ||
        interactive.getAttribute("aria-label") ||
        text.slice(0, 40);

      // find owning section — IMPORTANT: skip the interactive element itself
      // (e.g. an AccordionTrigger that carries its own data-track-id like "faq_q1")
      // so we attribute the click to the parent section ("faq"), not the button id.
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
      }).then(() => {});
    };

    document.addEventListener("click", onClick, { capture: true, passive: true });
    (window as any).__landingClickCleanup = () => {
      document.removeEventListener("click", onClick, { capture: true } as any);
    };
  }
}
