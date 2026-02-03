import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
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

      // Get all events to calculate accurate metrics
      const { data: allEvents, error: eventsError } = await supabase
        .from("lead_events")
        .select("event_name, step_id, session_id, page");
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

      // Button distribution
      const buttonDistribution = {
        start_btn_1: sessions?.filter(s => s.start_button_id === "start_btn_1").length || 0,
        start_btn_2: sessions?.filter(s => s.start_button_id === "start_btn_2").length || 0,
        start_btn_3: sessions?.filter(s => s.start_button_id === "start_btn_3").length || 0,
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

      // Drop-off analysis - find last step for sessions that didn't complete
      const dropOffs: Record<string, number> = {};
      const sessionLastStep: Record<string, string> = {};
      
      // Find the furthest step each session reached
      allEvents?.forEach(event => {
        if (event.event_name === "step_view" && event.step_id) {
          const currentIndex = stepOrder.indexOf(event.step_id);
          const existingStep = sessionLastStep[event.session_id];
          const existingIndex = existingStep ? stepOrder.indexOf(existingStep) : -1;
          
          if (currentIndex > existingIndex) {
            sessionLastStep[event.session_id] = event.step_id;
          }
        }
      });

      // Count drop-offs at each step (sessions that didn't submit)
      Object.entries(sessionLastStep).forEach(([sessionId, lastStep]) => {
        if (!sessionsWithSubmit.has(sessionId)) {
          dropOffs[lastStep] = (dropOffs[lastStep] || 0) + 1;
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

      // Find the furthest step each session reached
      const sessionLastStep: Record<string, string> = {};
      allEvents?.forEach(event => {
        if (event.event_name === "step_view" && event.step_id) {
          const currentIndex = stepOrder.indexOf(event.step_id);
          const existingStep = sessionLastStep[event.session_id];
          const existingIndex = existingStep ? stepOrder.indexOf(existingStep) : -1;
          
          if (currentIndex > existingIndex) {
            sessionLastStep[event.session_id] = event.step_id;
          }
        }
      });

      // Collect field values from step_next events for each session
      const sessionFieldData: Record<string, Record<string, string>> = {};
      allEvents?.forEach(event => {
        if (event.event_name === "step_next" && event.metadata) {
          const metadata = event.metadata as Record<string, unknown>;
          const fieldValue = metadata.field_value as Record<string, string> | undefined;
          if (fieldValue) {
            if (!sessionFieldData[event.session_id]) {
              sessionFieldData[event.session_id] = {};
            }
            Object.assign(sessionFieldData[event.session_id], fieldValue);
          }
        }
      });

      // Get sessions that dropped off at this step
      const droppedSessionIds = Object.entries(sessionLastStep)
        .filter(([sessionId, lastStep]) => lastStep === stepId && !sessionsWithSubmit.has(sessionId))
        .map(([sessionId]) => sessionId);

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
