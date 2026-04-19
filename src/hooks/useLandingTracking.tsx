import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "champion_session_id";

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
  const sectionStartRef = useRef<Map<string, number>>(new Map());
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
      document.querySelectorAll<HTMLElement>("[data-track-id]")
    );
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

          if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
            sectionStartRef.current.set(id, Date.now());

            if (!sectionLoggedRef.current.has(id)) {
              sectionLoggedRef.current.add(id);
              insertSectionView(sessionId, id, order);
            }
          } else if (sectionStartRef.current.has(id)) {
            const start = sectionStartRef.current.get(id)!;
            const elapsed = Date.now() - start;
            sectionStartRef.current.delete(id);
            updateSectionTime(sessionId, id, elapsed);
          }
        });
      },
      { threshold: [0, 0.2, 0.5, 0.8] }
    );

    sections.forEach((s) => observer.observe(s));
  }

  async function insertSectionView(sessionId: string, sectionId: string, order: number) {
    try {
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

  async function updateSectionTime(sessionId: string, sectionId: string, addMs: number) {
    try {
      // Read current time_spent_ms then update; cheap because only on exit
      const { data } = await supabase
        .from("section_views")
        .select("time_spent_ms")
        .eq("session_id", sessionId)
        .eq("section_id", sectionId)
        .eq("page", page)
        .maybeSingle();

      const current = data?.time_spent_ms ?? 0;
      await supabase
        .from("section_views")
        .update({
          time_spent_ms: current + Math.min(addMs, 5 * 60 * 1000), // cap 5min
          last_seen_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId)
        .eq("section_id", sectionId)
        .eq("page", page);
    } catch (e) {
      // ignore
    }
  }

  function flushAllSectionTimes() {
    const sid = sessionIdRef.current;
    if (!sid) return;
    sectionStartRef.current.forEach((start, id) => {
      const elapsed = Date.now() - start;
      // best-effort, fire-and-forget
      void updateSectionTime(sid, id, elapsed);
    });
    sectionStartRef.current.clear();
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

      // find owning section
      const section = interactive.closest<HTMLElement>("[data-track-id]");
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
