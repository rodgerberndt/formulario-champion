import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

serve(async (req) => {
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
      
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

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
      
      const { data, error } = await supabase
        .from("leads")
        .update(body)
        .eq("id", leadId)
        .select()
        .maybeSingle();

      if (error) throw error;

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
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = (page - 1) * limit;

      let query = supabase
        .from("lead_sessions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply filters
      if (from) {
        query = query.gte("created_at", from);
      }
      if (to) {
        query = query.lte("created_at", to);
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

    // GET /metrics - Get funnel metrics (calculated from events for accuracy)
    if (path === "/metrics" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      // Get all sessions
      let sessionsQuery = supabase.from("lead_sessions").select("*");
      if (from) sessionsQuery = sessionsQuery.gte("created_at", from);
      if (to) sessionsQuery = sessionsQuery.lte("created_at", to);
      const { data: sessions, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;

      // Get all events to calculate accurate metrics (including button_id for start_click)
      const { data: allEvents, error: eventsError } = await supabase
        .from("lead_events")
        .select("event_name, step_id, session_id, page, metadata, button_id");
      if (eventsError) throw eventsError;

      // Get total leads (completed quizzes)
      const { count: leadsCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true });

      // Calculate metrics from events (more accurate)
      const sessionsWithQuizView = new Set(
        allEvents?.filter(e => e.event_name === "quiz_view").map(e => e.session_id) || []
      );
      const sessionsWithStepView = new Set(
        allEvents?.filter(e => e.event_name === "step_view").map(e => e.session_id) || []
      );
      const sessionsWithSubmit = new Set(
        allEvents?.filter(e => e.event_name === "submit").map(e => e.session_id) || []
      );

      const total = sessions?.length || 0;
      const enteredQuiz = sessionsWithQuizView.size;
      const startedQuiz = sessionsWithStepView.size;
      // Use leads count as ground truth for completed
      const completed = leadsCount || sessionsWithSubmit.size;

      // Button distribution - calculate from events (more accurate than sessions)
      const buttonEventCounts: Record<string, Set<string>> = {
        start_btn_1: new Set(),
        start_btn_2: new Set(),
        start_btn_3: new Set(),
      };
      
      allEvents?.forEach(event => {
        if (event.event_name === "start_click" && event.button_id) {
          const buttonId = event.button_id;
          if (buttonEventCounts[buttonId]) {
            buttonEventCounts[buttonId].add(event.session_id);
          }
        }
      });
      
      const buttonDistribution = {
        start_btn_1: buttonEventCounts.start_btn_1.size,
        start_btn_2: buttonEventCounts.start_btn_2.size,
        start_btn_3: buttonEventCounts.start_btn_3.size,
      };

      // Step funnel - count unique sessions per step
      const stepOrder = ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_dor"];
      const stepCounts: Record<string, Set<string>> = {};
      allEvents?.forEach(event => {
        if (event.event_name === "step_view" && event.step_id) {
          if (!stepCounts[event.step_id]) {
            stepCounts[event.step_id] = new Set();
          }
          stepCounts[event.step_id].add(event.session_id);
        }
      });

      const stepFunnel = stepOrder.map(stepId => ({
        step_id: stepId,
        count: stepCounts[stepId]?.size || 0,
      }));

      // Drop-off analysis - find where users actually stopped (didn't advance from)
      const dropOffs: Record<string, number> = {};
      
      // Track which steps each session viewed and which they advanced from (step_next)
      const sessionViewedSteps: Record<string, Set<string>> = {};
      const sessionAdvancedFrom: Record<string, Set<string>> = {};
      
      allEvents?.forEach(event => {
        if (event.event_name === "step_view" && event.step_id) {
          if (!sessionViewedSteps[event.session_id]) {
            sessionViewedSteps[event.session_id] = new Set();
          }
          sessionViewedSteps[event.session_id].add(event.step_id);
        }
        
        // Track which steps the user advanced FROM (meaning they completed that step)
        if (event.event_name === "step_next") {
          const metadata = event.metadata as Record<string, unknown> | null;
          const fromStep = metadata?.from_step as string | undefined;
          if (fromStep) {
            if (!sessionAdvancedFrom[event.session_id]) {
              sessionAdvancedFrom[event.session_id] = new Set();
            }
            sessionAdvancedFrom[event.session_id].add(fromStep);
          }
        }
      });

      // For each session that didn't complete, find the last step they viewed but didn't advance from
      Object.entries(sessionViewedSteps).forEach(([sessionId, viewedSteps]) => {
        if (!sessionsWithSubmit.has(sessionId)) {
          const advancedFrom = sessionAdvancedFrom[sessionId] || new Set();
          
          // Find the furthest step they viewed but didn't advance from
          let dropOffStep: string | null = null;
          let dropOffIndex = -1;
          
          viewedSteps.forEach(step => {
            const stepIndex = stepOrder.indexOf(step);
            // They dropped off at this step if they viewed it but didn't advance from it
            if (!advancedFrom.has(step) && stepIndex > dropOffIndex) {
              dropOffStep = step;
              dropOffIndex = stepIndex;
            }
          });
          
          if (dropOffStep) {
            dropOffs[dropOffStep] = (dropOffs[dropOffStep] || 0) + 1;
          }
        }
      });

      return new Response(
        JSON.stringify({
          total_visitors: total,
          entered_quiz: enteredQuiz,
          started_quiz: startedQuiz,
          completed,
          completion_rate: startedQuiz > 0 ? (completed / startedQuiz * 100).toFixed(1) : 0,
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
      const stepOrder = ["q1_nome", "q2_whats", "q3_insta", "q4_mercado", "q5_estagio", "q6_dor"];

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
