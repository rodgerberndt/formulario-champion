import { useEffect, useRef } from "react";

const SESSION_KEY = "champion_session_id";
// Flush a cada 10s. Era 30s "por performance", mas isso enviesava TODA a
// medição: quem saía antes do primeiro flush não gerava nenhum registro de
// tempo, então o painel só enxergava visitantes de sessão longa (média de
// 9 minutos na headline — viés de sobrevivência puro, não tempo real).
const FLUSH_INTERVAL_MS = 10_000;
const MAX_SINGLE_FLUSH_MS = 5 * 60_000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * POST em REST/RPC do Supabase com `keepalive: true`.
 *
 * O client normal (`supabase.from(...)`/`.rpc(...)`) usa fetch comum: quando o
 * evento acontece na saída da página (pagehide) ou logo antes de navegar pro
 * quiz (clique no CTA), o browser cancela a requisição em voo e o evento é
 * perdido. Com keepalive o browser garante a entrega mesmo com o documento
 * sendo descarregado. É o mesmo motivo do sendBeacon do landing-hit no
 * index.html — só que aqui precisamos dos headers de auth do Supabase.
 */
function postKeepalive(path: string, body: unknown) {
  try {
    return fetch(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

export function useLandingTracking(page = "/") {
  const sessionIdRef = useRef<string | null>(null);
  const sectionStartRef = useRef<Map<string, number>>(new Map());
  const sectionOrderRef = useRef<Map<string, number>>(new Map());
  const sectionPosRef = useRef<Map<string, { start: number | null; end: number | null }>>(new Map());
  const sectionLoggedRef = useRef<Set<string>>(new Set());
  // Seções atualmente dentro da viewport (usado pra religar o relógio quando a
  // aba volta do segundo plano).
  const visibleSectionsRef = useRef<Set<string>>(new Set());
  const sectionElsRef = useRef<HTMLElement[]>([]);
  const intervalRef = useRef<number | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  const pageHideHandlerRef = useRef<(() => void) | null>(null);
  const beforeUnloadHandlerRef = useRef<(() => void) | null>(null);
  const clickHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const isFlushingRef = useRef<Set<string>>(new Set());
  // Scroll attention: faixa (0-19, 5% cada) onde o viewport está centrado agora,
  // e quanto tempo (ms) já se acumulou em cada faixa desde o último flush.
  const currentBinRef = useRef<{ bin: number; since: number } | null>(null);
  const pendingBinMsRef = useRef<Map<number, number>>(new Map());
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const scrollTickingRef = useRef(false);
  const milestonesSentRef = useRef<Set<number>>(new Set());
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
      sectionElsRef.current = [];
      sectionStartRef.current.clear();
      sectionOrderRef.current.clear();
      sectionPosRef.current.clear();
      sectionLoggedRef.current.clear();
      visibleSectionsRef.current.clear();
      currentBinRef.current = null;
      pendingBinMsRef.current.clear();
      milestonesSentRef.current.clear();
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
      setupScrollAttention(sid);
      setupTimeFlush(sid);
    };

    init();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /**
   * Onde a seção começa e termina, em % da altura total da página.
   *
   * É isso que alinha o heatmap de scroll com os nomes das seções no admin e
   * que permite inferir "chegou nesta seção" a partir do scroll. Antes o
   * backend chutava essa posição distribuindo as seções uniformemente pela
   * página — um hero de tela cheia era tratado como se ocupasse 1/10 da
   * landing.
   */
  function measureSectionPos(el: HTMLElement): { start: number | null; end: number | null } {
    const docHeight = document.documentElement.scrollHeight;
    if (!docHeight) return { start: null, end: null };
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return {
      start: clamp((top / docHeight) * 100),
      end: clamp(((top + rect.height) / docHeight) * 100),
    };
  }

  function setupSectionTracking(sessionId: string) {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("section[data-track-id], [data-track-id]:not([data-track-click])")
    ).filter((el) => !el.hasAttribute("data-track-click"));

    if (sections.length === 0) {
      window.setTimeout(() => setupSectionTracking(sessionId), 1000);
      return;
    }

    sectionElsRef.current = sections;
    evaluateVisibleSections(sessionId);
  }

  /**
   * Decide quais seções estão sendo lidas agora, por geometria.
   *
   * Substituiu o IntersectionObserver com `intersectionRatio >= 0.2`, que tinha
   * um furo grave: o ratio é a fração do ELEMENTO visível, então uma seção mais
   * alta que ~5 telas nunca alcança 0.2 e NUNCA era registrada. As duas maiores
   * seções da landing caíam nesse caso — a prova social (29% da altura da
   * página) e o método (23%) simplesmente não existiam no funil, e o admin
   * mostrava o visitante pulando da headline direto pra "dor".
   *
   * O critério agora é o inverso e não depende do tamanho da seção: a seção
   * conta como "em leitura" quando cruza a faixa central da tela (25%–75% da
   * viewport), que é onde o olho está.
   */
  function evaluateVisibleSections(sessionId: string) {
    const vh = window.innerHeight;
    const bandTop = vh * 0.25;
    const bandBottom = vh * 0.75;

    sectionElsRef.current.forEach((el) => {
      const id = el.dataset.trackId;
      if (!id) return;
      const order = parseInt(el.dataset.trackOrder || "0", 10);
      sectionOrderRef.current.set(id, order);

      const rect = el.getBoundingClientRect();
      const visible = rect.top < bandBottom && rect.bottom > bandTop;

      if (visible) {
        visibleSectionsRef.current.add(id);
        if (!sectionStartRef.current.has(id)) {
          sectionStartRef.current.set(id, Date.now());
        }
        sectionPosRef.current.set(id, measureSectionPos(el));
        if (!sectionLoggedRef.current.has(id)) {
          sectionLoggedRef.current.add(id);
          void ensureSectionRow(sessionId, id, order);
        }
        return;
      }

      if (visibleSectionsRef.current.delete(id) && sectionStartRef.current.has(id)) {
        void flushSectionTime(sessionId, id, true);
      }
    });
  }

  /**
   * Registra "esta sessão chegou nesta seção" no instante em que ela entra na
   * tela — essa linha é o que o funil do admin conta como "chegou".
   *
   * Usa a RPC increment_section_time com 0ms em vez de um upsert direto na
   * tabela. Motivo: section_views tem RLS com policies de INSERT e UPDATE mas
   * NENHUMA de SELECT, e o Postgres avalia a policy de SELECT no
   * `ON CONFLICT DO UPDATE` que o PostgREST gera — então o upsert estourava
   * 42501 silenciosamente sempre que a linha já existia (mesma armadilha
   * documentada em useTracking.tsx para lead_sessions). A RPC é SECURITY
   * DEFINER e não passa por RLS.
   */
  async function ensureSectionRow(sessionId: string, sectionId: string, order: number) {
    const pos = sectionPosRef.current.get(sectionId);
    await postKeepalive("/rest/v1/rpc/increment_section_time", {
      p_session_id: sessionId,
      p_section_id: sectionId,
      p_section_order: order,
      p_page: page,
      p_add_ms: 0,
      p_pos_start_pct: pos?.start ?? null,
      p_pos_end_pct: pos?.end ?? null,
    });
  }

  async function flushSectionTime(sessionId: string, sectionId: string, resetClock = false) {
    const start = sectionStartRef.current.get(sectionId);
    // O mutex é POR SEÇÃO. Era um booleano global (isFlushingRef): como
    // flushAllSectionTimes dispara todas as seções visíveis em paralelo, a
    // primeira travava o mutex e todas as outras retornavam sem gravar nada —
    // na prática só uma seção por flush chegava no banco.
    if (!start || isFlushingRef.current.has(sectionId)) return;

    const now = Date.now();
    const elapsed = Math.min(Math.max(0, now - start), MAX_SINGLE_FLUSH_MS);
    if (elapsed <= 0) return;

    isFlushingRef.current.add(sectionId);
    const order = sectionOrderRef.current.get(sectionId) || 0;

    // Otimista: avança o relógio ANTES do await. Se esperássemos a resposta, um
    // flush disparado no pagehide (que nunca resolve, a página já morreu)
    // deixaria o relógio parado e contaria o mesmo intervalo duas vezes.
    if (resetClock) {
      sectionStartRef.current.delete(sectionId);
    } else {
      sectionStartRef.current.set(sectionId, now);
    }

    const pos = sectionPosRef.current.get(sectionId);
    await postKeepalive("/rest/v1/rpc/increment_section_time", {
      p_session_id: sessionId,
      p_section_id: sectionId,
      p_section_order: order,
      p_page: page,
      p_add_ms: Math.round(elapsed),
      p_pos_start_pct: pos?.start ?? null,
      p_pos_end_pct: pos?.end ?? null,
    });

    isFlushingRef.current.delete(sectionId);
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

  /**
   * Marcos de 25/50/75/100% de profundidade de scroll.
   *
   * A tabela scroll_milestones existe desde abril e o card "Profundidade de
   * scroll" do admin lê dela — mas NENHUM código gravava nela, então o card
   * vivia zerado e a inferência de "chegou na seção" por scroll do funil nunca
   * teve dado nenhum pra usar.
   */
  function checkScrollMilestones(sessionId: string) {
    const docHeight = document.documentElement.scrollHeight;
    if (!docHeight) return;
    const depth = ((window.scrollY + window.innerHeight) / docHeight) * 100;
    [25, 50, 75, 100].forEach((m) => {
      if (depth + 0.5 < m || milestonesSentRef.current.has(m)) return;
      milestonesSentRef.current.add(m);
      void postKeepalive("/rest/v1/scroll_milestones", {
        session_id: sessionId,
        page,
        milestone: m,
      });
    });
  }

  function setupScrollAttention(sessionId: string) {
    currentBinRef.current = { bin: computeCurrentBin(), since: Date.now() };
    checkScrollMilestones(sessionId);

    scrollHandlerRef.current = () => {
      if (scrollTickingRef.current) return;
      scrollTickingRef.current = true;
      requestAnimationFrame(() => {
        scrollTickingRef.current = false;
        evaluateVisibleSections(sessionId);
        checkScrollMilestones(sessionId);
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
        postKeepalive("/rest/v1/rpc/increment_scroll_bin_time", {
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
      evaluateVisibleSections(sessionId);
      void flushAllSectionTimes();
      void flushScrollBins(sessionId);
    }, FLUSH_INTERVAL_MS);

    pageHideHandlerRef.current = () => {
      void flushAllSectionTimes();
      void flushScrollBins(sessionId);
    };
    window.addEventListener("pagehide", pageHideHandlerRef.current);

    // Aba em segundo plano não é leitura: grava o que já foi lido e PARA o
    // relógio de todas as seções. Quando a aba volta, o relógio recomeça do
    // zero (o observer já tem as seções visíveis marcadas). Sem isso, uma aba
    // esquecida aberta somava minutos direto no tempo médio da seção.
    visibilityHandlerRef.current = () => {
      if (document.visibilityState === "hidden") {
        void flushAllSectionTimes();
        void flushScrollBins(sessionId);
        sectionStartRef.current.forEach((_, id) => sectionStartRef.current.delete(id));
        currentBinRef.current = null;
      } else {
        const now = Date.now();
        sectionLoggedRef.current.forEach((id) => {
          // Só religa o relógio das seções que continuam na tela.
          if (visibleSectionsRef.current.has(id)) sectionStartRef.current.set(id, now);
        });
        currentBinRef.current = { bin: computeCurrentBin(), since: now };
      }
    };
    document.addEventListener("visibilitychange", visibilityHandlerRef.current);
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

      // keepalive: quase todo clique rastreado aqui é num CTA que navega pro
      // /quiz em seguida. Com fetch comum o browser cancelava o insert no meio
      // da navegação e o clique nunca chegava no banco — por isso a coluna
      // "Clicou" do funil vivia zerada mesmo com leads entrando pelo CTA.
      void postKeepalive("/rest/v1/click_events", {
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
