// ── Jornada do lead — o que essa pessoa fez antes de virar lead ──────────────
//
// A tabela `leads` não guarda `session_id`: o quiz grava o lead por um caminho e
// o tracking grava a sessão por outro. Para reconstruir a jornada é preciso
// casar as duas pontas, e a ordem de confiança é esta:
//
//   1. submit — o evento `submit` da sessão e a criação do lead são o MESMO
//               instante, por construção: o quiz grava o lead e dispara o evento
//               na mesma ação. Medido nos dados reais, a diferença entre os dois
//               é de 0 a 1 segundo. É casamento exato, não estimativa.
//   2. fbp    — cookie do navegador (_fbp). Serve para achar as visitas
//               ANTERIORES do mesmo navegador, já que elas não têm submit.
//   3. IP     — último recurso, e o único que erra: agrupa quem divide a rede
//               (operadora móvel, escritório). Quando é ele que resolve, a
//               resposta devolve `ip_shared_risk` e a tela avisa.
//
// A ordem importa. Casar por IP primeiro atribuía a headline errada quando duas
// pessoas da mesma rede visitavam o site no mesmo dia.
//
// Nada aqui é estimado: se não casar, a resposta diz que não casou. Jornada
// inventada é pior que jornada ausente.

// Inclui as variantes do teste de subheadline (SH0..SH5), que rodam sobre a
// headline HD3. Espelha src/config/headlineVariants.ts e subheadlineVariants.ts.
const LANDING_PATHS = [
  "/", "/HD0", "/HD1", "/HD2", "/HD3", "/HD4",
  "/SH0", "/SH1", "/SH2", "/SH3", "/SH4", "/SH5", "/SH6",
];

// Estrutura da página, na ordem em que ela existe. Mesma lista do funil por
// seção (LANDING_SECTIONS no index.ts e src/config/landingSections.ts). A ordem
// vem daqui e não do `section_order` gravado: dado antigo carrega numeração de
// versões anteriores da landing.
// Cada `order` é ÚNICO: `social_proof` e `success_cases` ficaram empatados em
// 20 até 17/09/2026, e ordenação com empate saía diferente a cada abertura.
// `social_proof` saiu da página e por isso saiu daqui; seção fora da lista cai
// em `order = 999` e aparece no fim, que é o certo para dado histórico.
const LANDING_SECTIONS: { id: string; order: number }[] = [
  { id: "hero", order: 10 },
  { id: "success_cases", order: 20 },
  { id: "dor", order: 30 },
  { id: "metodo", order: 40 },
  { id: "criativos", order: 60 },
  { id: "cta_intermediario", order: 70 },
  { id: "como_funciona", order: 80 },
  { id: "faq", order: 90 },
  { id: "cta_final", order: 100 },
];

/** Tolerância entre o `submit` da sessão e a criação do lead. */
const SUBMIT_MATCH_WINDOW_MS = 15 * 60 * 1000;

/** Acima disso, o IP quase certamente é compartilhado (NAT de operadora). */
const SHARED_IP_SESSION_THRESHOLD = 15;

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  first_page: string | null;
  last_page: string | null;
  utm_content: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  started_quiz: boolean | null;
  completed: boolean | null;
  current_step_id: string | null;
  ip_address: string | null;
  fbp: string | null;
}

interface EventRow {
  session_id: string;
  event_name: string;
  page: string | null;
  step_id: string | null;
  created_at: string;
}

