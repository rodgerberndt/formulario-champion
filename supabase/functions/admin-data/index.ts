import { createClient } from "jsr:@supabase/supabase-js@2";
// redeploy: include revenue_assessoria_received/to_receive in totals
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

// build: qualified_count v2 (≥R$5k)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  // Required for CORS preflight on non-simple methods (e.g. PUT)
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get admin token from header
    const adminToken = req.headers.get("x-admin-token");
    
    if (!adminToken) {
      return new Response(
        JSON.stringify({ error: "Token não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isValid = await verifyAdminToken(adminToken);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const rawPath = url.pathname;
    // Handle both direct invocation and proxy paths
    const path = rawPath.includes("/admin-data") 
      ? rawPath.substring(rawPath.indexOf("/admin-data") + "/admin-data".length)
      : rawPath;
    
    console.log("Request path:", rawPath, "->", path);

    // GET /leads - List leads from legacy table
    if (path === "/leads" && req.method === "GET") {
      const search = url.searchParams.get("q");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);

      // Apply date filters — supports both ISO timestamps and date-only strings
      if (from) {
        query = query.gte("created_at", from);
      }
      if (to) {
        // If already ISO (contains T), use directly; otherwise append end-of-day
        const toEnd = to.includes("T") ? to : to + "T23:59:59.999Z";
        query = query.lte("created_at", toEnd);
      }

      if (search) {
        query = query.or(`nome_completo.ilike.%${search}%,whatsapp.ilike.%${search}%,instagram.ilike.%${search}%,mercado.ilike.%${search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PUT /leads/:id - Update lead (e.g., mark as read)
    const leadUpdateMatch = path.match(/^\/leads\/([a-f0-9-]+)$/);
    if (leadUpdateMatch && req.method === "PUT") {
      const leadId = leadUpdateMatch[1];
      const body = await req.json();

      // Fetch current lead state before update (including lido for auto-increment)
      const leadForCheck = await supabase
        .from("leads")
        .select("sdr_override, investimento_faixa, lido")
        .eq("id", leadId)
        .maybeSingle();
      const currentLead = leadForCheck.data;

      // Check if sdr_override is being set to "Caio" for a true MQL faixa only
      const mqlFaixas = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
        "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
        "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
        "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
        "Acima de R$ 10 milhões", "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
      ];
      const nextInvestimentoFaixa = body.investimento_faixa ?? currentLead?.investimento_faixa;
      // Migrate: treat "Rodger" override as "Caio"
      if (body.sdr_override === "Rodger") body.sdr_override = "Caio";
      const isSettingMQL = body.sdr_override === "Caio" && mqlFaixas.includes(nextInvestimentoFaixa || "");

      let wasMQL = false;
      if (isSettingMQL) {
        wasMQL = currentLead?.sdr_override === "Caio" || currentLead?.sdr_override === "Rodger";
      }

      // Detect lido transition: false -> true
      const wasLido = currentLead?.lido === true;
      const isSettingLido = body.lido === true;
      const isLidoTransition = !wasLido && isSettingLido;

      // First-open response-time tracking: stamp first_opened_at exactly once
      // Body flag `mark_opened: true` triggers the stamp (only if not already set).
      if (body.mark_opened === true) {
        delete body.mark_opened;
        // Only set if currently null in DB
        const { data: existing } = await supabase
          .from("leads")
          .select("first_opened_at")
          .eq("id", leadId)
          .maybeSingle();
        if (existing && !existing.first_opened_at) {
          body.first_opened_at = new Date().toISOString();
        }
      }

      const { data, error } = await supabase
        .from("leads")
        .update(body)
        .eq("id", leadId)
        .select()
        .maybeSingle();

      if (error) throw error;

      // Auto-increment mqls_chamados when an MQL lead is marked as lido
      if (isLidoTransition && data) {
        const SDR_CAIO_FAT = [
          "De R$ 5 mil a R$ 10 mil", "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
          "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
          "De R$ 100 mil a R$ 150 mil", "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil",
          "De R$ 300 mil a R$ 500 mil", "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão",
          "De R$ 1 milhão a R$ 2 milhões", "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões",
          "De R$ 5 milhões a R$ 10 milhões", "Acima de R$ 10 milhões",
        ];
        const leadInvest = data.investimento_faixa || "";
        let sdrName = "Miguel";
        if (data.sdr_override) {
          if (data.sdr_override === "Rodger") sdrName = "Caio";
          else if (data.sdr_override === "Dara") sdrName = "Miguel";
          else sdrName = data.sdr_override;
        }
        else if (SDR_CAIO_FAT.includes(leadInvest)) sdrName = "Caio";

        const isMql = mqlFaixas.includes(leadInvest);
        if (isMql) {
          const today = new Date().toISOString().slice(0, 10);
          try {
            const { data: existingReport } = await supabase
              .from("daily_reports")
              .select("id, mqls_chamados")
              .eq("report_date", today)
              .eq("sdr_name", sdrName)
              .maybeSingle();

            // Only increment if a report already exists for today/SDR.
            // Do NOT auto-create reports — SDRs must create them manually.
            if (existingReport) {
              await supabase
                .from("daily_reports")
                .update({ mqls_chamados: (existingReport.mqls_chamados || 0) + 1 })
                .eq("id", existingReport.id);
              console.log(`Auto-incremented mqls_chamados for ${sdrName} on ${today}`);
            } else {
              console.log(`Skipped auto-create of daily_report for ${sdrName} on ${today} (no existing report)`);
            }
          } catch (mqErr) {
            console.error("Error auto-incrementing mqls_chamados:", mqErr);
          }
        }
      }

      // Fire Meta CAPI MQL event if sdr_override just changed to MQL-eligible "Caio"
      if (isSettingMQL && !wasMQL) {
        try {
          const capiUrl = `${supabaseUrl}/functions/v1/meta-capi`;
          const capiRes = await fetch(capiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ lead_id: leadId, event_name: "MQL" }),
          });
          const capiResult = await capiRes.json();
          console.log("Meta CAPI MQL result:", JSON.stringify(capiResult));

          if (capiRes.ok && capiResult.success) {
            const currentCapi = data?.capi_events_sent || {};
            await supabase
              .from("leads")
              .update({ capi_events_sent: { ...currentCapi, MQL: true } })
              .eq("id", leadId);
          }
        } catch (capiErr) {
          console.error("Error calling meta-capi:", capiErr);
        }
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sessions - List sessions with filters
    if (path === "/sessions" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const status = url.searchParams.get("status");
      const buttonId = url.searchParams.get("button_id");
      const search = url.searchParams.get("q");
      const showInternal = url.searchParams.get("show_internal") === "true";
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = (page - 1) * limit;

      let query = supabase
        .from("lead_sessions")
        .select("*", { count: "exact" })
        .order("last_seen_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter out internal/noise sessions by default
      if (!showInternal) {
        // Exclude Lovable preview referrers
        query = query.not("referrer", "ilike", "%lovable.dev%")
          .not("referrer", "ilike", "%lovableproject.com%")
          .not("referrer", "ilike", "%forceHideBadge%");
        // Exclude admin-only visits
        query = query.neq("first_page", "/admin");
      }

      // Apply filters
      if (from) {
        query = query.gte("last_seen_at", from);
      }
      if (to) {
        const toEnd = to.includes("T") ? to : to + "T23:59:59.999Z";
        query = query.lte("last_seen_at", toEnd);
      }
      if (buttonId) {
        query = query.eq("start_button_id", buttonId);
      }
      if (status) {
        switch (status) {
          case "completed":
            query = query.eq("completed", true);
            break;
          case "started":
            query = query.eq("started_quiz", true).eq("completed", false);
            break;
          case "entered":
            query = query.eq("entered_quiz_page", true).eq("started_quiz", false);
            break;
          case "not_entered":
            query = query.eq("entered_quiz_page", false);
            break;
          case "interacted":
            // Sessions that had any interaction (entered quiz page OR started quiz)
            query = query.eq("entered_quiz_page", true);
            break;
        }
      }
      if (search) {
        query = query.or(`lead_name.ilike.%${search}%,lead_whatsapp.ilike.%${search}%,lead_instagram.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({ data, total: count, page, limit }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sessions/:id - Get session details
    const sessionMatch = path.match(/^\/sessions\/([a-f0-9-]+)$/);
    if (sessionMatch && req.method === "GET") {
      const sessionId = sessionMatch[1];
      
      const { data, error } = await supabase
        .from("lead_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return new Response(
          JSON.stringify({ error: "Sessão não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /sessions/:id/events - Get session events
    const eventsMatch = path.match(/^\/sessions\/([a-f0-9-]+)\/events$/);
    if (eventsMatch && req.method === "GET") {
      const sessionId = eventsMatch[1];
      
      const { data, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /weekly-metrics - Aggregate visitors / quiz entries / completions per calendar day (America/Sao_Paulo)
    if (path === "/weekly-metrics" && req.method === "GET") {
      let from = url.searchParams.get("from");
      let to = url.searchParams.get("to");

      // Clamp range to a maximum of 90 days to avoid worker resource limits.
      // The weekly-analysis section only renders day-of-week aggregates, so
      // ranges longer than ~3 months provide no extra signal but easily OOM.
      const MAX_DAYS = 31;
      if (from && to) {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();
        if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
          const spanDays = (toMs - fromMs) / 86400000;
          if (spanDays > MAX_DAYS) {
            const clampedFromMs = toMs - MAX_DAYS * 86400000;
            from = new Date(clampedFromMs).toISOString();
          }
        }
      }
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      async function fetchAllPaged<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 8000; // hard cap to prevent OOM/CPU exhaustion (503)
        let all: T[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore && all.length < MAX_ROWS) {
          let q = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
          q = filters(q);
          const { data, error } = await q;
          if (error) throw error;
          if (data) all = all.concat(data as T[]);
          hasMore = (data?.length || 0) === PAGE_SIZE;
          offset += PAGE_SIZE;
        }
        return all;
      }

      // Fetch sessions acquired in range (cohort by first touch)
      const rawSessions = await fetchAllPaged<any>(
        "lead_sessions",
        "id, ip_address, created_at, last_seen_at, referrer, first_page, completed",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );

      // Filter internal/noise traffic (same rules as /metrics)
      const sessions = rawSessions.filter((s: any) => {
        const ref = (s.referrer || "").toLowerCase();
        const firstPage = (s.first_page || "").toLowerCase();
        if (ref.includes("lovable.dev") || ref.includes("lovableproject.com") || ref.includes("lovable.app/?forcehidebadge")) return false;
        if (firstPage === "/admin") return false;
        return true;
      });
      const sessionIds = new Set(sessions.map((s: any) => s.id));

      // Fetch events to detect quiz entry (quiz_view event)
      const events = await fetchAllPaged<any>(
        "lead_events",
        "event_name, session_id, created_at",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          // Only need quiz_view + submit events for weekly aggregation
          q = q.in("event_name", ["quiz_view", "submit"]);
          return q;
        }
      );
      const enteredQuizSessionIds = new Set(
        events
          .filter((e: any) => e.event_name === "quiz_view" && sessionIds.has(e.session_id))
          .map((e: any) => e.session_id)
      );

      // Completions = submits do período + fallback para sessões ativas no período
      // que terminaram com completed=true mas ficaram sem event submit.
      const submittedSessionIds = new Set(
        events
          .filter((e: any) => e.event_name === "submit" && sessionIds.has(e.session_id))
          .map((e: any) => e.session_id)
      );
      sessions.forEach((s: any) => {
        if (s.completed && !submittedSessionIds.has(s.id)) submittedSessionIds.add(s.id);
      });

      // Fetch ad_spend in range. ad_spend.date is a DATE column already in
      // local calendar (no timezone conversion needed) — query as YYYY-MM-DD.
      const fromYmd = from ? from.slice(0, 10) : null;
      const toYmd = to ? to.slice(0, 10) : null;
      const adSpendRows = await fetchAllPaged<any>(
        "ad_spend",
        "date, spend, impressions, clicks",
        (q: any) => {
          if (fromYmd) q = q.gte("date", fromYmd);
          if (toYmd) q = q.lte("date", toYmd);
          return q;
        }
      );

      const leadRows = await fetchAllPaged<any>(
        "leads",
        "id, created_at, ip_address",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );

      // Helpers — convert UTC ISO -> America/Sao_Paulo calendar date (YYYY-MM-DD)
      // SP = UTC-3 (no DST currently). Use Intl for safety.
      const tzFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const toLocalDate = (iso: string): string => {
        // en-CA produces YYYY-MM-DD
        return tzFmt.format(new Date(iso));
      };
      // Day of week 0=Sun..6=Sat, computed from local date string to be safe
      const dowFromYmd = (ymd: string): number => {
        const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
        // Construct as UTC noon to avoid TZ rollover
        return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
      };

      type DayBucket = {
        date: string; // YYYY-MM-DD local
        dow: number;
        visitors: Set<string>; // unique IPs (fallback to session ids if no IP)
        sessions: number;
        entered_quiz: number;
        completed: number;
        spend: number;
        impressions: number;
        clicks: number;
      };
      const byDate = new Map<string, DayBucket>();
      const ensure = (ymd: string): DayBucket => {
        let b = byDate.get(ymd);
        if (!b) {
          b = {
            date: ymd, dow: dowFromYmd(ymd),
            visitors: new Set(), sessions: 0, entered_quiz: 0, completed: 0,
            spend: 0, impressions: 0, clicks: 0,
          };
          byDate.set(ymd, b);
        }
        return b;
      };

      // Per-session -> acquisition date inside the selected range
      const sessionDate = new Map<string, string>();
      sessions.forEach((s: any) => {
        const ymd = toLocalDate(s.created_at || s.last_seen_at);
        sessionDate.set(s.id, ymd);
        const b = ensure(ymd);
        b.sessions += 1;
        const visitorKey = (s.ip_address && s.ip_address !== "unknown") ? s.ip_address : `sess:${s.id}`;
        b.visitors.add(visitorKey);
      });

      const enteredQuizByDay = new Set<string>();
      events.forEach((e: any) => {
        if (e.event_name !== "quiz_view" || !sessionIds.has(e.session_id)) return;
        enteredQuizByDay.add(`${e.session_id}|${toLocalDate(e.created_at)}`);
      });
      enteredQuizByDay.forEach((key) => {
        const [, ymd] = key.split("|");
        ensure(ymd).entered_quiz += 1;
      });

      const completedByDay = new Set<string>();
      events.forEach((e: any) => {
        if (e.event_name !== "submit" || !sessionIds.has(e.session_id)) return;
        completedByDay.add(`${e.session_id}|${toLocalDate(e.created_at)}`);
      });
      submittedSessionIds.forEach((sid) => {
        const ymd = sessionDate.get(sid as string);
        if (!ymd) return;
        completedByDay.add(`${sid}|${ymd}`);
      });
      completedByDay.forEach((key) => {
        const [, ymd] = key.split("|");
        ensure(ymd).completed += 1;
      });

      // ad_spend.date is already a YYYY-MM-DD string aligned to São Paulo
      adSpendRows.forEach((row: any) => {
        const ymd = String(row.date).slice(0, 10);
        const b = ensure(ymd);
        b.spend += Number(row.spend) || 0;
        b.impressions += Number(row.impressions) || 0;
        b.clicks += Number(row.clicks) || 0;
      });

      const leadCountsByDate = new Map<string, number>();
      const leadVisitorsByDate = new Map<string, Set<string>>();
      leadRows.forEach((lead: any) => {
        const ymd = toLocalDate(lead.created_at);
        ensure(ymd);
        leadCountsByDate.set(ymd, (leadCountsByDate.get(ymd) || 0) + 1);
        if (!leadVisitorsByDate.has(ymd)) leadVisitorsByDate.set(ymd, new Set<string>());
        const visitorKey = (lead.ip_address && lead.ip_address !== "unknown")
          ? `ip:${lead.ip_address}`
          : `lead:${lead.id}`;
        leadVisitorsByDate.get(ymd)!.add(visitorKey);
      });

      const days = Array.from(byDate.values())
        .map((b) => {
          const leadVisitors = leadVisitorsByDate.get(b.date);
          leadVisitors?.forEach((visitorKey) => b.visitors.add(visitorKey));
          const leadCompleted = leadCountsByDate.get(b.date) || 0;
          const completed = Math.max(b.completed, leadCompleted);
          const enteredQuiz = Math.max(b.entered_quiz, completed);
          const visitors = Math.max(b.visitors.size, enteredQuiz);
          const sessions = Math.max(b.sessions, completed);

          return {
            date: b.date,
            dow: b.dow,
            visitors,
            sessions,
            entered_quiz: enteredQuiz,
            completed,
            spend: Number(b.spend.toFixed(2)),
            impressions: b.impressions,
            clicks: b.clicks,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      return new Response(
        JSON.stringify({ days }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /metrics - Get funnel metrics
    if (path === "/metrics" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      // Guard: clamp range to max 90 days to avoid 150s timeout on huge windows
      // (e.g. preset "maximum" 2020→today). Heavy queries: landing_hits + lead_events.
      let fromClamped = from;
      if (from && toEnd) {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(toEnd).getTime();
        const MAX_MS = 90 * 24 * 60 * 60 * 1000;
        if (toMs - fromMs > MAX_MS) {
          fromClamped = new Date(toMs - MAX_MS).toISOString();
          console.log(`[metrics] Range clamped to 90d: ${fromClamped} -> ${toEnd}`);
        }
      }

      // Helper to fetch rows with pagination, capped to protect Edge runtime memory/CPU.
      async function fetchAll<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 15000;
        let all: T[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore && all.length < MAX_ROWS) {
          let q = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
          q = filters(q);
          const { data, error } = await q;
          if (error) throw error;
          if (data) all = all.concat(data as T[]);
          hasMore = (data?.length || 0) === PAGE_SIZE;
          offset += PAGE_SIZE;
        }
        if (all.length >= MAX_ROWS) {
          console.warn(`[metrics] ${table} capped at ${MAX_ROWS} rows to avoid runtime exhaustion`);
        }
        return all;
      }

      // Fetch ALL sessions acquired in range (cohort by first touch)
      const rawSessions = await fetchAll<any>("lead_sessions", "id, ip_address, created_at, last_seen_at, referrer, first_page, completed, started_quiz", (q: any) => {
        if (fromClamped) q = q.gte("created_at", fromClamped);
        if (toEnd) q = q.lte("created_at", toEnd);
        return q;
      });

      // Filter out internal/noise sessions:
      // 1. Lovable preview referrers
      // 2. Sessions that started on /admin
      // 3. Lovable project URLs in referrer
      const sessions = rawSessions.filter((s: any) => {
        const ref = (s.referrer || '').toLowerCase();
        const firstPage = (s.first_page || '').toLowerCase();
        // Exclude Lovable previews and editor
        if (ref.includes('lovable.dev') || ref.includes('lovableproject.com') || ref.includes('lovable.app/?forceHideBadge')) return false;
        // Exclude admin-only visits
        if (firstPage === '/admin') return false;
        return true;
      });
      const filteredOutCount = rawSessions.length - sessions.length;

      const sessionIds = new Set(sessions.map((s: any) => s.id));
      const trackedSessionTotal = sessions.length;

      // Calculate unique visitors by IP
      const sessionsWithIp = sessions.filter((s: any) => s.ip_address && s.ip_address !== 'unknown');
      const uniqueIps = new Set(sessionsWithIp.map((s: any) => s.ip_address));
      const ipCoverage = trackedSessionTotal > 0 ? (sessionsWithIp.length / trackedSessionTotal) : 0;
      const trackedUniqueVisitors = ipCoverage >= 0.5 ? uniqueIps.size : trackedSessionTotal;
      const hasReliableIpData = ipCoverage >= 0.5;

      // Fetch ALL events for those sessions (paginated)
      const allEvents = await fetchAll<any>(
        "lead_events",
        "event_name, step_id, session_id, metadata, button_id, created_at",
        (q: any) => {
          if (fromClamped) q = q.gte("created_at", fromClamped);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );
      // Filter to only sessions in our range
      const filteredEvents = allEvents.filter((e: any) => sessionIds.has(e.session_id));

      // Ground truth for "completed" = sessões que efetivamente concluíram o quiz
      // (event submit OU session.completed=true), restritas às sessões NÃO filtradas (sem ruído interno).
      // Usar leads.count diretamente inflava o número porque inclui leads sem sessão (importações,
      // duplicatas, bio recovery), gerando taxas > 100%.
      const sessionsWithSubmitGround = new Set(
        allEvents
          .filter((e: any) => e.event_name === "submit" && sessionIds.has(e.session_id))
          .map((e: any) => e.session_id)
      );
      const completedSessionIds = new Set<string>(sessionsWithSubmitGround);
      sessions.forEach((s: any) => {
        if (s.completed && !completedSessionIds.has(s.id)) completedSessionIds.add(s.id);
      });
      const trackedCompleted = completedSessionIds.size;

      const leadRows = await fetchAll<any>(
        "leads",
        "id, created_at, ip_address",
        (q: any) => {
          if (fromClamped) q = q.gte("created_at", fromClamped);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );
      const totalLeads = leadRows.length;
      const uniqueLeadVisitors = new Set(
        leadRows.map((lead: any) =>
          lead.ip_address && lead.ip_address !== "unknown"
            ? `ip:${lead.ip_address}`
            : `lead:${lead.id}`
        )
      ).size;
      const completed = Math.max(trackedCompleted, totalLeads);
      console.log("[metrics] tracked", JSON.stringify({
        tracked_sessions: trackedSessionTotal,
        tracked_unique_visitors: trackedUniqueVisitors,
        tracked_completed: trackedCompleted,
        total_leads: totalLeads,
        unique_lead_visitors: uniqueLeadVisitors,
      }));

      // ===== Landing Views (fonte da verdade) =====
      // Conta hits únicos por session_id; se session_id null, dedup por (ip + user_agent) janela de 30min
      let hitsQuery = supabase
        .from("landing_hits")
        .select("session_id, ip_address, user_agent, created_at, referrer")
        .order("created_at", { ascending: true })
        .limit(15000);
      if (fromClamped) hitsQuery = hitsQuery.gte("created_at", fromClamped);
      if (toEnd) hitsQuery = hitsQuery.lte("created_at", toEnd);
      const { data: hitsData } = await hitsQuery;
      const cleanHits = (hitsData || []).filter((h: any) => {
        const ref = (h.referrer || "").toLowerCase();
        return !ref.includes("lovable.dev") && !ref.includes("lovableproject.com");
      });
      const hitSessionIds = new Set<string>();
      const ipUaBuckets = new Map<string, number>(); // key -> last timestamp ms
      let landingHitsTotal = 0;
      for (const h of cleanHits) {
        landingHitsTotal++;
        if (h.session_id) {
          hitSessionIds.add(h.session_id);
        } else if (h.ip_address) {
          const key = `${h.ip_address}|${(h.user_agent || "").slice(0, 80)}`;
          const ts = new Date(h.created_at).getTime();
          const last = ipUaBuckets.get(key);
          if (!last || ts - last > 30 * 60 * 1000) {
            ipUaBuckets.set(key, ts);
          }
        }
      }
      const landingViews = hitSessionIds.size + ipUaBuckets.size;

      // ===== Meta clicks (do ad_spend já agregado) =====
      let spendQuery = supabase.from("ad_spend").select("clicks, date");
      if (fromClamped) spendQuery = spendQuery.gte("date", fromClamped.slice(0, 10));
      if (toEnd) spendQuery = spendQuery.lte("date", toEnd.slice(0, 10));
      const { data: spendData } = await spendQuery;
      const metaClicks = (spendData || []).reduce((sum: number, r: any) => sum + (r.clicks || 0), 0);

      // Calculate event-based metrics
      const sessionsWithQuizView = new Set(
        filteredEvents.filter((e: any) => e.event_name === "quiz_view").map((e: any) => e.session_id)
      );
      const sessionsWithStepView = new Set(
        filteredEvents.filter((e: any) => e.event_name === "step_view").map((e: any) => e.session_id)
      );

      // Funil monotônico: completed <= startedQuiz <= enteredQuiz <= uniqueVisitors
      const uniqueVisitors = Math.max(trackedUniqueVisitors, uniqueLeadVisitors, completed);
      const total = Math.max(trackedSessionTotal, totalLeads, uniqueVisitors);
      const enteredQuizRaw = Math.max(sessionsWithQuizView.size, completed);
      const startedQuizRaw = Math.max(sessionsWithStepView.size, completed);
      const enteredQuiz = Math.min(enteredQuizRaw, uniqueVisitors);
      const startedQuiz = Math.min(startedQuizRaw, enteredQuiz);

      // Button distribution
      const buttonEventCounts: Record<string, Set<string>> = {
        start_btn_1: new Set(), start_btn_2: new Set(), start_btn_3: new Set(),
      };
      filteredEvents.forEach((event: any) => {
        if (event.event_name === "start_click" && event.button_id && buttonEventCounts[event.button_id]) {
          buttonEventCounts[event.button_id].add(event.session_id);
        }
      });
      const buttonDistribution = {
        start_btn_1: buttonEventCounts.start_btn_1.size,
        start_btn_2: buttonEventCounts.start_btn_2.size,
        start_btn_3: buttonEventCounts.start_btn_3.size,
      };

      const sessionsWithSubmit = new Set(
        filteredEvents.filter((e: any) => e.event_name === "submit").map((e: any) => e.session_id)
      );
      const isLoadingStep = (stepId: string) => stepId.toLowerCase().includes("loading");

      // ====== QUIZ v2 ONLY ======
      // Critério de detecção: step_id ∈ V2_STEP_IDS abaixo. Qualquer outro step
      // (q1_nome, q2_whats, q3_insta, q4_mercado, q5_estagio, q6_investimento, q7_dor)
      // é considerado v1 e IGNORADO no funil. Se o período não tiver dados v2,
      // step_funnel volta vazio e o front mostra "Sem dados do quiz novo...".
      const V2_STEP_IDS = [
        "q1_quer_vender",
        "q2_mercado",
        "q3_faturamento",
        "q4_nome",
        "q5_whats",
        "q6_insta",
        "q7_email",
        "q8_dor",
      ];
      const V2_STEP_SET = new Set(V2_STEP_IDS);
      const V2_LABELS: Record<string, string> = {
        q1_quer_vender: "Quer vender mais?",
        q2_mercado: "Mercado",
        q3_faturamento: "Faturamento mensal",
        q4_nome: "Nome completo",
        q5_whats: "WhatsApp",
        q6_insta: "Instagram",
        q7_email: "E-mail",
        q8_dor: "Dor / Desejo",
      };

      const stepCounts: Record<string, Set<string>> = {};
      const sessionViewedSteps: Record<string, Set<string>> = {};
      const sessionAdvancedFrom: Record<string, Set<string>> = {};
      let hasV1Data = false;

      filteredEvents.forEach((event: any) => {
        if (event.event_name === "step_view" && event.step_id) {
          if (!V2_STEP_SET.has(event.step_id)) {
            if (!isLoadingStep(event.step_id)) hasV1Data = true;
            return;
          }
          if (!stepCounts[event.step_id]) stepCounts[event.step_id] = new Set();
          stepCounts[event.step_id].add(event.session_id);
          if (!sessionViewedSteps[event.session_id]) sessionViewedSteps[event.session_id] = new Set();
          sessionViewedSteps[event.session_id].add(event.step_id);
        }
        if (event.event_name === "step_next" && event.metadata) {
          const metadata = event.metadata as Record<string, unknown>;
          const fromStep = metadata?.from_step as string | undefined;
          if (fromStep && V2_STEP_SET.has(fromStep)) {
            if (!sessionAdvancedFrom[event.session_id]) sessionAdvancedFrom[event.session_id] = new Set();
            sessionAdvancedFrom[event.session_id].add(fromStep);
          }
        }
      });

      const v2SessionIds = new Set<string>();
      Object.values(stepCounts).forEach((set) => set.forEach((id) => v2SessionIds.add(id)));
      const hasV2Data = v2SessionIds.size > 0;

      const stepFunnel: Array<{
        step_id: string;
        label: string;
        count: number;
        flow: string;
        flow_started: number;
        flow_completed: number;
      }> = [];

      let v2Completed = 0;
      let v2Entered = 0;

      if (hasV2Data) {
        v2Completed = Array.from(v2SessionIds).filter((sid) => sessionsWithSubmit.has(sid)).length;
        v2Entered = Math.max(stepCounts["q1_quer_vender"]?.size || 0, v2SessionIds.size);
        V2_STEP_IDS.forEach((stepId) => {
          stepFunnel.push({
            step_id: stepId,
            label: V2_LABELS[stepId],
            count: stepCounts[stepId]?.size || 0,
            flow: "v2",
            flow_started: v2Entered,
            flow_completed: v2Completed,
          });
        });
      }

      const dropOffs: Record<string, number> = {};
      Object.entries(sessionViewedSteps).forEach(([sessionId, viewedSteps]) => {
        if (sessionsWithSubmit.has(sessionId)) return;
        const advancedFrom = sessionAdvancedFrom[sessionId] || new Set();
        let dropOffStep: string | null = null;
        let dropOffIndex = -1;
        viewedSteps.forEach((step) => {
          const stepIndex = V2_STEP_IDS.indexOf(step);
          if (stepIndex >= 0 && !advancedFrom.has(step) && stepIndex > dropOffIndex) {
            dropOffStep = step;
            dropOffIndex = stepIndex;
          }
        });
        if (dropOffStep) dropOffs[dropOffStep] = (dropOffs[dropOffStep] || 0) + 1;
      });

      console.log("[FUNNEL v2] Sessions:", v2SessionIds.size, "Completed:", v2Completed, "HasV1:", hasV1Data);

      return new Response(
        JSON.stringify({
          total_visitors: total,
          unique_visitors: uniqueVisitors,
          has_reliable_ip_data: hasReliableIpData,
          ip_coverage_percent: Math.round(ipCoverage * 100),
          filtered_out: filteredOutCount,
          entered_quiz: enteredQuiz,
          started_quiz: startedQuiz,
          completed,
          landing_views: landingViews,
          landing_hits_total: landingHitsTotal,
          meta_clicks: metaClicks,
          loss_clicks_vs_views: Math.max(0, metaClicks - landingViews),
          conversion_rate: uniqueVisitors > 0 ? (completed / uniqueVisitors * 100).toFixed(1) : 0,
          completion_rate: enteredQuiz > 0 ? (completed / enteredQuiz * 100).toFixed(1) : 0,
          button_distribution: buttonDistribution,
          step_funnel: stepFunnel,
          drop_offs: dropOffs,
          quiz_v2_empty: !hasV2Data,
          quiz_v1_present: hasV1Data,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /dropoff/:stepId - Get sessions that dropped off at a specific step
    const dropoffMatch = path.match(/^\/dropoff\/([a-z0-9_]+)$/);
    if (dropoffMatch && req.method === "GET") {
      const stepId = dropoffMatch[1];
      const stepOrder = ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_investimento", "q7_dor"];

      // Get all events including metadata for field values
      const { data: allEvents, error: eventsError } = await supabase
        .from("lead_events")
        .select("event_name, step_id, session_id, metadata");
      if (eventsError) throw eventsError;

      // Find sessions with submit
      const sessionsWithSubmit = new Set(
        allEvents?.filter(e => e.event_name === "submit").map(e => e.session_id) || []
      );

      // Track which steps each session viewed and which they advanced from (step_next)
      const sessionViewedSteps: Record<string, Set<string>> = {};
      const sessionAdvancedFrom: Record<string, Set<string>> = {};
      const sessionFieldData: Record<string, Record<string, string>> = {};
      
      allEvents?.forEach(event => {
        if (event.event_name === "step_view" && event.step_id) {
          if (!sessionViewedSteps[event.session_id]) {
            sessionViewedSteps[event.session_id] = new Set();
          }
          sessionViewedSteps[event.session_id].add(event.step_id);
        }
        
        // Track which steps the user advanced FROM and collect field data
        if (event.event_name === "step_next" && event.metadata) {
          const metadata = event.metadata as Record<string, unknown>;
          const fromStep = metadata.from_step as string | undefined;
          if (fromStep) {
            if (!sessionAdvancedFrom[event.session_id]) {
              sessionAdvancedFrom[event.session_id] = new Set();
            }
            sessionAdvancedFrom[event.session_id].add(fromStep);
          }
          
          // Collect field values
          const fieldValue = metadata.field_value as Record<string, string> | undefined;
          if (fieldValue) {
            if (!sessionFieldData[event.session_id]) {
              sessionFieldData[event.session_id] = {};
            }
            Object.assign(sessionFieldData[event.session_id], fieldValue);
          }
        }
      });

      // Find sessions that dropped off at this specific step
      // Drop-off = viewed the step but didn't advance from it
      const droppedSessionIds: string[] = [];
      Object.entries(sessionViewedSteps).forEach(([sessionId, viewedSteps]) => {
        if (!sessionsWithSubmit.has(sessionId)) {
          const advancedFrom = sessionAdvancedFrom[sessionId] || new Set();
          
          // They dropped off at this step if they viewed it but didn't advance from it
          if (viewedSteps.has(stepId) && !advancedFrom.has(stepId)) {
            // Also check it's their furthest un-advanced step
            let isFurthestDropoff = true;
            viewedSteps.forEach(step => {
              const stepIndex = stepOrder.indexOf(step);
              const targetIndex = stepOrder.indexOf(stepId);
              // If there's a later step they viewed but didn't advance from, this isn't their drop-off
              if (stepIndex > targetIndex && !advancedFrom.has(step)) {
                isFurthestDropoff = false;
              }
            });
            
            if (isFurthestDropoff) {
              droppedSessionIds.push(sessionId);
            }
          }
        }
      });

      // Get session details with their data
      const { data: droppedSessions, error: sessionsError } = await supabase
        .from("lead_sessions")
        .select("*")
        .in("id", droppedSessionIds.length > 0 ? droppedSessionIds : ["00000000-0000-0000-0000-000000000000"]);
      if (sessionsError) throw sessionsError;

      // Enrich sessions with collected field data
      const enrichedSessions = (droppedSessions || []).map(session => {
        const fieldData = sessionFieldData[session.id] || {};
        return {
          ...session,
          // Use collected data if session data is null
          lead_name: session.lead_name || fieldData.nome || null,
          lead_whatsapp: session.lead_whatsapp || fieldData.whatsapp || null,
          lead_instagram: session.lead_instagram || fieldData.instagram || null,
          lead_market: session.lead_market || fieldData.mercado || null,
          lead_stage: session.lead_stage || fieldData.estagio || null,
          collected_data: fieldData, // Include all collected data
        };
      });

      return new Response(
        JSON.stringify(enrichedSessions),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DELETE /leads - Delete multiple leads
    if (path === "/leads" && req.method === "DELETE") {
      const body = await req.json();
      const ids = body.ids as string[];
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "IDs não fornecidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Deleting leads:", ids);

      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", ids);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, deleted: ids.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /campaigns - Get campaign analytics
    if (path === "/campaigns" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const source = url.searchParams.get("source");
      const campaign = url.searchParams.get("campaign");

      // Get sessions with campaign data
      let sessionsQuery = supabase.from("lead_sessions").select("*");
      if (from) sessionsQuery = sessionsQuery.gte("created_at", from);
      if (to) sessionsQuery = sessionsQuery.lte("created_at", to.includes("T") ? to : to + "T23:59:59Z");
      if (source && source !== "all") sessionsQuery = sessionsQuery.eq("utm_source", source);
      if (campaign && campaign !== "all") {
        sessionsQuery = sessionsQuery.or(`utm_campaign.eq.${campaign},campaign_id.eq.${campaign}`);
      }

      const { data: sessions, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;

      // Get meta ads cache for name resolution
      const { data: metaCache } = await supabase.from("meta_ads_cache").select("*");
      const cacheByAdId = new Map(metaCache?.map(c => [c.ad_id, c]) || []);
      const cacheByCampaignId = new Map(metaCache?.map(c => [c.campaign_id, c]) || []);

      // Calculate metrics
      const totalSessions = sessions?.length || 0;
      const startedQuiz = sessions?.filter(s => s.started_quiz).length || 0;
      const completed = sessions?.filter(s => s.completed).length || 0;
      const completionRate = startedQuiz > 0 ? (completed / startedQuiz) * 100 : 0;

      // Group by campaign
      const campaignMap = new Map<string, { 
        campaign_id: string | null;
        utm_campaign: string | null;
        campaign_name: string | null;
        display_name: string; // The name to show in the UI
        total: number; 
        started: number; 
        completed: number;
      }>();

      sessions?.forEach(s => {
        const key = s.campaign_id || s.utm_campaign || "direct";
        
        // Get the best display name: utm_campaign > campaign_name from cache > campaign_id
        const displayName = s.utm_campaign || cacheByCampaignId.get(s.campaign_id)?.campaign_name || s.campaign_id || "Tráfego Direto";
        
        const existing = campaignMap.get(key) || {
          campaign_id: s.campaign_id,
          utm_campaign: s.utm_campaign,
          campaign_name: cacheByCampaignId.get(s.campaign_id)?.campaign_name || null,
          display_name: displayName,
          total: 0,
          started: 0,
          completed: 0,
        };
        existing.total++;
        if (s.started_quiz) existing.started++;
        if (s.completed) existing.completed++;
        campaignMap.set(key, existing);
      });

      const campaigns = Array.from(campaignMap.values())
        .map(c => ({ ...c, completion_rate: c.started > 0 ? (c.completed / c.started) * 100 : 0 }))
        .sort((a, b) => b.completed - a.completed);

      // Group by ad
      const adMap = new Map<string, {
        ad_id: string | null;
        utm_content: string | null;
        ad_name: string | null;
        display_name: string; // The name to show in the UI
        campaign_name: string | null;
        campaign_display_name: string; // The campaign name to show in the UI
        total: number;
        started: number;
        completed: number;
      }>();

      sessions?.forEach(s => {
        // Prioritize utm_content for display since it contains the actual names from Meta Ads URL params
        const key = s.ad_id || s.utm_content || "no_ad";
        const cached = cacheByAdId.get(s.ad_id);
        
        // Get the best display name: utm_content > ad_name from cache > ad_id
        const displayName = s.utm_content || cached?.ad_name || s.ad_id || "Não identificado";
        
        // Get the best campaign display name: utm_campaign > campaign_name from cache > campaign_id
        const campaignDisplayName = s.utm_campaign || cached?.campaign_name || cacheByCampaignId.get(s.campaign_id)?.campaign_name || s.campaign_id || "-";
        
        const existing = adMap.get(key) || {
          ad_id: s.ad_id,
          utm_content: s.utm_content,
          ad_name: cached?.ad_name || null,
          display_name: displayName,
          campaign_name: cached?.campaign_name || cacheByCampaignId.get(s.campaign_id)?.campaign_name || null,
          campaign_display_name: campaignDisplayName,
          total: 0,
          started: 0,
          completed: 0,
        };
        existing.total++;
        if (s.started_quiz) existing.started++;
        if (s.completed) existing.completed++;
        adMap.set(key, existing);
      });

      const ads = Array.from(adMap.values())
        .map(a => ({ ...a, completion_rate: a.started > 0 ? (a.completed / a.started) * 100 : 0 }))
        .sort((a, b) => b.completed - a.completed);

      // Group by source
      const sourceMap = new Map<string, { utm_source: string; total: number; completed: number }>();
      sessions?.forEach(s => {
        const key = s.utm_source || "direct";
        const existing = sourceMap.get(key) || { utm_source: key, total: 0, completed: 0 };
        existing.total++;
        if (s.completed) existing.completed++;
        sourceMap.set(key, existing);
      });

      const sources = Array.from(sourceMap.values()).sort((a, b) => b.total - a.total);

      // Drop-off by step per campaign
      const stepDropoffs: Array<{ step_id: string; campaign_id: string | null; utm_campaign: string | null; count: number }> = [];
      const stepOrder = ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_dor"];
      
      // Group non-completed sessions by their current_step_id and campaign
      const dropoffMap = new Map<string, number>();
      sessions?.filter(s => !s.completed && s.current_step_id).forEach(s => {
        const key = `${s.current_step_id}|${s.campaign_id || s.utm_campaign || "direct"}`;
        dropoffMap.set(key, (dropoffMap.get(key) || 0) + 1);
      });

      dropoffMap.forEach((count, key) => {
        const [stepId, campaignKey] = key.split("|");
        stepDropoffs.push({
          step_id: stepId,
          campaign_id: campaignKey === "direct" ? null : campaignKey,
          utm_campaign: campaignKey === "direct" ? null : campaignKey,
          count,
        });
      });

      stepDropoffs.sort((a, b) => {
        const aIdx = stepOrder.indexOf(a.step_id);
        const bIdx = stepOrder.indexOf(b.step_id);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return b.count - a.count;
      });

      return new Response(
        JSON.stringify({
          total_sessions: totalSessions,
          started_quiz: startedQuiz,
          completed,
          completion_rate: completionRate,
          campaigns,
          ads,
          sources,
          stepDropoffs,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /campaigns/sessions - Get sessions with campaign data
    if (path === "/campaigns/sessions" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const source = url.searchParams.get("source");
      const campaign = url.searchParams.get("campaign");
      const search = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "100");

      let query = supabase
        .from("lead_sessions")
        .select("id, created_at, campaign_id, utm_campaign, ad_id, utm_content, utm_source, utm_medium, start_button_id, current_step_id, completed, lead_name")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to.includes("T") ? to : to + "T23:59:59Z");
      if (source && source !== "all") query = query.eq("utm_source", source);
      if (campaign && campaign !== "all") {
        query = query.or(`utm_campaign.eq.${campaign},campaign_id.eq.${campaign}`);
      }
      if (search) {
        query = query.or(`lead_name.ilike.%${search}%,utm_campaign.ilike.%${search}%,utm_content.ilike.%${search}%`);
      }

      const { data: sessions, error } = await query;
      if (error) throw error;

      // Enrich with cache names
      const { data: metaCache } = await supabase.from("meta_ads_cache").select("*");
      const cacheByAdId = new Map(metaCache?.map(c => [c.ad_id, c]) || []);
      const cacheByCampaignId = new Map(metaCache?.map(c => [c.campaign_id, c]) || []);

      const enrichedSessions = sessions?.map(s => ({
        ...s,
        campaign_name: cacheByCampaignId.get(s.campaign_id)?.campaign_name || null,
        ad_name: cacheByAdId.get(s.ad_id)?.ad_name || null,
      }));

      return new Response(
        JSON.stringify({ data: enrichedSessions }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /kommo-logs - List kommo webhook logs
    if (path === "/kommo-logs" && req.method === "GET") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

      const { data, error } = await supabase
        .from("kommo_webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /kommo-test - Send test lead to Kommo
    if (path === "/kommo-test" && req.method === "POST") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const webhookSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || '';

      const testPayload = {
        _source: 'admin_test',
        lead_db_id: null,
        nome_completo: 'Teste Admin ' + new Date().toLocaleTimeString('pt-BR'),
        whatsapp: '(11) 99999-8888',
        instagram: '@teste_admin',
        mercado: 'Infoproduto',
        estagio_negocio: 'Escala (buscando otimização)',
        investimento_faixa: 'R$ 8k – 20k',
        dor_desejo: 'Teste automático do painel admin para validar integração Kommo.',
        score: 9,
        tier: 'Large',
      };

      const response = await fetch(`${supabaseUrl}/functions/v1/kommo-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(testPayload),
      });

      const responseText = await response.text();
      let responseJson;
      try { responseJson = JSON.parse(responseText); } catch { responseJson = { raw: responseText }; }

      return new Response(
        JSON.stringify({
          test_status: response.ok ? 'SUCCESS' : 'FAILED',
          http_status: response.status,
          response: responseJson,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /kommo-retry/:leadId - Retry Kommo sync for a specific lead
    const retryMatch = path.match(/^\/kommo-retry\/([a-f0-9-]+)$/);
    if (retryMatch && req.method === "POST") {
      const leadId = retryMatch[1];

      // Get lead data
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (leadErr || !lead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const webhookSecretVal = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || '';

      const retryPayload = {
        _source: 'admin_retry',
        lead_db_id: lead.id,
        nome_completo: lead.nome_completo,
        whatsapp: lead.whatsapp,
        instagram: lead.instagram,
        mercado: lead.mercado,
        estagio_negocio: lead.estagio_negocio,
        investimento_faixa: lead.investimento_faixa,
        dor_desejo: lead.dor_desejo,
        score: lead.score,
        tier: lead.tier,
        utm_source: lead.utm_source,
        utm_campaign: lead.utm_campaign,
        utm_content: lead.utm_content,
      };

      // Update retry count
      await supabase.from("leads")
        .update({ kommo_retry_count: (lead.kommo_retry_count || 0) + 1, kommo_status: 'retrying' })
        .eq("id", leadId);

      const response = await fetch(`${supabaseUrl}/functions/v1/kommo-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecretVal,
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(retryPayload),
      });

      const responseText = await response.text();
      let responseJson;
      try { responseJson = JSON.parse(responseText); } catch { responseJson = { raw: responseText }; }

      return new Response(
        JSON.stringify({
          retry_status: response.ok ? 'SUCCESS' : 'FAILED',
          http_status: response.status,
          response: responseJson,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── GET /creatives ────
    if (path === "/creatives" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const fromDate = url.searchParams.get("from_date") || (from && !from.includes("T") ? from : null);
      const toDate = url.searchParams.get("to_date") || (to && !to.includes("T") ? to : null);
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;
      const campaignType = url.searchParams.get("campaign_type"); // "mql" | "lead" | null (all)
      // Filter by specific campaign names (comma-separated). When set, ALL aggregations
      // (leads, spend, sales, meetings) are restricted to rows matching those campaigns.
      const campaignsParam = url.searchParams.get("campaigns");
      const campaignFilter: Set<string> | null = campaignsParam
        ? new Set(campaignsParam.split("|||").map(c => c.trim()).filter(Boolean))
        : null;
      const matchesCampaignFilter = (name: string | null | undefined): boolean => {
        if (!campaignFilter) return true;
        if (!name) return false;
        return campaignFilter.has(name);
      };

      // Helper to check if a campaign name is an MQL campaign
      function isMqlCampaign(campaignName: string | null): boolean {
        if (!campaignName) return false;
        const lower = campaignName.toLowerCase();
        return lower.includes('obj: "mql"') || lower.includes('obj: \u201cmql\u201d') || lower.includes('"mql"') || lower.includes('mql');
      }

      // Helper to normalize creative key
      function normalizeKey(raw: string): string {
        return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      }

      // MQL logic — MQL = faturamento >= 10k (Rodger removido, agora tudo é Caio)
      const MQL_FAIXAS = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
        "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
        "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
        "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
        "Acima de R$ 10 milhões",
        // Legacy quiz format faixas
        "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
      ];
      function isMql(_estagio: string, investimento: string | null, sdrOverride?: string | null): boolean {
        if (sdrOverride === "Dara" || sdrOverride === "Miguel") return false;
        return investimento ? MQL_FAIXAS.includes(investimento) : false;
      }

      // Fetch ALL leads in period
      const PAGE_SIZE = 1000;
      let allLeads: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase.from("leads").select("id, created_at, utm_content, utm_campaign, utm_source, estagio_negocio, investimento_faixa, sdr_override, tier, ip_address, mercado, operacoes_ativas, nps_score, dor_desejo, raw_answers_json").range(offset, offset + PAGE_SIZE - 1);
        if (from) q = q.gte("created_at", from);
        if (toEnd) q = q.lte("created_at", toEnd);
        const { data, error } = await q;
        if (error) throw error;
        if (data) allLeads = allLeads.concat(data);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      // Fetch ad_spend in period (date-only column) — paginated to avoid 1000-row limit
      let spendData: any[] = [];
      let spendOffset = 0;
      let spendHasMore = true;
      while (spendHasMore) {
        let sq = supabase.from("ad_spend").select("*").range(spendOffset, spendOffset + PAGE_SIZE - 1);
        if (fromDate) sq = sq.gte("date", fromDate);
        if (toDate) sq = sq.lte("date", toDate);
        const { data: sd, error: se } = await sq;
        if (se) throw se;
        if (sd) spendData = spendData.concat(sd);
        spendHasMore = (sd?.length || 0) === PAGE_SIZE;
        spendOffset += PAGE_SIZE;
      }

      // Fetch manual_sales in period (date-only column)
      let salesQuery = supabase.from("manual_sales").select("*");
      if (fromDate) salesQuery = salesQuery.gte("sale_date", fromDate);
      if (toDate) salesQuery = salesQuery.lte("sale_date", toDate);
      const { data: salesData } = await salesQuery;

      // Fetch meetings in period
      let meetingsQuery = supabase.from("meetings").select("*");
      if (from) meetingsQuery = meetingsQuery.gte("created_at", from);
      if (toEnd) meetingsQuery = meetingsQuery.lte("created_at", toEnd);
      const { data: meetingsData } = await meetingsQuery;

      // Determine active status: check if creative has ad_spend in the last 3 days
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const recentSpendKeys = new Set<string>();
      for (const s of (spendData || [])) {
        if (s.date >= threeDaysAgo) {
          const rawKey = s.utm_content || s.ad_name;
          if (rawKey) {
            const ck = s.creative_key || normalizeKey(rawKey);
            if (ck) recentSpendKeys.add(ck);
          }
        }
      }

      // Build creative map from leads
      interface CreativeAgg {
        creative_key: string;
        creative_label: string;
        creative_source_field: string;
        leads_count: number;
        mql_count: number;
        tier_small_count: number;
        tier_medium_count: number;
        tier_large_count: number;
        tier_enterprise_count: number;
        tier_enterprise_plus_count: number;
        leads_5_10k_count: number;
        lead_score_sum: number;
        lead_score_n: number;
        spend: number;
        clicks: number;
        impressions: number;
        sales_count: number;
        sales_sprint_count: number;
        sales_assessoria_count: number;
        revenue: number;
        revenue_sprint: number;
        revenue_assessoria: number;
        revenue_assessoria_received: number;
        revenue_assessoria_to_receive: number;
        meetings_count: number;
        meetings_attended_count: number;
        landing_page_views: number;
        last_activity: string | null;
        leads_by_stage: Record<string, number>;
        campaigns: Set<string>;
      }

      const creativeMap = new Map<string, CreativeAgg>();

      function getOrCreate(key: string, label: string, source: string): CreativeAgg {
        if (!creativeMap.has(key)) {
          creativeMap.set(key, {
            creative_key: key,
            creative_label: label,
            creative_source_field: source,
            leads_count: 0,
            mql_count: 0,
            tier_small_count: 0,
            tier_medium_count: 0,
            tier_large_count: 0,
            tier_enterprise_count: 0,
            tier_enterprise_plus_count: 0,
            leads_5_10k_count: 0,
            lead_score_sum: 0,
            lead_score_n: 0,
            spend: 0,
            clicks: 0,
            impressions: 0,
            sales_count: 0,
            sales_sprint_count: 0,
            sales_assessoria_count: 0,
            revenue: 0,
            revenue_sprint: 0,
            revenue_assessoria: 0,
            revenue_assessoria_received: 0,
            revenue_assessoria_to_receive: 0,
            meetings_count: 0,
            meetings_attended_count: 0,
            landing_page_views: 0,
            last_activity: null,
            leads_by_stage: {},
            campaigns: new Set(),
          });
        }
        return creativeMap.get(key)!;
      }

      // Tier mapping
      const FATURAMENTO_TIER: Record<string, string> = {
        "Não vendo ainda (R$0/mês)": "Desqualificado",
        "Até R$ 5 mil": "Small",
        "De R$ 5 mil a R$ 10 mil": "Medium", "De R$ 10 mil a R$ 20 mil": "Medium",
        "De R$ 20 mil a R$ 30 mil": "Medium",
        "De R$ 30 mil a R$ 50 mil": "Large", "De R$ 50 mil a R$ 75 mil": "Large",
        "De R$ 75 mil a R$ 100 mil": "Large",
        "De R$ 100 mil a R$ 150 mil": "Enterprise", "De R$ 150 mil a R$ 200 mil": "Enterprise",
        "De R$ 200 mil a R$ 300 mil": "Enterprise", "De R$ 300 mil a R$ 500 mil": "Enterprise",
        "De R$ 500 mil a R$ 750 mil": "Enterprise+", "De R$ 750 mil a R$ 1 milhão": "Enterprise+",
        "De R$ 1 milhão a R$ 2 milhões": "Enterprise+", "De R$ 2 milhões a R$ 3 milhões": "Enterprise+",
        "De R$ 3 milhões a R$ 5 milhões": "Enterprise+", "De R$ 5 milhões a R$ 10 milhões": "Enterprise+",
        "Acima de R$ 10 milhões": "Enterprise+",
        "R$ 0 – 2k": "Small",
        "R$ 2k – 8k": "Medium",
        "R$ 8k – 20k": "Large",
        "R$ 20k – 50k": "Enterprise",
        "R$ 50k – 100k": "Enterprise",
      };

      function getLeadTier(lead: any): string {
        return FATURAMENTO_TIER[lead.investimento_faixa || ""] || (lead.tier || "Desqualificado");
      }

      // ─── Lead Score 0–100 (mirrors src/lib/leadScoring.ts) ──────────────────
      const SCORE_FAT: Record<string, number> = {
        "Não vendo ainda (R$0/mês)": 0,
        "Até R$ 5 mil": 5,
        "De R$ 5 mil a R$ 10 mil": 15,
        "De R$ 10 mil a R$ 20 mil": 22,
        "De R$ 20 mil a R$ 30 mil": 27,
        "De R$ 30 mil a R$ 50 mil": 30,
        "De R$ 50 mil a R$ 75 mil": 32,
        "De R$ 75 mil a R$ 100 mil": 33,
        "De R$ 100 mil a R$ 150 mil": 35,
        "De R$ 150 mil a R$ 200 mil": 35,
        "De R$ 200 mil a R$ 300 mil": 35,
        "De R$ 300 mil a R$ 500 mil": 35,
        "De R$ 500 mil a R$ 750 mil": 35,
        "De R$ 750 mil a R$ 1 milhão": 35,
        "De R$ 1 milhão a R$ 2 milhões": 35,
        "De R$ 2 milhões a R$ 3 milhões": 35,
        "De R$ 3 milhões a R$ 5 milhões": 35,
        "De R$ 5 milhões a R$ 10 milhões": 35,
        "Acima de R$ 10 milhões": 35,
      };
      const SCORE_ESTAGIO: Record<string, number> = {
        "Iniciando do zero": 2,
        "Validação (primeiras vendas)": 6,
        "Pré-escala (vendas constantes)": 10,
        "Escala (buscando otimização)": 12,
      };
      const SCORE_MERCADO_ALTO = new Set([
        "Infoproduto", "E-commerce", "SaaS / Software",
        "Serviços / Consultoria", "Agência", "Nutra / Encapsulado Produtor",
      ]);
      const SCORE_MERCADO_MEDIO = new Set([
        "Dropshipping", "Afiliado BR", "Afiliado Nutra Gringa", "Lowticket",
      ]);
      const asBool = (v: any): boolean => v === true || (typeof v === "string" && v.trim().toLowerCase() === "sim");
      function computeScore(lead: any): number {
        const raw = (lead.raw_answers_json && typeof lead.raw_answers_json === "object") ? lead.raw_answers_json : {};
        const pick = (top: any, key: string) => (top !== null && top !== undefined && top !== "") ? top : raw[key];
        const fat = pick(lead.investimento_faixa, "investimento_faixa") as string | undefined;
        const est = pick(lead.estagio_negocio, "estagio_negocio") as string | undefined;
        const mer = pick(lead.mercado, "mercado") as string | undefined;
        const ops = pick(lead.operacoes_ativas, "operacoes_ativas");
        const quer = pick(undefined, "quer_vender_mais");
        const comp = pick(undefined, "compromisso_whatsapp");
        const aceita = pick(undefined, "aceita_call_diagnostico");
        const dor = (pick(lead.dor_desejo, "dor_desejo") as string | undefined) || "";
        const nps = pick(lead.nps_score, "nps_score");
        const lgpd = pick(undefined, "lgpd");
        let pMercado = 0;
        if (mer) {
          if (SCORE_MERCADO_ALTO.has(mer)) pMercado = 8;
          else if (SCORE_MERCADO_MEDIO.has(mer)) pMercado = 5;
          else pMercado = 3;
        }
        let pOps = 0;
        if (typeof ops === "number") {
          pOps = ops <= 0 ? 1 : ops === 1 ? 4 : ops === 2 ? 5 : 6;
        }
        const len = dor.trim().length;
        const pDor = len < 10 ? 0 : len < 30 ? 2 : len < 80 ? 4 : 5;
        const pNps = typeof nps === "number" ? Math.round(Math.max(0, Math.min(10, nps)) * 0.4 * 10) / 10 : 0;
        const total =
          (SCORE_FAT[fat || ""] ?? 0) +
          (SCORE_ESTAGIO[est || ""] ?? 0) +
          pMercado + pOps + pDor + pNps +
          (asBool(quer) ? 5 : 0) +
          (asBool(comp) ? 10 : 0) +
          (asBool(aceita) ? 12 : 0) +
          (asBool(lgpd) ? 3 : 0);
        return Math.max(0, Math.min(100, Math.round(total)));
      }

      let leadsWithCreative = 0;
      let leadsWithoutUtms = 0;
      const UNATTRIBUTED_KEY = "direct-link-in-bio";
      const UNATTRIBUTED_LABEL = "Direct / Link in Bio";
      // Keys that should be merged into the unattributed/direct bucket
      const DIRECT_KEYS = new Set(["__sem_criativo__", "ad-name", "link-in-bio", "link_in_bio", "ad.name"]);

      // Build a map of IP -> utm_content from lead_sessions for recovering null utm_content
      const leadsWithNullUtm = allLeads.filter(l => !l.utm_content && l.id);
      const leadIpMap = new Map<string, string>(); // lead_id -> utm_content from session

      if (leadsWithNullUtm.length > 0) {
        // Fetch sessions that completed and have utm_content, match by lead name/whatsapp
        // We'll use a simpler approach: fetch lead_sessions with utm_content in the period
        let sessOffset = 0;
        let allSessions: any[] = [];
        let sessHasMore = true;
        while (sessHasMore) {
          let sq = supabase.from("lead_sessions")
            .select("ip_address, utm_content, lead_whatsapp, completed, created_at")
            .eq("completed", true)
            .not("utm_content", "is", null)
            .range(sessOffset, sessOffset + PAGE_SIZE - 1);
          if (from) sq = sq.gte("created_at", from);
          if (toEnd) sq = sq.lte("created_at", toEnd);
          const { data: sd } = await sq;
          if (sd) allSessions = allSessions.concat(sd);
          sessHasMore = (sd?.length || 0) === PAGE_SIZE;
          sessOffset += PAGE_SIZE;
        }

        // Build IP -> utm_content map from sessions (most recent wins)
        const ipToUtmContent = new Map<string, string>();
        for (const sess of allSessions) {
          if (sess.ip_address && sess.utm_content && sess.utm_content !== '{{ad.name}}') {
            ipToUtmContent.set(sess.ip_address, sess.utm_content);
          }
        }

        // Try to recover utm_content for leads with null via their IP
        for (const lead of allLeads) {
          if (!lead.utm_content && lead.ip_address) {
            const recovered = ipToUtmContent.get(lead.ip_address);
            if (recovered) {
              lead.utm_content = recovered;
              lead._recovered = true;
            }
          }
        }
      }

      // Process leads (filter by campaign_type if specified)
      for (const lead of allLeads) {
        // Campaign type filter
        if (campaignType === "mql" && !isMqlCampaign(lead.utm_campaign)) continue;
        if (campaignType === "lead" && isMqlCampaign(lead.utm_campaign)) continue;
        // Specific campaign-name filter
        if (campaignFilter && !matchesCampaignFilter(lead.utm_campaign)) continue;

        const rawKey = lead.utm_content;
        let ck: string;
        let label: string;
        const normalized = rawKey ? normalizeKey(rawKey) : "";
        if (!rawKey || !normalized || DIRECT_KEYS.has(normalized) || rawKey === "{{ad.name}}") {
          leadsWithoutUtms++;
          ck = UNATTRIBUTED_KEY;
          label = UNATTRIBUTED_LABEL;
        } else {
          ck = normalized;
          label = rawKey;
          leadsWithCreative++;
        }
        const agg = getOrCreate(ck, label, "utm_content");
        agg.leads_count++;
        if (isMql(lead.estagio_negocio, lead.investimento_faixa, lead.sdr_override)) {
          agg.mql_count++;
        }
        const computedTier = getLeadTier(lead);
        if (computedTier === "Small") agg.tier_small_count++;
        else if (computedTier === "Medium") agg.tier_medium_count++;
        else if (computedTier === "Large") agg.tier_large_count++;
        else if (computedTier === "Enterprise") agg.tier_enterprise_count++;
        else if (computedTier === "Enterprise+") agg.tier_enterprise_plus_count++;
        if ((lead.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil") {
          agg.leads_5_10k_count++;
        }
        const _score = computeScore(lead);
        agg.lead_score_sum += _score;
        agg.lead_score_n += 1;
        agg.leads_by_stage[lead.estagio_negocio] = (agg.leads_by_stage[lead.estagio_negocio] || 0) + 1;
        if (lead.utm_campaign) agg.campaigns.add(lead.utm_campaign);
        if (!agg.last_activity || lead.created_at > agg.last_activity) {
          agg.last_activity = lead.created_at;
        }
      }

      // Process spend
      let spendMapped = 0;
      let spendTotal = 0;
      for (const s of (spendData || [])) {
        // Campaign type filter for spend
        if (campaignType === "mql" && !isMqlCampaign(s.campaign_name)) continue;
        if (campaignType === "lead" && isMqlCampaign(s.campaign_name)) continue;
        // Specific campaign-name filter
        if (campaignFilter && !matchesCampaignFilter(s.campaign_name)) continue;
        const amount = Number(s.spend) || 0;
        spendTotal += amount;
        const rawKey = s.utm_content || s.ad_name;
        if (!rawKey) continue;
        const ck = s.creative_key || normalizeKey(rawKey);
        if (!ck) continue;
        spendMapped += amount;
        const agg = getOrCreate(ck, rawKey, s.utm_content ? "utm_content" : "fallback");
        agg.spend += amount;
        agg.clicks += Number(s.clicks) || 0;
        agg.impressions += Number(s.impressions) || 0;
        agg.landing_page_views += Number(s.landing_page_views) || 0;
        if (s.campaign_name) agg.campaigns.add(s.campaign_name);
        const spendDate = s.date;
        if (!agg.last_activity || spendDate > agg.last_activity) {
          agg.last_activity = spendDate;
        }
      }

      // Build a lead lookup map for resolving creative from lead_id
      const leadUtmMap = new Map<string, string>();
      for (const lead of allLeads) {
        if (lead.utm_content && lead.utm_content !== '{{ad.name}}') {
          leadUtmMap.set(lead.id, lead.utm_content);
        }
      }

      // When filtering by campaign names, only sales/meetings whose linked lead matches
      // the campaign filter should be aggregated. Build the allowed-lead set.
      const campaignFilteredLeadIds: Set<string> | null = campaignFilter
        ? new Set(
            allLeads
              .filter(l => matchesCampaignFilter(l.utm_campaign))
              .map(l => l.id)
          )
        : null;

      // Process sales - resolve creative from linked lead if needed
      let salesWithoutCreative = 0;
      for (const sale of (salesData || [])) {
        // When campaign filter is active, drop sales not linked to a matching lead
        if (campaignFilteredLeadIds && (!sale.lead_id || !campaignFilteredLeadIds.has(sale.lead_id))) continue;
        let rawKey = sale.creative_key || sale.utm_content;
        // If no creative but has lead_id, try to get it from the lead
        if ((!rawKey || rawKey === '{{ad.name}}' || DIRECT_KEYS.has(normalizeKey(rawKey) || "")) && sale.lead_id) {
          const leadCreative = leadUtmMap.get(sale.lead_id);
          if (leadCreative) rawKey = leadCreative;
        }
        let ck: string;
        let label: string;
        const normalized = rawKey ? normalizeKey(rawKey) : "";
        if (!rawKey || !normalized || DIRECT_KEYS.has(normalized) || rawKey === "{{ad.name}}") {
          salesWithoutCreative++;
          ck = UNATTRIBUTED_KEY;
          label = UNATTRIBUTED_LABEL;
        } else {
          ck = normalized;
          label = rawKey;
        }
        const agg = getOrCreate(ck, label, "utm_content");
        agg.sales_count++;
        const saleRevenue = Number(sale.revenue) || 0;
        agg.revenue += saleRevenue;
        const saleType = sale.sale_type || "sprint";
        if (saleType === "assessoria") {
          agg.sales_assessoria_count++;
          agg.revenue_assessoria += saleRevenue;
          const received = Number(sale.amount_received) || 0;
          agg.revenue_assessoria_received += received;
          agg.revenue_assessoria_to_receive += Math.max(0, saleRevenue - received);
        } else {
          agg.sales_sprint_count++;
          agg.revenue_sprint += saleRevenue;
        }
      }

      // Process meetings - resolve creative from linked lead if needed
      let totalMeetingsCount = 0;
      let totalMeetingsAttendedCount = 0;
      for (const meeting of (meetingsData || [])) {
        // When campaign filter is active, drop meetings not linked to a matching lead
        if (campaignFilteredLeadIds && (!meeting.lead_id || !campaignFilteredLeadIds.has(meeting.lead_id))) continue;
        let rawKey = meeting.creative_key || meeting.utm_content;
        if ((!rawKey || rawKey === '{{ad.name}}' || DIRECT_KEYS.has(normalizeKey(rawKey) || "")) && meeting.lead_id) {
          const leadCreative = leadUtmMap.get(meeting.lead_id);
          if (leadCreative) rawKey = leadCreative;
        }
        let ck: string;
        let label: string;
        const normalized = rawKey ? normalizeKey(rawKey) : "";
        if (!rawKey || !normalized || DIRECT_KEYS.has(normalized) || rawKey === "{{ad.name}}") {
          ck = UNATTRIBUTED_KEY;
          label = UNATTRIBUTED_LABEL;
        } else {
          ck = normalized;
          label = rawKey;
        }
        const agg = getOrCreate(ck, label, "utm_content");
        agg.meetings_count++;
        totalMeetingsCount++;
        if (meeting.attended) {
          agg.meetings_attended_count++;
          totalMeetingsAttendedCount++;
        }
      }

      // Calculate derived metrics
      const creatives = Array.from(creativeMap.values()).map(c => {
        const mql_rate = c.leads_count > 0 ? c.mql_count / c.leads_count : 0;
        const cost_per_mql = c.mql_count > 0 ? c.spend / c.mql_count : null;
        const cost_per_tier_large = c.tier_large_count > 0 ? c.spend / c.tier_large_count : null;
        const cost_per_small = c.tier_small_count > 0 ? c.spend / c.tier_small_count : null;
        const cost_per_medium = c.tier_medium_count > 0 ? c.spend / c.tier_medium_count : null;
        const cost_per_enterprise = c.tier_enterprise_count > 0 ? c.spend / c.tier_enterprise_count : null;
        const cost_per_enterprise_plus = c.tier_enterprise_plus_count > 0 ? c.spend / c.tier_enterprise_plus_count : null;
        // Leads "qualificados" — apenas faixa exata "De R$ 5 mil a R$ 10 mil"
        const qualified_count = c.leads_5_10k_count;
        const cost_per_qualified = qualified_count > 0 ? c.spend / qualified_count : null;
        const cac = c.sales_count > 0 ? c.spend / c.sales_count : null;
        const cac_sprint = c.sales_sprint_count > 0 ? c.spend / c.sales_sprint_count : null;
        const cac_assessoria = c.sales_assessoria_count > 0 ? c.spend / c.sales_assessoria_count : null;
        const roas = c.spend > 0 ? c.revenue / c.spend : null;
        const cost_per_meeting = c.meetings_count > 0 ? c.spend / c.meetings_count : null;
        const lead_per_view = c.landing_page_views > 0 ? c.leads_count / c.landing_page_views : null;
        const ctl = c.clicks > 0 ? (c.leads_count / c.clicks) * 100 : null;
        const is_active = recentSpendKeys.has(c.creative_key);
        const avg_lead_score = c.lead_score_n > 0 ? Math.round((c.lead_score_sum / c.lead_score_n) * 10) / 10 : null;
        return {
          ...c,
          mql_rate,
          cost_per_mql,
          cost_per_tier_large,
          cost_per_small,
          cost_per_medium,
          cost_per_enterprise,
          cost_per_enterprise_plus,
          qualified_count,
          cost_per_qualified,
          cac,
          cac_sprint,
          cac_assessoria,
          roas,
          cost_per_meeting,
          lead_per_view,
          ctl,
          meetings_count: c.meetings_count,
          meetings_attended_count: c.meetings_attended_count,
          is_active,
          avg_lead_score,
          campaigns: Array.from(c.campaigns),
        };
      });

      // Totals
      const totalSpend = creatives.reduce((s, c) => s + c.spend, 0) + (spendTotal - spendMapped);
      const totalLeads = campaignFilter
        ? creatives.reduce((s, c) => s + c.leads_count, 0)
        : allLeads.length;
      const totalMql = creatives.reduce((s, c) => s + c.mql_count, 0);
      const totalTierSmall = creatives.reduce((s, c) => s + c.tier_small_count, 0);
      const totalTierMedium = creatives.reduce((s, c) => s + c.tier_medium_count, 0);
      const totalTierLarge = creatives.reduce((s, c) => s + c.tier_large_count, 0);
      const totalTierEnterprise = creatives.reduce((s, c) => s + c.tier_enterprise_count, 0);
      const totalTierEnterprisePlus = creatives.reduce((s, c) => s + c.tier_enterprise_plus_count, 0);
      const totalSales = creatives.reduce((s, c) => s + c.sales_count, 0);
      const totalSalesSprint = creatives.reduce((s, c) => s + c.sales_sprint_count, 0);
      const totalSalesAssessoria = creatives.reduce((s, c) => s + c.sales_assessoria_count, 0);
      const totalRevenue = creatives.reduce((s, c) => s + c.revenue, 0);
      const totalRevenueSprint = creatives.reduce((s, c) => s + c.revenue_sprint, 0);
      const totalRevenueAssessoria = creatives.reduce((s, c) => s + c.revenue_assessoria, 0);
      const totalRevenueAssessoriaReceived = creatives.reduce((s, c) => s + (c.revenue_assessoria_received || 0), 0);
      const totalRevenueAssessoriaToReceive = creatives.reduce((s, c) => s + (c.revenue_assessoria_to_receive || 0), 0);
      const totalLandingPageViews = creatives.reduce((s, c) => s + c.landing_page_views, 0);
      const totalQualified = creatives.reduce((s, c) => s + c.leads_5_10k_count, 0);
      const totalClicks = creatives.reduce((s, c) => s + (c.clicks || 0), 0);
      const totalImpressions = creatives.reduce((s, c) => s + (c.impressions || 0), 0);

      return new Response(
        JSON.stringify({
          creatives,
          totals: {
            spend: totalSpend,
            leads: totalLeads,
            mql: totalMql,
            clicks: totalClicks,
            impressions: totalImpressions,
            ctl: totalClicks > 0 ? (totalLeads / totalClicks) * 100 : null,
            landing_page_views: totalLandingPageViews,
            lead_per_view: totalLandingPageViews > 0 ? totalLeads / totalLandingPageViews : null,
            tier_small: totalTierSmall,
            tier_medium: totalTierMedium,
            tier_large: totalTierLarge,
            tier_enterprise: totalTierEnterprise,
            tier_enterprise_plus: totalTierEnterprisePlus,
            qualified: totalQualified,
            cp_qualified: totalQualified > 0 ? totalSpend / totalQualified : null,
            sales: totalSales,
            sales_sprint: totalSalesSprint,
            sales_assessoria: totalSalesAssessoria,
            revenue: totalRevenue,
            revenue_sprint: totalRevenueSprint,
            revenue_assessoria: totalRevenueAssessoria,
            revenue_assessoria_received: totalRevenueAssessoriaReceived,
            revenue_assessoria_to_receive: totalRevenueAssessoriaToReceive,
            meetings: totalMeetingsCount,
            meetings_attended: totalMeetingsAttendedCount,
            cpl: totalLeads > 0 ? totalSpend / totalLeads : null,
            cpmql: totalMql > 0 ? totalSpend / totalMql : null,
            cp_tier_small: totalTierSmall > 0 ? totalSpend / totalTierSmall : null,
            cp_tier_medium: totalTierMedium > 0 ? totalSpend / totalTierMedium : null,
            cp_tier_large: totalTierLarge > 0 ? totalSpend / totalTierLarge : null,
            cp_tier_enterprise: totalTierEnterprise > 0 ? totalSpend / totalTierEnterprise : null,
            cp_tier_enterprise_plus: totalTierEnterprisePlus > 0 ? totalSpend / totalTierEnterprisePlus : null,
            cac: totalSales > 0 ? totalSpend / totalSales : null,
            cac_sprint: totalSalesSprint > 0 ? totalSpend / totalSalesSprint : null,
            cac_assessoria: totalSalesAssessoria > 0 ? totalSpend / totalSalesAssessoria : null,
            roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
            cp_meeting: totalMeetingsCount > 0 ? totalSpend / totalMeetingsCount : null,
          },
          data_quality: {
            leads_with_creative: leadsWithCreative,
            leads_total: allLeads.length,
            spend_mapped: spendMapped,
            spend_total: spendTotal,
            sales_without_creative: salesWithoutCreative,
            leads_without_utms: leadsWithoutUtms,
            leads_recovered: allLeads.filter((l: any) => l._recovered).length,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── GET /manual-sales ────
    if (path === "/manual-sales" && req.method === "GET" && url.searchParams.get("_method") !== "POST") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      
      let query = supabase.from("manual_sales").select("*, leads:lead_id(created_at)").order("sale_date", { ascending: false });
      if (from) query = query.gte("sale_date", from);
      if (to) query = query.lte("sale_date", to);
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Flatten lead_created_at into the row
      const flat = (data || []).map((s: any) => ({
        ...s,
        lead_created_at: s.leads?.created_at ?? null,
        leads: undefined,
      }));
      return new Response(JSON.stringify(flat), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /sales-cycle ────
    // Returns avg sales cycle (days) over ALL historical sales with a linked lead
    if (path === "/sales-cycle" && req.method === "GET") {
      const { data, error } = await supabase
        .from("manual_sales")
        .select("sale_date, leads:lead_id(created_at)")
        .not("lead_id", "is", null);
      if (error) throw error;

      const days: number[] = [];
      for (const s of (data || []) as any[]) {
        const leadCreated = s.leads?.created_at;
        if (!leadCreated || !s.sale_date) continue;
        const leadDate = new Date(leadCreated);
        const saleDate = new Date(s.sale_date + "T12:00:00Z");
        if (isNaN(leadDate.getTime()) || isNaN(saleDate.getTime())) continue;
        const diffDays = Math.max(0, Math.round((saleDate.getTime() - leadDate.getTime()) / 86400000));
        days.push(diffDays);
      }
      const avg = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;
      const sorted = [...days].sort((a, b) => a - b);
      const median = sorted.length > 0
        ? (sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[(sorted.length - 1) / 2])
        : null;

      return new Response(JSON.stringify({
        avg_days: avg,
        median_days: median,
        count: days.length,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── DELETE /manual-sales/:id ────
    const deleteSaleMatch = path.match(/^\/manual-sales\/([a-f0-9-]+)$/);
    if (deleteSaleMatch && req.method === "DELETE") {
      const saleId = deleteSaleMatch[1];
      const { error } = await supabase.from("manual_sales").delete().eq("id", saleId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── PUT /manual-sales/:id ────
    const updateSaleMatch = path.match(/^\/manual-sales\/([a-f0-9-]+)$/);
    if (updateSaleMatch && req.method === "PUT") {
      const saleId = updateSaleMatch[1];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.revenue !== undefined) updates.revenue = parseFloat(body.revenue);
      if (body.sale_type !== undefined) updates.sale_type = body.sale_type;
      if (body.notes !== undefined) updates.notes = body.notes || null;
      if (body.closer !== undefined) updates.closer = body.closer || null;
      if (body.payment_type !== undefined) updates.payment_type = body.payment_type;
      if (body.installments_count !== undefined) updates.installments_count = body.installments_count === null || body.installments_count === "" ? null : parseInt(body.installments_count);
      if (body.installment_value !== undefined) updates.installment_value = body.installment_value === null || body.installment_value === "" ? null : parseFloat(body.installment_value);
      if (body.amount_received !== undefined) updates.amount_received = parseFloat(body.amount_received) || 0;
      const { data, error } = await supabase.from("manual_sales").update(updates).eq("id", saleId).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /manual-sales ────
    if (path === "/manual-sales" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const leadId = params.lead_id || null;
      const revenue = parseFloat(params.revenue);
      const paymentType = params.payment_type || "tcv_total";
      const installmentsCount = params.installments_count ? parseInt(params.installments_count) : null;
      const installmentValue = params.installment_value ? parseFloat(params.installment_value) : null;
      const amountReceived = params.amount_received !== undefined && params.amount_received !== ""
        ? parseFloat(params.amount_received)
        : (paymentType === "tcv_total" ? revenue : 0);
      const { data, error } = await supabase.from("manual_sales").insert([{
        sale_date: params.sale_date,
        revenue,
        lead_id: leadId,
        creative_key: params.creative_key || null,
        utm_content: params.utm_content || null,
        notes: params.notes || null,
        sale_type: params.sale_type || "sprint",
        closer: params.closer || null,
        payment_type: paymentType,
        installments_count: installmentsCount,
        installment_value: installmentValue,
        amount_received: isNaN(amountReceived) ? 0 : amountReceived,
      }]).select().maybeSingle();

      if (error) throw error;

      // Fire Purchase event to Meta CAPI if we have a linked lead
      if (leadId) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": internalSecret || "",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              lead_id: leadId,
              event_name: "Purchase",
              value: revenue,
              currency: "BRL",
            }),
          });
          console.log(`Purchase CAPI event fired for lead ${leadId}, revenue ${revenue}`);
        } catch (capiErr) {
          console.error("Failed to fire Purchase CAPI:", capiErr);
        }
      }

      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /ad-spend ────
    if (path === "/ad-spend" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const { data, error } = await supabase.from("ad_spend").insert([{
        date: params.date,
        spend: parseFloat(params.spend),
        impressions: parseInt(params.impressions) || 0,
        clicks: parseInt(params.clicks) || 0,
        utm_content: params.utm_content || null,
        creative_key: params.creative_key || null,
        campaign_name: params.campaign_name || null,
      }]).select().maybeSingle();

      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── GET /meetings ────
    if (path === "/meetings" && req.method === "GET" && url.searchParams.get("_method") !== "POST") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      
      let query = supabase.from("meetings").select("*").order("created_at", { ascending: false });
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to.includes("T") ? to : to + "T23:59:59.999Z");
      
      const { data, error } = await query;
      if (error) throw error;
      
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /meetings ────
    if (path === "/meetings" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const ck = params.creative_key || null;
      const leadId = params.lead_id || null;
      const { data, error } = await supabase.from("meetings").insert([{
        creative_key: ck,
        utm_content: params.utm_content || null,
        notes: params.notes || null,
        lead_id: leadId,
        closer: params.closer || null,
      }]).select().maybeSingle();

      if (error) throw error;

      // Fire CAPI Meeting event if lead_id is present
      if (leadId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        try {
          // Dedup: skip if Meeting event was already sent for this lead
          const { data: leadCheck } = await supabase.from("leads").select("capi_events_sent").eq("id", leadId).maybeSingle();
          const alreadySent = ((leadCheck?.capi_events_sent as Record<string, boolean>) || {})["Meeting"];
          if (alreadySent) {
            console.log(`[admin-data] CAPI Meeting skipped (dedup) for lead ${leadId}`);
            return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const resp = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": internalSecret || "",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ lead_id: leadId, event_name: "Meeting" }),
          });
          const capiResult = await resp.text();
          console.log(`[admin-data] CAPI Meeting event for lead ${leadId}: ${resp.status}`, capiResult);

          // Track in capi_events_sent
          if (resp.ok) {
            const { data: lead } = await supabase.from("leads").select("capi_events_sent").eq("id", leadId).maybeSingle();
            const sent = (lead?.capi_events_sent as Record<string, boolean>) || {};
            sent["Meeting"] = true;
            await supabase.from("leads").update({ capi_events_sent: sent }).eq("id", leadId);
          }
        } catch (e) {
          console.error("[admin-data] CAPI Meeting error:", e);
        }
      }

      return new Response(JSON.stringify(data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── DELETE /meetings/:id ────
    const deleteMeetingMatch = path.match(/^\/meetings\/([a-f0-9-]+)$/);
    if (deleteMeetingMatch && req.method === "DELETE") {
      const meetingId = deleteMeetingMatch[1];
      const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── PUT /meetings/:id ────
    const updateMeetingMatch = path.match(/^\/meetings\/([a-f0-9-]+)$/);
    if (updateMeetingMatch && req.method === "PUT") {
      const meetingId = updateMeetingMatch[1];
      const body = await req.json();
      const updates: Record<string, unknown> = {};
      if (body.notes !== undefined) updates.notes = body.notes || null;
      if (body.attended !== undefined) updates.attended = !!body.attended;
      if (body.closer !== undefined) updates.closer = body.closer || null;
      const { data, error } = await supabase.from("meetings").update(updates).eq("id", meetingId).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /capi-retroactive-meetings ────
    if (path === "/capi-retroactive-meetings" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const { data: allMeetings, error: meetErr } = await supabase
        .from("meetings")
        .select("id, lead_id, notes")
        .not("lead_id", "is", null);
      if (meetErr) throw meetErr;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0, failed = 0;
      const errors: string[] = [];

      for (const m of (allMeetings || [])) {
        try {
          // Dedup: skip if Meeting event was already sent for this lead
          const { data: leadCheck } = await supabase.from("leads").select("capi_events_sent").eq("id", m.lead_id).maybeSingle();
          const alreadySent = ((leadCheck?.capi_events_sent as Record<string, boolean>) || {})["Meeting"];
          if (alreadySent) {
            continue;
          }
          const resp = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": internalSecret || "",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ lead_id: m.lead_id, event_name: "Meeting" }),
          });
          if (resp.ok) {
            sent++;
            // Track dedup
            const { data: lead } = await supabase.from("leads").select("capi_events_sent").eq("id", m.lead_id).maybeSingle();
            const s = (lead?.capi_events_sent as Record<string, boolean>) || {};
            s["Meeting"] = true;
            await supabase.from("leads").update({ capi_events_sent: s }).eq("id", m.lead_id);
          } else {
            failed++;
            errors.push(`Meeting ${m.id}: ${resp.status}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Meeting ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: (allMeetings || []).length, sent, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── POST /capi-retroactive-tiers ────
    if (path === "/capi-retroactive-tiers" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const { data: allLeads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, tier, capi_events_sent");
      if (leadsErr) throw leadsErr;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0, skipped = 0, failed = 0;
      const errors: string[] = [];

      for (const lead of (allLeads || [])) {
        const tier = lead.tier || "Desqualificado";
        if (tier === "Desqualificado") { skipped++; continue; }
        const eventName = `Lead_${tier.replace("+", "Plus")}`;
        const capiSent = (lead.capi_events_sent as Record<string, boolean>) || {};
        if (capiSent[eventName]) { skipped++; continue; }

        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": internalSecret || "",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ lead_id: lead.id, event_name: eventName }),
          });
          if (resp.ok) {
            sent++;
            capiSent[eventName] = true;
            await supabase.from("leads").update({ capi_events_sent: capiSent }).eq("id", lead.id);
          } else {
            failed++;
            errors.push(`Lead ${lead.id} (${eventName}): ${resp.status}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: (allLeads || []).length, sent, skipped, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── POST /capi-retroactive-purchases ────
    if (path === "/capi-retroactive-purchases" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      // Fetch all manual_sales that have a lead_id
      const { data: sales, error: salesErr } = await supabase
        .from("manual_sales")
        .select("id, lead_id, revenue")
        .not("lead_id", "is", null);
      if (salesErr) throw salesErr;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const sale of (sales || [])) {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": internalSecret || "",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              lead_id: sale.lead_id,
              event_name: "Purchase",
              value: Number(sale.revenue),
              currency: "BRL",
            }),
          });
          if (resp.ok) {
            sent++;
          } else {
            failed++;
            const body = await resp.text();
            errors.push(`Sale ${sale.id}: ${resp.status} - ${body}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Sale ${sale.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: (sales || []).length, sent, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── POST /capi-retroactive-mqls ────
    if (path === "/capi-retroactive-mqls" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const MQL_FAIXAS_RETRO = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 100 mil", "Mais de R$ 100 mil",
        "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
      ];

      const { data: allLeads, error: leadsErr } = await supabase
        .from("leads")
        .select("id, sdr_override, investimento_faixa, capi_events_sent")
        .order("created_at", { ascending: false })
        .limit(100);
      if (leadsErr) throw leadsErr;

      const mqls = (allLeads || []).filter(l =>
        l.sdr_override === "Caio" || l.sdr_override === "Rodger" || MQL_FAIXAS_RETRO.includes(l.investimento_faixa || "")
      );

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let sent = 0, skipped = 0, failed = 0;
      const errors: string[] = [];

      for (const lead of mqls) {
        const capiSent = (lead.capi_events_sent as Record<string, boolean>) || {};
        if (capiSent["MQL"]) { skipped++; continue; }

        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": internalSecret || "",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ lead_id: lead.id, event_name: "MQL" }),
          });
          if (resp.ok) {
            sent++;
            capiSent["MQL"] = true;
            await supabase.from("leads").update({ capi_events_sent: capiSent }).eq("id", lead.id);
          } else {
            failed++;
            const body = await resp.text();
            errors.push(`Lead ${lead.id}: ${resp.status} - ${body}`);
          }
        } catch (e) {
          failed++;
          errors.push(`Lead ${lead.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return new Response(
        JSON.stringify({ total: mqls.length, sent, skipped, failed, errors: errors.slice(0, 10) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Daily Reports CRUD ───
    const pathParts = path.replace(/^\//, "").split("/");
    if (req.method === "GET" && path === "/daily-reports") {
      const sdr = url.searchParams.get("sdr");
      const month = url.searchParams.get("month"); // YYYY-MM
      let query = supabase.from("daily_reports").select("*");
      if (sdr) query = query.eq("sdr_name", sdr);
      if (month) {
        const [y, m] = month.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of current month
        query = query.gte("report_date", `${month}-01`).lte("report_date", `${month}-${String(lastDay).padStart(2, "0")}`);
      }
      const { data, error: qErr } = await query.order("report_date", { ascending: false });
      if (qErr) return new Response(JSON.stringify({ error: qErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && path === "/daily-reports") {
      const body = await req.json();
      const { data, error: iErr } = await supabase.from("daily_reports").upsert(body, { onConflict: "report_date,sdr_name" }).select().single();
      if (iErr) return new Response(JSON.stringify({ error: iErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "PUT" && path.startsWith("/daily-reports/")) {
      const reportId = path.split("/").filter(Boolean)[1];
      const body = await req.json();
      const { data, error: uErr } = await supabase.from("daily_reports").update({ ...body, updated_at: new Date().toISOString() }).eq("id", reportId).select().single();
      if (uErr) return new Response(JSON.stringify({ error: uErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "DELETE" && path.startsWith("/daily-reports/")) {
      const reportId = path.split("/").filter(Boolean)[1];
      const { error: dErr } = await supabase.from("daily_reports").delete().eq("id", reportId);
      if (dErr) return new Response(JSON.stringify({ error: dErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // GET /landing-behavior — funil por seção, scroll depth, cliques + comparação período anterior
    if (path === "/landing-behavior" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? (to.includes("T") ? to : to + "T23:59:59.999Z") : null;

      // Compute previous period (same length, immediately before)
      let prevFrom: string | null = null;
      let prevToEnd: string | null = null;
      if (from && toEnd) {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(toEnd).getTime();
        const span = toMs - fromMs;
        prevFrom = new Date(fromMs - span).toISOString();
        prevToEnd = new Date(fromMs - 1).toISOString();
      }

      async function pagedFetch(table: string, select: string, fromIso: string | null, toIso: string | null) {
        const PAGE = 1000;
        const MAX_ROWS = 8000;
        let all: any[] = [];
        let offset = 0;
        let more = true;
        while (more && all.length < MAX_ROWS) {
          let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
          if (fromIso) q = q.gte("created_at", fromIso);
          if (toIso) q = q.lte("created_at", toIso);
          const { data, error } = await q;
          if (error) throw error;
          if (data) all = all.concat(data);
          more = (data?.length || 0) === PAGE;
          offset += PAGE;
        }
        return all;
      }

      // Filter out internal sessions for accuracy
      async function getValidSessionIds(fromIso: string | null, toIso: string | null): Promise<Set<string>> {
        const sessions = await pagedFetch("lead_sessions", "id, referrer, first_page", fromIso, toIso);
        const valid = new Set<string>();
        sessions.forEach((s: any) => {
          const ref = (s.referrer || "").toLowerCase();
          const fp = (s.first_page || "").toLowerCase();
          if (ref.includes("lovable.dev") || ref.includes("lovableproject.com")) return;
          if (fp === "/admin") return;
          valid.add(s.id);
        });
        return valid;
      }

      async function buildPeriod(fromIso: string | null, toIso: string | null) {
        const validSessions = await getValidSessionIds(fromIso, toIso);
        const totalVisitors = validSessions.size;

        // section_views
        let sv = supabase.from("section_views").select("session_id, section_id, section_order, time_spent_ms").limit(8000);
        if (fromIso) sv = sv.gte("created_at", fromIso);
        if (toIso) sv = sv.lte("created_at", toIso);
        const { data: sectionRows } = await sv;
        const sections = (sectionRows || []).filter((r: any) => validSessions.has(r.session_id));

        // Group sections — usa o MAIOR section_order encontrado (ordem mais recente
        // da página vence; evita rótulos antigos com ordem desatualizada)
        const sectionMap = new Map<string, { id: string; order: number; sessions: Set<string>; totalTime: number; count: number }>();
        sections.forEach((r: any) => {
          let s = sectionMap.get(r.section_id);
          if (!s) {
            s = { id: r.section_id, order: r.section_order, sessions: new Set(), totalTime: 0, count: 0 };
            sectionMap.set(r.section_id, s);
          } else if (r.section_order > s.order) {
            s.order = r.section_order;
          }
          s.sessions.add(r.session_id);
          s.totalTime += r.time_spent_ms || 0;
          s.count += 1;
        });

        const sortedSections = Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);

        // click events (need them BEFORE funnel to count clicks per section)
        let ce = supabase.from("click_events").select("session_id, click_type, click_id, section_id, label, href").limit(8000);
        if (fromIso) ce = ce.gte("created_at", fromIso);
        if (toIso) ce = ce.lte("created_at", toIso);
        const { data: clickRows } = await ce;
        const clicks = (clickRows || []).filter((r: any) => validSessions.has(r.session_id));

        // Map: section_id -> Set of session_ids that clicked something in that section
        const clickSessionsBySection = new Map<string, Set<string>>();
        clicks.forEach((c: any) => {
          if (!c.section_id) return;
          let set = clickSessionsBySection.get(c.section_id);
          if (!set) { set = new Set(); clickSessionsBySection.set(c.section_id, set); }
          set.add(c.session_id);
        });

        // scroll milestones (precisamos ANTES do funil para usar como base)
        let sm = supabase.from("scroll_milestones").select("session_id, milestone").limit(8000);
        if (fromIso) sm = sm.gte("reached_at", fromIso);
        if (toIso) sm = sm.lte("reached_at", toIso);
        const { data: scrollRows } = await sm;
        const scrolls = (scrollRows || []).filter((r: any) => validSessions.has(r.session_id));

        // maxScrollBySession: maior milestone atingido por cada sessão
        const maxScrollBySession = new Map<string, number>();
        scrolls.forEach((r: any) => {
          const cur = maxScrollBySession.get(r.session_id) || 0;
          if (r.milestone > cur) maxScrollBySession.set(r.session_id, r.milestone);
        });

        const milestones: Record<number, Set<string>> = { 25: new Set(), 50: new Set(), 75: new Set(), 100: new Set() };
        scrolls.forEach((r: any) => milestones[r.milestone]?.add(r.session_id));
        const scrollDepth = [25, 50, 75, 100].map((m) => ({
          milestone: m,
          users: milestones[m].size,
          pct: totalVisitors > 0 ? (milestones[m].size / totalVisitors) * 100 : 0,
        }));

        // Funil baseado em SCROLL-DEPTH (mais confiável que IntersectionObserver):
        // Cada seção recebe uma posição estimada de scroll (% da página) baseada na sua ordem.
        // Uma sessão "alcançou" a seção se: (a) viu a seção via observer OU (b) scroll máximo >= posição da seção.
        // Garantia de monotonicidade: reached(N) inclui todos de reached(N+1) — se chegou no fim, viu tudo antes.
        const N = sortedSections.length;
        // Posição estimada de cada seção em % da página (distribuição uniforme entre 0% e 100%).
        const sectionScrollPos = sortedSections.map((_, idx) => N > 1 ? (idx / (N - 1)) * 100 : 0);

        // Construir reached do FINAL para o INÍCIO garantindo monotonicidade
        const reachedSets: Set<string>[] = new Array(N).fill(null).map(() => new Set<string>());
        for (let idx = N - 1; idx >= 0; idx--) {
          const s = sortedSections[idx];
          const pos = sectionScrollPos[idx];
          const set = reachedSets[idx];
          // (a) sessões que viram a seção via observer
          s.sessions.forEach((sid) => set.add(sid));
          // (b) sessões cujo scroll máximo passou da posição da seção
          maxScrollBySession.forEach((maxM, sid) => {
            if (maxM >= pos) set.add(sid);
          });
          // (c) herdar todas as sessões que alcançaram seções posteriores (monotonicidade)
          if (idx < N - 1) {
            reachedSets[idx + 1].forEach((sid) => set.add(sid));
          }
        }

        // Para a primeira seção, todos os visitantes válidos são considerados "alcançados"
        // (pois entraram na página, então viram pelo menos o topo)
        if (N > 0) {
          validSessions.forEach((sid) => reachedSets[0].add(sid));
        }

        const funnel = sortedSections.map((s, idx) => {
          const reached = reachedSets[idx].size;
          const next = sortedSections[idx + 1];
          const clickersHere = clickSessionsBySection.get(s.id) || new Set<string>();
          const clickedCount = Array.from(clickersHere).filter((sid) => reachedSets[idx].has(sid)).length;
          // "continued" = avançou para a próxima seção OU clicou em algo nesta seção
          const continuedSet = new Set<string>();
          if (next) reachedSets[idx + 1].forEach((sid) => { if (reachedSets[idx].has(sid)) continuedSet.add(sid); });
          clickersHere.forEach((sid) => { if (reachedSets[idx].has(sid)) continuedSet.add(sid); });
          const continued = next ? continuedSet.size : clickedCount;
          const dropped = Math.max(0, reached - continued);
          return {
            section_id: s.id,
            order: s.order,
            reached,
            continued,
            clicked: clickedCount,
            dropped,
            drop_rate: reached > 0 ? (dropped / reached) * 100 : 0,
            continue_rate: reached > 0 ? (continued / reached) * 100 : 0,
            click_rate: reached > 0 ? (clickedCount / reached) * 100 : 0,
            avg_time_ms: s.count > 0 ? Math.round(s.totalTime / s.count) : 0,
            pct_of_visitors: totalVisitors > 0 ? (reached / totalVisitors) * 100 : 0,
          };
        });

        // click aggregations (clicks already fetched above for funnel calc)

        const clicksByType: Record<string, number> = {};
        const clicksBySection: Record<string, number> = {};
        const topClicks: Record<string, { id: string; label: string; section: string | null; type: string; count: number; uniqueUsers: Set<string> }> = {};
        clicks.forEach((c: any) => {
          clicksByType[c.click_type] = (clicksByType[c.click_type] || 0) + 1;
          if (c.section_id) clicksBySection[c.section_id] = (clicksBySection[c.section_id] || 0) + 1;
          const key = `${c.click_type}::${c.click_id || c.label || "unknown"}`;
          if (!topClicks[key]) {
            topClicks[key] = { id: c.click_id || "?", label: c.label || c.click_id || "?", section: c.section_id, type: c.click_type, count: 0, uniqueUsers: new Set() };
          }
          topClicks[key].count += 1;
          topClicks[key].uniqueUsers.add(c.session_id);
        });
        const topClicksArr = Object.values(topClicks)
          .map((t) => ({ ...t, uniqueUsers: t.uniqueUsers.size }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);

        // Breakdown de cliques POR SEÇÃO + click_id (usado p/ ver cliques em cada item, ex: cada pergunta do FAQ)
        const buttonAgg: Record<string, Record<string, { id: string; label: string; type: string; count: number; users: Set<string> }>> = {};
        clicks.forEach((c: any) => {
          if (!c.section_id) return;
          const cid = c.click_id || c.label || "unknown";
          if (!buttonAgg[c.section_id]) buttonAgg[c.section_id] = {};
          if (!buttonAgg[c.section_id][cid]) {
            buttonAgg[c.section_id][cid] = { id: cid, label: c.label || cid, type: c.click_type, count: 0, users: new Set() };
          }
          buttonAgg[c.section_id][cid].count += 1;
          buttonAgg[c.section_id][cid].users.add(c.session_id);
        });
        const clicksByButton: Record<string, Array<{ id: string; label: string; type: string; count: number; uniqueUsers: number }>> = {};
        Object.keys(buttonAgg).forEach((sid) => {
          clicksByButton[sid] = Object.values(buttonAgg[sid])
            .map((b) => ({ id: b.id, label: b.label, type: b.type, count: b.count, uniqueUsers: b.users.size }))
            .sort((a, b) => b.count - a.count);
        });

        return {
          totalVisitors,
          funnel,
          scrollDepth,
          clicksByType,
          clicksBySection,
          clicksByButton,
          topClicks: topClicksArr,
          totalClicks: clicks.length,
        };
      }

      const current = await buildPeriod(from, toEnd);
      const previous = (prevFrom && prevToEnd) ? await buildPeriod(prevFrom, prevToEnd) : null;

      // Insights
      const insights: string[] = [];
      if (current.funnel.length > 0) {
        const worst = [...current.funnel].sort((a, b) => b.drop_rate - a.drop_rate)[0];
        const best = [...current.funnel].sort((a, b) => b.continue_rate - a.continue_rate)[0];
        if (worst) insights.push(`Maior queda acontece na seção "${worst.section_id}" (${worst.drop_rate.toFixed(0)}% saem aqui).`);
        if (best && best.section_id !== worst?.section_id) insights.push(`Melhor retenção na seção "${best.section_id}" (${best.continue_rate.toFixed(0)}% continuam).`);
        const lastReached = current.funnel.filter((f) => f.pct_of_visitors >= 50).pop();
        if (lastReached) insights.push(`A maioria dos visitantes alcança até "${lastReached.section_id}".`);
      }
      const scroll50 = current.scrollDepth.find((s) => s.milestone === 50);
      const scroll100 = current.scrollDepth.find((s) => s.milestone === 100);
      if (scroll50 && scroll50.pct < 50) insights.push(`Apenas ${scroll50.pct.toFixed(0)}% chegam à metade da página — perda forte no início.`);
      if (scroll100 && scroll100.pct < 20) insights.push(`Só ${scroll100.pct.toFixed(0)}% chegam ao fim da página.`);
      if (previous && current.funnel.length > 0 && previous.funnel.length > 0) {
        const cReach = current.funnel[current.funnel.length - 1]?.pct_of_visitors || 0;
        const pReach = previous.funnel[previous.funnel.length - 1]?.pct_of_visitors || 0;
        const diff = cReach - pReach;
        if (Math.abs(diff) > 3) {
          insights.push(`Retenção até o final ${diff > 0 ? "melhorou" : "piorou"} ${Math.abs(diff).toFixed(0)}pp vs período anterior.`);
        }
      }

      return new Response(JSON.stringify({ current, previous, insights }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /tracking-diagnostics - Compare Meta clicks vs landing_hits vs cta_clicks vs pageview sessions
    if (path === "/tracking-diagnostics" && req.method === "GET") {
      const fromParam = url.searchParams.get("from");
      const toParam = url.searchParams.get("to");
      if (!fromParam || !toParam) {
        return new Response(
          JSON.stringify({ error: "from e to são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fromISO = fromParam;
      const toISO = toParam.includes("T") ? toParam : toParam + "T23:59:59.999Z";
      const fromDateOnly = fromParam.slice(0, 10);
      const toDateOnly = toParam.slice(0, 10);

      // 1. Meta Ads clicks (from ad_spend.clicks)
      const { data: spendRows } = await supabase
        .from("ad_spend")
        .select("clicks, impressions, spend, date")
        .gte("date", fromDateOnly)
        .lte("date", toDateOnly);
      const metaClicks = (spendRows || []).reduce((s: number, r: any) => s + (r.clicks || 0), 0);
      const metaImpressions = (spendRows || []).reduce((s: number, r: any) => s + (r.impressions || 0), 0);

      // 2. Landing hits (paginated to bypass 1000 row limit)
      type Hit = { device_type: string | null; utm_source: string | null; click_id: string | null; session_id: string | null };
      const allHits: Hit[] = [];
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("landing_hits")
          .select("device_type, utm_source, click_id, session_id")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .range(offset, offset + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allHits.push(...(data as Hit[]));
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      const totalHits = allHits.length;
      const byDevice: Record<string, number> = { ios: 0, android: 0, desktop: 0, mobile: 0, unknown: 0 };
      let hitsFromAds = 0;
      let hitsOrganic = 0;
      for (const h of allHits) {
        const d = h.device_type || "unknown";
        byDevice[d] = (byDevice[d] || 0) + 1;
        const src = (h.utm_source || "").toLowerCase();
        if (src && src !== "direct" && src !== "organic" && !src.includes("{{")) hitsFromAds++;
        else hitsOrganic++;
      }

      // 3. CTA clicks (click_events with click_type=cta_primary or button + start_btn)
      const allClicks: { click_type: string; click_id: string | null }[] = [];
      offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("click_events")
          .select("click_type, click_id")
          .gte("created_at", fromISO)
          .lte("created_at", toISO)
          .eq("page", "/")
          .range(offset, offset + PAGE - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        allClicks.push(...(data as any));
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      const ctaClicks = allClicks.filter((c) => {
        const t = (c.click_type || "").toLowerCase();
        const id = (c.click_id || "").toLowerCase();
        return t === "cta_primary" || id.includes("start_btn") || id.includes("cta");
      }).length;

      // 4. Lead sessions (legacy "pageviews") in same period - filter for landing page only
      const { count: legacyPageviews } = await supabase
        .from("lead_sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .eq("first_page", "/");

      // 5. Diagnostics
      const alerts: { severity: "ALTA" | "MÉDIA" | "BAIXA"; title: string; message: string }[] = [];
      const lossMetaToHits = metaClicks - totalHits;
      const lossPct = metaClicks > 0 ? (lossMetaToHits / metaClicks) * 100 : 0;

      if (metaClicks > 0 && lossPct > 30) {
        alerts.push({
          severity: "ALTA",
          title: "Perda de carregamento crítica",
          message: `${lossMetaToHits} cliques (${lossPct.toFixed(1)}%) do Meta não chegaram na landing. Possível lentidão, timeout ou script bloqueando o carregamento.`,
        });
      } else if (metaClicks > 0 && lossPct > 15) {
        alerts.push({
          severity: "MÉDIA",
          title: "Perda de carregamento moderada",
          message: `${lossMetaToHits} cliques (${lossPct.toFixed(1)}%) do Meta não viraram landing_hit. Verifique velocidade da página.`,
        });
      }

      const pvDiff = totalHits - (legacyPageviews || 0);
      if (totalHits > 50 && legacyPageviews && pvDiff / totalHits > 0.2) {
        alerts.push({
          severity: "MÉDIA",
          title: "Pixel/tracking secundário com perda",
          message: `${pvDiff} hits não foram registrados pelo tracking de sessão (lead_sessions). Pode indicar bloqueio de script (ITP/AdBlock/WebView).`,
        });
      }

      const iosShare = totalHits > 0 ? (byDevice.ios || 0) / totalHits : 0;
      const iosClicksShare = ctaClicks > 0 ? 0 : 0; // cant infer device from click_events
      if (iosShare > 0.3 && metaClicks > 0 && lossPct > 20) {
        alerts.push({
          severity: "MÉDIA",
          title: "Possível impacto de ITP/WebView (iOS)",
          message: `iOS representa ${(iosShare * 100).toFixed(0)}% dos hits e há perda de ${lossPct.toFixed(1)}%. Safari/WebView podem estar bloqueando scripts.`,
        });
      }

      if (metaClicks === 0 && totalHits === 0) {
        alerts.push({
          severity: "BAIXA",
          title: "Sem dados no período",
          message: "Nenhum clique do Meta nem landing_hit registrado neste período.",
        });
      }

      return new Response(
        JSON.stringify({
          period: { from: fromISO, to: toISO },
          meta: { clicks: metaClicks, impressions: metaImpressions },
          landing_hits: {
            total: totalHits,
            by_device: byDevice,
            from_ads: hitsFromAds,
            organic: hitsOrganic,
          },
          cta_clicks: ctaClicks,
          legacy_pageviews: legacyPageviews || 0,
          comparisons: {
            meta_vs_hits_loss: lossMetaToHits,
            meta_vs_hits_loss_pct: Number(lossPct.toFixed(2)),
            hits_vs_cta_engagement_pct:
              totalHits > 0 ? Number(((ctaClicks / totalHits) * 100).toFixed(2)) : 0,
          },
          alerts,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Rota não encontrada" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Admin data error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
