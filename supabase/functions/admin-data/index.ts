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
    const path = url.pathname.replace("/admin-data", "");

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

    // GET /metrics - Get funnel metrics
    if (path === "/metrics" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      let query = supabase.from("lead_sessions").select("*");
      
      if (from) {
        query = query.gte("created_at", from);
      }
      if (to) {
        query = query.lte("created_at", to);
      }

      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;

      // Calculate metrics
      const total = sessions?.length || 0;
      const enteredQuiz = sessions?.filter(s => s.entered_quiz_page).length || 0;
      const startedQuiz = sessions?.filter(s => s.started_quiz).length || 0;
      const completed = sessions?.filter(s => s.completed).length || 0;

      // Button distribution
      const buttonDistribution = {
        start_btn_1: sessions?.filter(s => s.start_button_id === "start_btn_1").length || 0,
        start_btn_2: sessions?.filter(s => s.start_button_id === "start_btn_2").length || 0,
        start_btn_3: sessions?.filter(s => s.start_button_id === "start_btn_3").length || 0,
      };

      // Step funnel - get from events
      let eventsQuery = supabase
        .from("lead_events")
        .select("event_name, step_id, session_id")
        .eq("event_name", "step_view");
      
      const { data: stepEvents, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;

      // Count unique sessions per step
      const stepCounts: Record<string, Set<string>> = {};
      stepEvents?.forEach(event => {
        if (event.step_id) {
          if (!stepCounts[event.step_id]) {
            stepCounts[event.step_id] = new Set();
          }
          stepCounts[event.step_id].add(event.session_id);
        }
      });

      const stepFunnel = Object.entries(stepCounts).map(([stepId, sessions]) => ({
        step_id: stepId,
        count: sessions.size,
      }));

      // Drop-off analysis
      const dropOffs: Record<string, number> = {};
      sessions?.forEach(session => {
        if (session.started_quiz && !session.completed && session.current_step_id) {
          dropOffs[session.current_step_id] = (dropOffs[session.current_step_id] || 0) + 1;
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