export interface LeadJourneyResult {
  matched: boolean;
  match_method: "submit" | "fbp" | "ip" | "nenhum";
  ip_shared_risk: boolean;
  reason?: string;
  session?: {
    id: string;
    started_at: string;
    device: string | null;
    headline_path: string | null;
    utm_content: string | null;
    entered_quiz: boolean;
    completed: boolean;
  };
  landing?: {
    first_view_at: string | null;
    click_at: string | null;
    /** Relógio: da primeira visualização até sair da página. */
    seconds_to_click: number | null;
    /**
     * Tempo REAL de leitura: o menor entre o relógio e a soma das seções.
     * O relógio superestima quem deixou a aba parada; a soma das seções
     * superestima quando o medidor não pausou (navegador in-app do Instagram
     * não dispara visibilitychange). O menor dos dois é o único que não conta
     * tempo que a pessoa não passou lendo.
     */
    time_on_landing_ms: number | null;
    /** Tempo bruto gravado, incluindo aba aberta em segundo plano. */
    raw_time_ms: number | null;
    returned_after_click: boolean;
    sections: Array<{ section_id: string; order: number; time_ms: number; raw_ms: number; after_click: boolean }>;
  };
  quiz?: {
    entered_at: string | null;
    submitted_at: string | null;
    seconds_in_quiz: number | null;
    completed: boolean;
    last_step: string | null;
    steps: Array<{ step_id: string; seconds: number | null }>;
  };
  history?: {
    total_sessions: number;
    previous_sessions: number;
    first_seen_at: string | null;
    days_since_first_visit: number | null;
    previous: Array<{
      created_at: string;
      page: string | null;
      entered_quiz: boolean;
      completed: boolean;
    }>;
  };
}

const secondsBetween = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null;
  const diff = (Date.parse(b) - Date.parse(a)) / 1000;
  return isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
};

