import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get client IP from various headers (Cloudflare, nginx, etc.)
    const ip = 
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';

    console.log('Client IP detected:', ip);

    const { session_id, action, lead_id } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'check_session') {
      // Check if this IP already has a session (to avoid counting duplicate visits)
      const { data: existingSessions, error: checkError } = await supabase
        .from('lead_sessions')
        .select('id')
        .eq('ip_address', ip)
        .limit(1);

      if (checkError) {
        console.error('Error checking existing sessions:', checkError);
      }

      const isNewVisitor = !existingSessions || existingSessions.length === 0;

      // Update session with IP
      if (session_id) {
        const { error: updateError } = await supabase
          .from('lead_sessions')
          .update({ ip_address: ip })
          .eq('id', session_id);

        if (updateError) {
          console.error('Error updating session IP:', updateError);
        }
      }

      return new Response(
        JSON.stringify({ ip, is_new_visitor: isNewVisitor }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'check_lead_duplicate') {
      // Check if this IP has already submitted a lead
      const { data: existingLeads, error: leadError } = await supabase
        .from('leads')
        .select('id, nome_completo')
        .eq('ip_address', ip);

      if (leadError) {
        console.error('Error checking existing leads:', leadError);
      }

      const isDuplicate = existingLeads && existingLeads.length > 0;

      // Update the current lead with IP and duplicate flag
      if (lead_id && isDuplicate) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({ ip_address: ip, is_duplicate_ip: true })
          .eq('id', lead_id);

        if (updateError) {
          console.error('Error updating lead IP:', updateError);
        }

        // Also mark the previous lead as duplicate
        for (const existingLead of existingLeads || []) {
          await supabase
            .from('leads')
            .update({ is_duplicate_ip: true })
            .eq('id', existingLead.id);
        }
      } else if (lead_id) {
        const { error: updateError } = await supabase
          .from('leads')
          .update({ ip_address: ip })
          .eq('id', lead_id);

        if (updateError) {
          console.error('Error updating lead IP:', updateError);
        }
      }

      return new Response(
        JSON.stringify({ 
          ip, 
          is_duplicate: isDuplicate,
          existing_leads: existingLeads?.map(l => l.nome_completo) || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_ip_only') {
      // Just return the IP address for presence tracking
      return new Response(
        JSON.stringify({ ip }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: just return IP
    return new Response(
      JSON.stringify({ ip }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-client-ip:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
