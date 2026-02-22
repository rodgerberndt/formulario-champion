import { createClient } from "jsr:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

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
        .order("created_at", { ascending: false });

      // Apply date filters
      if (from) {
        query = query.gte("created_at", from);
      }
      if (to) {
        query = query.lte("created_at", to + "T23:59:59.999");
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

      // Check if sdr_override is being set to "Rodger" (MQL trigger)
      const isSettingMQL = body.sdr_override === "Rodger";

      // Fetch current lead to check previous sdr_override
      let wasMQL = false;
      if (isSettingMQL) {
        const { data: currentLead } = await supabase
          .from("leads")
          .select("sdr_override")
          .eq("id", leadId)
          .maybeSingle();
        wasMQL = currentLead?.sdr_override === "Rodger";
      }
      
      const { data, error } = await supabase
        .from("leads")
        .update(body)
        .eq("id", leadId)
        .select()
        .maybeSingle();

      if (error) throw error;

      // Fire Meta CAPI MQL event if sdr_override just changed to "Rodger"
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
        .order("created_at", { ascending: false })
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
        query = query.gte("created_at", from);
      }
      if (to) {
        // Include entire day by adding time component
        query = query.lte("created_at", to + "T23:59:59.999");
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

    // GET /metrics - Get funnel metrics
    if (path === "/metrics" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const toEnd = to ? to + "T23:59:59.999" : null;

      // Helper to fetch ALL rows (bypass 1000-row limit) with pagination
      async function fetchAll<T>(table: string, select: string, filters: (q: any) => any): Promise<T[]> {
        const PAGE_SIZE = 1000;
        let all: T[] = [];
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
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

      // Fetch ALL sessions (paginated) - include referrer & first_page for filtering
      const rawSessions = await fetchAll<any>("lead_sessions", "id, ip_address, created_at, referrer, first_page", (q: any) => {
        if (from) q = q.gte("created_at", from);
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
      const total = sessions.length;

      // Calculate unique visitors by IP
      const sessionsWithIp = sessions.filter((s: any) => s.ip_address && s.ip_address !== 'unknown');
      const uniqueIps = new Set(sessionsWithIp.map((s: any) => s.ip_address));
      const ipCoverage = total > 0 ? (sessionsWithIp.length / total) : 0;
      const uniqueVisitors = ipCoverage >= 0.5 ? uniqueIps.size : total;
      const hasReliableIpData = ipCoverage >= 0.5;

      // Fetch ALL events for those sessions (paginated)
      const allEvents = await fetchAll<any>(
        "lead_events",
        "event_name, step_id, session_id, metadata, button_id",
        (q: any) => {
          if (from) q = q.gte("created_at", from);
          if (toEnd) q = q.lte("created_at", toEnd);
          return q;
        }
      );
      // Filter to only sessions in our range
      const filteredEvents = allEvents.filter((e: any) => sessionIds.has(e.session_id));

      // Get total leads (ground truth for completed)
      let leadsQuery = supabase.from("leads").select("*", { count: "exact", head: true });
      if (from) leadsQuery = leadsQuery.gte("created_at", from);
      if (toEnd) leadsQuery = leadsQuery.lte("created_at", toEnd);
      const { count: leadsCount } = await leadsQuery;
      const completed = leadsCount || 0;

      // Calculate event-based metrics
      const sessionsWithQuizView = new Set(
        filteredEvents.filter((e: any) => e.event_name === "quiz_view").map((e: any) => e.session_id)
      );
      const sessionsWithStepView = new Set(
        filteredEvents.filter((e: any) => e.event_name === "step_view").map((e: any) => e.session_id)
      );

      // Ensure funnel is monotonically decreasing
      const enteredQuiz = Math.max(sessionsWithQuizView.size, completed);
      const startedQuiz = Math.max(sessionsWithStepView.size, completed);

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

      // Step funnel
      const stepOrder = ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_investimento", "q7_dor"];
      const stepCounts: Record<string, Set<string>> = {};
      const sessionViewedSteps: Record<string, Set<string>> = {};
      const sessionAdvancedFrom: Record<string, Set<string>> = {};

      filteredEvents.forEach((event: any) => {
        if (event.event_name === "step_view" && event.step_id) {
          if (!stepCounts[event.step_id]) stepCounts[event.step_id] = new Set();
          stepCounts[event.step_id].add(event.session_id);
          if (!sessionViewedSteps[event.session_id]) sessionViewedSteps[event.session_id] = new Set();
          sessionViewedSteps[event.session_id].add(event.step_id);
        }
        if (event.event_name === "step_next") {
          const metadata = event.metadata as Record<string, unknown> | null;
          const fromStep = metadata?.from_step as string | undefined;
          if (fromStep) {
            if (!sessionAdvancedFrom[event.session_id]) sessionAdvancedFrom[event.session_id] = new Set();
            sessionAdvancedFrom[event.session_id].add(fromStep);
          }
        }
      });

      const stepFunnel = stepOrder.map(stepId => ({
        step_id: stepId, count: stepCounts[stepId]?.size || 0,
      }));

      // Drop-off analysis
      const sessionsWithSubmit = new Set(
        filteredEvents.filter((e: any) => e.event_name === "submit").map((e: any) => e.session_id)
      );
      const dropOffs: Record<string, number> = {};
      Object.entries(sessionViewedSteps).forEach(([sessionId, viewedSteps]) => {
        if (!sessionsWithSubmit.has(sessionId)) {
          const advancedFrom = sessionAdvancedFrom[sessionId] || new Set();
          let dropOffStep: string | null = null;
          let dropOffIndex = -1;
          viewedSteps.forEach(step => {
            const stepIndex = stepOrder.indexOf(step);
            if (!advancedFrom.has(step) && stepIndex > dropOffIndex) {
              dropOffStep = step;
              dropOffIndex = stepIndex;
            }
          });
          if (dropOffStep) dropOffs[dropOffStep] = (dropOffs[dropOffStep] || 0) + 1;
        }
      });

      console.log("[FUNNEL] Raw:", rawSessions.length, "Filtered:", filteredOutCount, "Clean:", total, "Events:", filteredEvents.length, "Leads:", completed, "UniqueIPs:", uniqueIps.size);

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
          conversion_rate: uniqueVisitors > 0 ? (completed / uniqueVisitors * 100).toFixed(1) : 0,
          completion_rate: enteredQuiz > 0 ? (completed / enteredQuiz * 100).toFixed(1) : 0,
          button_distribution: buttonDistribution,
          step_funnel: stepFunnel,
          drop_offs: dropOffs,
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
      if (to) sessionsQuery = sessionsQuery.lte("created_at", to + "T23:59:59");
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
      if (to) query = query.lte("created_at", to + "T23:59:59");
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
      const toEnd = to ? to + "T23:59:59.999" : null;

      // Helper to normalize creative key
      function normalizeKey(raw: string): string {
        return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      }

      // MQL logic — requires BOTH advanced stage AND minimum faturamento (>= R$10k)
      const MQL_STAGES = ["Pré-escala (vendas constantes)", "Escala (buscando otimização)", "Validação (primeiras vendas)"];
      const MQL_FAT_MIN_FAIXAS = [
        "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
        "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
        "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
        "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
        "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
        "Acima de R$ 10 milhões",
      ];
      function isMql(estagio: string, investimento: string | null, sdrOverride?: string | null): boolean {
        // MQL = same as Rodger SDR assignment
        if (sdrOverride === "Rodger") return true;
        if (sdrOverride === "Dara") return false;
        const isAdvancedStage = MQL_STAGES.includes(estagio);
        const faturaEnough = investimento ? MQL_FAT_MIN_FAIXAS.includes(investimento) : false;
        return isAdvancedStage && faturaEnough;
      }

      // Fetch ALL leads in period
      const PAGE_SIZE = 1000;
      let allLeads: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let q = supabase.from("leads").select("id, created_at, utm_content, utm_campaign, utm_source, estagio_negocio, investimento_faixa, sdr_override, tier").range(offset, offset + PAGE_SIZE - 1);
        if (from) q = q.gte("created_at", from);
        if (toEnd) q = q.lte("created_at", toEnd);
        const { data, error } = await q;
        if (error) throw error;
        if (data) allLeads = allLeads.concat(data);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      // Fetch ad_spend in period
      let spendQuery = supabase.from("ad_spend").select("*");
      if (from) spendQuery = spendQuery.gte("date", from);
      if (to) spendQuery = spendQuery.lte("date", to);
      const { data: spendData } = await spendQuery;

      // Fetch manual_sales in period
      let salesQuery = supabase.from("manual_sales").select("*");
      if (from) salesQuery = salesQuery.gte("sale_date", from);
      if (to) salesQuery = salesQuery.lte("sale_date", to);
      const { data: salesData } = await salesQuery;

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
        spend: number;
        sales_count: number;
        revenue: number;
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
            spend: 0,
            sales_count: 0,
            revenue: 0,
            last_activity: null,
            leads_by_stage: {},
            campaigns: new Set(),
          });
        }
        return creativeMap.get(key)!;
      }

      // Tier mapping for leads (including legacy traffic values)
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

      let leadsWithCreative = 0;
      let leadsWithoutUtms = 0;

      // Process leads
      for (const lead of allLeads) {
        const rawKey = lead.utm_content;
        if (!rawKey) {
          leadsWithoutUtms++;
          continue;
        }
        const ck = normalizeKey(rawKey);
        if (!ck) {
          leadsWithoutUtms++;
          continue;
        }
        leadsWithCreative++;
        const agg = getOrCreate(ck, rawKey, "utm_content");
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
        const amount = Number(s.spend) || 0;
        spendTotal += amount;
        const rawKey = s.utm_content || s.ad_name;
        if (!rawKey) continue;
        const ck = s.creative_key || normalizeKey(rawKey);
        if (!ck) continue;
        spendMapped += amount;
        const agg = getOrCreate(ck, rawKey, s.utm_content ? "utm_content" : "fallback");
        agg.spend += amount;
        if (s.campaign_name) agg.campaigns.add(s.campaign_name);
        const spendDate = s.date;
        if (!agg.last_activity || spendDate > agg.last_activity) {
          agg.last_activity = spendDate;
        }
      }

      // Process sales
      let salesWithoutCreative = 0;
      for (const sale of (salesData || [])) {
        const rawKey = sale.creative_key || sale.utm_content;
        if (!rawKey) {
          salesWithoutCreative++;
          continue;
        }
        const ck = normalizeKey(rawKey);
        if (!ck) {
          salesWithoutCreative++;
          continue;
        }
        const agg = getOrCreate(ck, rawKey, "utm_content");
        agg.sales_count++;
        agg.revenue += Number(sale.revenue) || 0;
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
        const cac = c.sales_count > 0 ? c.spend / c.sales_count : null;
        const roas = c.spend > 0 ? c.revenue / c.spend : null;
        return {
          ...c,
          mql_rate,
          cost_per_mql,
          cost_per_tier_large,
          cost_per_small,
          cost_per_medium,
          cost_per_enterprise,
          cost_per_enterprise_plus,
          cac,
          roas,
          campaigns: Array.from(c.campaigns),
        };
      });

      // Totals
      const totalSpend = creatives.reduce((s, c) => s + c.spend, 0) + (spendTotal - spendMapped);
      const totalLeads = allLeads.length;
      const totalMql = creatives.reduce((s, c) => s + c.mql_count, 0);
      const totalTierSmall = creatives.reduce((s, c) => s + c.tier_small_count, 0);
      const totalTierMedium = creatives.reduce((s, c) => s + c.tier_medium_count, 0);
      const totalTierLarge = creatives.reduce((s, c) => s + c.tier_large_count, 0);
      const totalTierEnterprise = creatives.reduce((s, c) => s + c.tier_enterprise_count, 0);
      const totalTierEnterprisePlus = creatives.reduce((s, c) => s + c.tier_enterprise_plus_count, 0);
      const totalSales = creatives.reduce((s, c) => s + c.sales_count, 0) + salesWithoutCreative;
      const totalRevenue = creatives.reduce((s, c) => s + c.revenue, 0);

      return new Response(
        JSON.stringify({
          creatives,
          totals: {
            spend: totalSpend,
            leads: totalLeads,
            mql: totalMql,
            tier_small: totalTierSmall,
            tier_medium: totalTierMedium,
            tier_large: totalTierLarge,
            tier_enterprise: totalTierEnterprise,
            tier_enterprise_plus: totalTierEnterprisePlus,
            sales: totalSales,
            revenue: totalRevenue,
            cpl: totalLeads > 0 ? totalSpend / totalLeads : null,
            cpmql: totalMql > 0 ? totalSpend / totalMql : null,
            cp_tier_small: totalTierSmall > 0 ? totalSpend / totalTierSmall : null,
            cp_tier_medium: totalTierMedium > 0 ? totalSpend / totalTierMedium : null,
            cp_tier_large: totalTierLarge > 0 ? totalSpend / totalTierLarge : null,
            cp_tier_enterprise: totalTierEnterprise > 0 ? totalSpend / totalTierEnterprise : null,
            cp_tier_enterprise_plus: totalTierEnterprisePlus > 0 ? totalSpend / totalTierEnterprisePlus : null,
            cac: totalSales > 0 ? totalSpend / totalSales : null,
            roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
          },
          data_quality: {
            leads_with_creative: leadsWithCreative,
            leads_total: allLeads.length,
            spend_mapped: spendMapped,
            spend_total: spendTotal,
            sales_without_creative: salesWithoutCreative,
            leads_without_utms: leadsWithoutUtms,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──── GET /manual-sales ────
    if (path === "/manual-sales" && req.method === "GET" && url.searchParams.get("_method") !== "POST") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      
      let query = supabase.from("manual_sales").select("*").order("sale_date", { ascending: false });
      if (from) query = query.gte("sale_date", from);
      if (to) query = query.lte("sale_date", to);
      
      const { data, error } = await query;
      if (error) throw error;
      
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── DELETE /manual-sales/:id ────
    const deleteSaleMatch = path.match(/^\/manual-sales\/([a-f0-9-]+)$/);
    if (deleteSaleMatch && req.method === "DELETE") {
      const saleId = deleteSaleMatch[1];
      const { error } = await supabase.from("manual_sales").delete().eq("id", saleId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──── POST /manual-sales ────
    if (path === "/manual-sales" && (req.method === "POST" || url.searchParams.get("_method") === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      const { data, error } = await supabase.from("manual_sales").insert([{
        sale_date: params.sale_date,
        revenue: parseFloat(params.revenue),
        creative_key: params.creative_key || null,
        utm_content: params.utm_content || null,
        notes: params.notes || null,
      }]).select().maybeSingle();

      if (error) throw error;
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