export async function buildLeadJourney(supabase: any, leadId: string): Promise<LeadJourneyResult> {
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, created_at, ip_address, fbp, is_duplicate_ip")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return { matched: false, match_method: "nenhum", ip_shared_risk: false, reason: "Lead não encontrado." };

  // ── Candidatas: mesmo navegador (fbp) ou mesma rede (IP) ──
  let sessions: SessionRow[] = [];
  let method: "submit" | "fbp" | "ip" | "nenhum" = "nenhum";

  const columns = "id, created_at, last_seen_at, first_page, last_page, utm_content, utm_campaign, device_type, started_quiz, completed, current_step_id, ip_address, fbp";

  // Caminho exato: o evento `submit` gravado junto da criação do lead. Uma
  // janela de 3 minutos é folgada de sobra — na prática a diferença é de
  // segundos — e o desempate pega o mais próximo.
  const leadCreatedAt = Date.parse(lead.created_at);
  const submitFrom = new Date(leadCreatedAt - 3 * 60_000).toISOString();
  const submitTo = new Date(leadCreatedAt + 3 * 60_000).toISOString();
  const { data: submitEvents } = await supabase
    .from("lead_events")
    .select("session_id, created_at")
    .eq("event_name", "submit")
    .gte("created_at", submitFrom)
    .lte("created_at", submitTo);

  let submitSessionId: string | null = null;
  if (submitEvents?.length) {
    let best = Infinity;
    for (const e of submitEvents) {
      const delta = Math.abs(Date.parse(e.created_at) - leadCreatedAt);
      if (delta < best) {
        best = delta;
        submitSessionId = e.session_id;
      }
    }
  }

  if (submitSessionId) {
    const { data } = await supabase.from("lead_sessions").select(columns).eq("id", submitSessionId).maybeSingle();
    if (data) {
      sessions = [data];
      method = "submit";
      // As visitas anteriores continuam vindo do navegador ou da rede: elas não
      // têm submit nenhum para casar.
      const identity = data.fbp
        ? { column: "fbp", value: data.fbp }
        : (data.ip_address ? { column: "ip_address", value: data.ip_address } : null);
      if (identity) {
        const { data: siblings } = await supabase
          .from("lead_sessions")
          .select(columns)
          .eq(identity.column, identity.value);
        if (siblings?.length) {
          const seen = new Set([data.id]);
          for (const sib of siblings) {
            if (!seen.has(sib.id)) {
              sessions.push(sib);
              seen.add(sib.id);
            }
          }
        }
      }
    }
  }

  if (!sessions.length && lead.fbp) {
    const { data } = await supabase.from("lead_sessions").select(columns).eq("fbp", lead.fbp);
    if (data?.length) {
      sessions = data;
      method = "fbp";
    }
  }
  if (!sessions.length && lead.ip_address) {
    const { data } = await supabase.from("lead_sessions").select(columns).eq("ip_address", lead.ip_address);
    if (data?.length) {
      sessions = data;
      method = "ip";
    }
  }
  if (!sessions.length) {
    return {
      matched: false,
      match_method: "nenhum",
      ip_shared_risk: false,
      reason: lead.ip_address || lead.fbp
        ? "Nenhuma sessão de navegação registrada para este visitante. Leads antigos são anteriores ao tracking atual."
        : "Este lead não tem IP nem cookie de navegador gravados, então não há como ligá-lo a uma sessão.",
    };
  }

  sessions.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const leadTime = Date.parse(lead.created_at);
  // Só existe risco de mistura quando foi o IP que decidiu QUAL sessão é a da
  // conversão. Com o submit casado, a sessão é certa — o IP no máximo traz
  // visitas anteriores de outra pessoa da mesma rede.
  const ipSharedRisk = method === "ip" && (sessions.length > SHARED_IP_SESSION_THRESHOLD || !!lead.is_duplicate_ip);

  // ── Eventos das candidatas ──
  const ids = sessions.map((s) => s.id);
  const { data: eventRows } = await supabase
    .from("lead_events")
    .select("session_id, event_name, page, step_id, created_at")
    .in("session_id", ids)
    .order("created_at", { ascending: true });
  const events: EventRow[] = eventRows || [];

  const bySession = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = bySession.get(e.session_id) || [];
    list.push(e);
    bySession.set(e.session_id, list);
  }

  // ── Sessão de conversão ──
  let converted: SessionRow | null = method === "submit" ? (sessions.find((s) => s.id === submitSessionId) || null) : null;
  let bestDelta = Infinity;
  if (!converted) for (const s of sessions) {
    for (const e of (bySession.get(s.id) || [])) {
      if (e.event_name !== "submit") continue;
      const delta = Math.abs(Date.parse(e.created_at) - leadTime);
      if (delta < bestDelta && delta <= SUBMIT_MATCH_WINDOW_MS) {
        bestDelta = delta;
        converted = s;
      }
    }
  }
  // Sem `submit` casado (o evento pode ter se perdido na navegação): cai para a
  // última sessão iniciada antes do lead existir.
  if (!converted) {
    const before = sessions.filter((s) => Date.parse(s.created_at) <= leadTime + 5 * 60 * 1000);
    converted = before.length ? before[before.length - 1] : sessions[sessions.length - 1];
  }

  const convEvents = bySession.get(converted.id) || [];
  const isLanding = (page: string | null) => !!page && LANDING_PATHS.includes(page);

  // ── Landing: da primeira visualização até o clique que leva ao quiz ──
  const firstLandingView = convEvents.find((e) => e.event_name === "page_view" && isLanding(e.page)) || null;
  const clickToQuiz = convEvents.find((e) => e.event_name === "start_click" && isLanding(e.page))
    || convEvents.find((e) => e.event_name === "click_outbound" && isLanding(e.page))
    || null;

  // A headline é a PRIMEIRA página de landing vista na sessão: a variante manda
  // o visitante para /HDx e a navegação seguinte pode registrar "/" por cima.
  const headlinePath = isLanding(converted.first_page)
    ? converted.first_page
    : (firstLandingView?.page || null);

  const { data: sectionRows } = await supabase
    .from("section_views")
    .select("section_id, time_spent_ms, page, first_seen_at, last_seen_at")
    .eq("session_id", converted.id);

  // Uma seção pode ter DUAS linhas na mesma sessão, uma por valor de `page`: a
  // variante entra em /HDx e a navegação seguinte registra "/" por cima. É a
  // mesma leitura do mesmo bloco, então agrega por section_id — sem isso a
  // tela mostrava "Headline" duas vezes com tempos diferentes.
  const agg = new Map<string, { raw: number; firstSeen: number; lastSeen: number }>();
  for (const row of (sectionRows || [])) {
    if (!isLanding(row.page)) continue;
    const id = row.section_id as string;
    const first = Date.parse(row.first_seen_at);
    const last = Date.parse(row.last_seen_at || row.first_seen_at);
    const cur = agg.get(id);
    if (cur) {
      cur.raw += Number(row.time_spent_ms) || 0;
      cur.firstSeen = Math.min(cur.firstSeen, first);
      cur.lastSeen = Math.max(cur.lastSeen, last);
    } else {
      agg.set(id, { raw: Number(row.time_spent_ms) || 0, firstSeen: first, lastSeen: last });
    }
  }

  // O cronômetro da seção não para quando a pessoa clica: o CTA abre o quiz e a
  // landing continua aberta atrás, acumulando tempo. Por isso o hero deste lead
  // aparecia com 2min32 enquanto ele levou 22 segundos para clicar. A leitura
  // que interessa é a de ANTES do clique, e ela não pode ser maior que a janela
  // entre ver a seção e clicar.
  // Momento em que a leitura da landing acabou: o clique no CTA, ou a entrada no
  // quiz quando o clique não foi registrado. Tudo depois disso é tempo de quiz
  // ou aba esquecida aberta — nunca leitura.
  const quizEntryEvent = convEvents.find((e) => e.event_name === "quiz_view")
    || convEvents.find((e) => e.page === "/quiz")
    || null;
  const leftLandingAt = clickToQuiz?.created_at || quizEntryEvent?.created_at || null;
  const clickTime = leftLandingAt ? Date.parse(leftLandingAt) : null;
  const knownOrder = new Map(LANDING_SECTIONS.map((s) => [s.id, s.order]));
  const sections = [...agg.entries()]
    .map(([section_id, v]) => {
      const afterClick = clickTime !== null && v.firstSeen > clickTime;
      const cap = clickTime !== null ? Math.max(0, clickTime - v.firstSeen) : v.raw;
      return {
        section_id,
        order: knownOrder.get(section_id) ?? 999,
        time_ms: afterClick ? 0 : Math.min(v.raw, cap),
        raw_ms: v.raw,
        after_click: afterClick,
      };
    })
    .sort((a, b) => a.order - b.order);
  const sectionsTime = sections.reduce((sum, s) => sum + s.time_ms, 0);
  const rawTime = sections.reduce((sum, s) => sum + s.raw_ms, 0);
  const returnedAfterClick = sections.some((s) => s.after_click);

  // Duas medições independentes do mesmo tempo, cada uma com seu viés:
  //   • relógio (primeira visualização → saída) conta a aba parada sem ninguém lendo;
  //   • soma das seções conta a mais quando o medidor não pausou, e conta a
  //     menos quando duas seções dividem a tela (elas se sobrepõem).
  // A leitura honesta é a menor das duas.
  const firstViewAt = firstLandingView?.created_at || converted.created_at;
  const wallClockMs = clickTime !== null ? Math.max(0, clickTime - Date.parse(firstViewAt)) : null;
  const timeOnLanding = wallClockMs !== null && sectionsTime > 0
    ? Math.min(wallClockMs, sectionsTime)
    : (sectionsTime || wallClockMs || 0);

  // Cada seção é limitada à janela entre aparecer e o clique, o que é correto
  // uma a uma mas somava mais que o tempo total da visita: com oito seções
  // vistas nos primeiros vinte segundos, cada uma podia reivindicar esses vinte
  // segundos inteiros. As barras passam a dividir o tempo REAL na página na
  // proporção medida — a forma (onde a pessoa parou mais) se mantém, e a soma
  // fecha com o número exibido em cima.
  if (sectionsTime > timeOnLanding && sectionsTime > 0) {
    const scale = timeOnLanding / sectionsTime;
    for (const sec of sections) sec.time_ms = Math.round(sec.time_ms * scale);
  }

  // ── Quiz: da entrada até o envio, e o tempo gasto em cada pergunta ──
  const quizEntry = quizEntryEvent;
  const submit = convEvents.find((e) => e.event_name === "submit") || null;

  const stepViews = convEvents.filter((e) => e.event_name === "step_view" && e.step_id);
  const steps = stepViews.map((e, i) => {
    const next = stepViews[i + 1];
    const end = next ? next.created_at : (submit ? submit.created_at : null);
    return { step_id: e.step_id as string, seconds: secondsBetween(e.created_at, end) };
  });

  // ── Histórico: sessões anteriores à da conversão ──
  const previous = sessions.filter((s) => s.id !== converted.id && s.created_at < converted.created_at);
  const firstSeen = sessions[0]?.created_at || null;

  return {
    matched: true,
    match_method: method,
    ip_shared_risk: ipSharedRisk,
    session: {
      id: converted.id,
      started_at: converted.created_at,
      device: converted.device_type,
      headline_path: headlinePath,
      utm_content: converted.utm_content,
      entered_quiz: !!converted.started_quiz || !!quizEntry,
      completed: !!converted.completed || !!submit,
    },
    landing: {
      first_view_at: firstViewAt,
      click_at: leftLandingAt,
      seconds_to_click: secondsBetween(firstViewAt, leftLandingAt),
      time_on_landing_ms: timeOnLanding || null,
      raw_time_ms: rawTime || null,
      returned_after_click: returnedAfterClick,
      sections,
    },
    quiz: {
      entered_at: quizEntry?.created_at || null,
      submitted_at: submit?.created_at || null,
      seconds_in_quiz: secondsBetween(quizEntry?.created_at || null, submit?.created_at || null),
      completed: !!submit,
      last_step: stepViews.length ? (stepViews[stepViews.length - 1].step_id as string) : converted.current_step_id,
      steps,
    },
    history: {
      total_sessions: sessions.length,
      previous_sessions: previous.length,
      first_seen_at: firstSeen,
      days_since_first_visit: firstSeen
        ? Math.max(0, Math.round((leadTime - Date.parse(firstSeen)) / 86400000))
        : null,
      previous: previous.slice(-8).map((s) => ({
        created_at: s.created_at,
        page: s.first_page,
        entered_quiz: !!s.started_quiz,
        completed: !!s.completed,
      })),
    },
  };
}


/**
 * Headline de entrada de vários leads de uma vez.
 *
 * Mesma regra do casamento individual, em lote: o evento `submit` da sessão e a
 * criação do lead acontecem no mesmo instante, então basta olhar quem enviou o
 * formulário junto de cada lead. Serve às listas de reuniões e de vendas, onde
 * a pergunta é "de qual headline veio essa call" e abrir o modal de cada lead
 * para descobrir não é resposta.
 *
 * Devolve um mapa lead_id → página de entrada ("/", "/HD3", ...). Lead sem
 * evento de envio gravado simplesmente não entra no mapa: a tela mostra um
 * traço, nunca um chute.
 */
export async function resolveHeadlineByLead(
  supabase: any,
  leadIds: string[],
): Promise<Record<string, string>> {
  if (!leadIds.length) return {};

  const { data: leads } = await supabase
    .from("leads")
    .select("id, created_at")
    .in("id", leadIds);
  if (!leads?.length) return {};

  const times = leads.map((l: any) => Date.parse(l.created_at)).filter((t: number) => !Number.isNaN(t));
  if (!times.length) return {};
  const from = new Date(Math.min(...times) - 3 * 60_000).toISOString();
  const to = new Date(Math.max(...times) + 3 * 60_000).toISOString();

  const { data: submits } = await supabase
    .from("lead_events")
    .select("session_id, created_at")
    .eq("event_name", "submit")
    .gte("created_at", from)
    .lte("created_at", to);
  if (!submits?.length) return {};

  const sessionIds = [...new Set(submits.map((e: any) => e.session_id).filter(Boolean))];
  const { data: sessions } = await supabase
    .from("lead_sessions")
    .select("id, first_page")
    .in("id", sessionIds);
  const pageBySession = new Map<string, string>();
  for (const s of (sessions || [])) {
    if (s.first_page && LANDING_PATHS.includes(s.first_page)) pageBySession.set(s.id, s.first_page);
  }

  const result: Record<string, string> = {};
  for (const lead of leads) {
    const leadTime = Date.parse(lead.created_at);
    let best = Infinity;
    let page: string | null = null;
    for (const e of submits) {
      const delta = Math.abs(Date.parse(e.created_at) - leadTime);
      if (delta < best) {
        const candidate = pageBySession.get(e.session_id);
        if (candidate) {
          best = delta;
          page = candidate;
        }
      }
    }
    if (page) result[lead.id] = page;
  }
  return result;
}
