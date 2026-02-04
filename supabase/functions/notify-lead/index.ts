import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LEAD_NOTIFY_SECRET = Deno.env.get('LEAD_NOTIFY_SECRET');
const INTERNAL_WEBHOOK_SECRET = Deno.env.get('INTERNAL_WEBHOOK_SECRET');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

// Kommo
const KOMMO_API_KEY = Deno.env.get('KOMMO_API_KEY');
const KOMMO_SUBDOMAIN_RAW = Deno.env.get('KOMMO_SUBDOMAIN') || '';
const KOMMO_SUBDOMAIN = KOMMO_SUBDOMAIN_RAW
  .replace(/^https?:\/\//, '')
  .replace(/\.kommo\.com.*$/, '')
  .trim();

// WhatsApp
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const RODGER_WHATSAPP_E164 = Deno.env.get('RODGER_WHATSAPP_E164');
const WHATSAPP_TEMPLATE_NAME = Deno.env.get('WHATSAPP_TEMPLATE_NAME');
const WHATSAPP_TEMPLATE_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'pt_BR';

// URLs
const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_BASE_URL') || 'https://formulariochampion.lovable.app';
const ADMIN_ROUTE_SLUG = Deno.env.get('VITE_ADMIN_ROUTE_SLUG') || 'champion-analytics-admin-9f3c';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lead-secret, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 2,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`Attempt ${attempt} failed: ${lastError.message}`);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Sync lead to Kommo
async function syncToKommo(lead: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  if (!KOMMO_API_KEY || !KOMMO_SUBDOMAIN) {
    console.log('Kommo credentials not configured, skipping sync');
    return { success: false, error: 'Kommo not configured' };
  }

  const kommoUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/unsorted/forms`;
  
  const leadName = lead.lead_name || lead.nome_completo || 'Lead Quiz';
  const whatsapp = lead.lead_whatsapp || lead.whatsapp || '';
  const instagram = lead.lead_instagram || lead.instagram || '';
  const market = lead.lead_market || lead.mercado || '';
  const stage = lead.lead_stage || lead.estagio_negocio || '';
  const entryButton = lead.start_button_id || '';
  const lastStep = lead.current_step_id || 'Concluiu';
  const quizOpened = lead.entered_quiz_page || false;

  const payload = [
    {
      source_uid: "quiz_champion",
      source_name: "Quiz Champion",
      metadata: {
        form_id: "champion_quiz",
        form_name: "Quiz Champion",
        form_page: PUBLIC_BASE_URL,
        ip: lead.ip_address || null
      },
      contacts: [
        {
          name: String(leadName),
          custom_fields_values: [
            { field_code: "PHONE", values: [{ value: String(whatsapp) }] },
            { field_code: "EMAIL", values: [{ value: "" }] }
          ]
        }
      ],
      leads: [
        {
          name: `Lead Quiz - ${leadName || whatsapp}`,
          custom_fields_values: [
            { field_name: "Instagram", values: [{ value: String(instagram) }] },
            { field_name: "Mercado", values: [{ value: String(market) }] },
            { field_name: "Estágio", values: [{ value: String(stage) }] },
            { field_name: "Botão de entrada", values: [{ value: String(entryButton) }] },
            { field_name: "Abandono/Última etapa", values: [{ value: String(lastStep) }] },
            { field_name: "Abriu quiz?", values: [{ value: String(!!quizOpened) }] }
          ]
        }
      ]
    }
  ];

  console.log('Sending to Kommo unsorted/forms:', JSON.stringify(payload, null, 2));

  const response = await fetch(kommoUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log('Kommo response:', response.status, responseText);

  if (!response.ok) {
    return { success: false, error: `Kommo error ${response.status}: ${responseText}` };
  }

  return { success: true };
}

// Send WhatsApp message to Rodger
async function sendWhatsAppToRodger(lead: Record<string, unknown>, sessionId: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !RODGER_WHATSAPP_E164) {
    console.log('WhatsApp credentials not configured');
    return { success: false, error: 'WhatsApp not configured' };
  }

  const leadName = lead.lead_name || lead.nome_completo || '-';
  const whatsapp = lead.lead_whatsapp || lead.whatsapp || '-';
  const instagram = lead.lead_instagram || lead.instagram || '-';
  const market = lead.lead_market || lead.mercado || '-';
  const stage = lead.lead_stage || lead.estagio_negocio || '-';
  const entryButton = lead.start_button_id || '-';
  const lastStep = lead.current_step_id || 'Concluiu';
  const quizOpened = lead.entered_quiz_page ? 'Sim' : 'Não';
  const adminUrl = `${PUBLIC_BASE_URL}/${ADMIN_ROUTE_SLUG}?sid=${sessionId}`;

  const whatsappUrl = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  let body: Record<string, unknown>;

  if (WHATSAPP_TEMPLATE_NAME) {
    body = {
      messaging_product: "whatsapp",
      to: RODGER_WHATSAPP_E164,
      type: "template",
      template: {
        name: WHATSAPP_TEMPLATE_NAME,
        language: { code: WHATSAPP_TEMPLATE_LANG },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(leadName) },
              { type: "text", text: String(whatsapp) },
              { type: "text", text: String(instagram) },
              { type: "text", text: String(market) },
              { type: "text", text: String(stage) },
              { type: "text", text: String(entryButton) },
              { type: "text", text: quizOpened },
              { type: "text", text: String(lastStep) },
              { type: "text", text: adminUrl }
            ]
          }
        ]
      }
    };
  } else {
    const resumo = `🚨 Novo Lead — Champion

👤 Nome: ${leadName}
📲 WhatsApp: ${whatsapp}
📸 Instagram: ${instagram}
📌 Mercado: ${market}
🏁 Estágio: ${stage}
🧲 Botão: ${entryButton}
📖 Abriu quiz: ${quizOpened}
🛑 Onde parou: ${lastStep}

🔐 Admin: ${adminUrl}`;

    body = {
      messaging_product: "whatsapp",
      to: RODGER_WHATSAPP_E164,
      type: "text",
      text: { preview_url: false, body: resumo }
    };
  }

  console.log('Sending WhatsApp message to Rodger:', RODGER_WHATSAPP_E164);

  const response = await fetch(whatsappUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  console.log('WhatsApp response:', response.status, responseText);

  if (!response.ok) {
    return { success: false, error: `WhatsApp error ${response.status}: ${responseText}` };
  }

  try {
    const data = JSON.parse(responseText);
    const messageId = data.messages?.[0]?.id || null;
    return { success: true, messageId };
  } catch {
    return { success: true };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const leadSecret = req.headers.get('x-lead-secret');
    const webhookSecret = req.headers.get('x-webhook-secret');
    const apiKey = req.headers.get('apikey');
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    const isValidLeadSecret = leadSecret && LEAD_NOTIFY_SECRET && leadSecret === LEAD_NOTIFY_SECRET;
    const isValidWebhookSecret = webhookSecret && INTERNAL_WEBHOOK_SECRET && webhookSecret === INTERNAL_WEBHOOK_SECRET;
    const isValidApiKey = apiKey && SUPABASE_ANON_KEY && apiKey === SUPABASE_ANON_KEY;
    const isValidBearerToken = bearerToken && bearerToken.length > 20;
    
    if (!isValidLeadSecret && !isValidWebhookSecret && !isValidApiKey && !isValidBearerToken) {
      console.error('Invalid or missing authentication');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authMethod = isValidLeadSecret ? 'lead-secret' : isValidWebhookSecret ? 'webhook-secret' : isValidApiKey ? 'apikey' : 'bearer';
    console.log('Auth successful via:', authMethod);

    const { sessionId, leadId, force } = await req.json();
    const targetId = sessionId || leadId;

    if (!targetId) {
      return new Response(
        JSON.stringify({ error: 'sessionId or leadId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: session, error: fetchError } = await supabase
      .from('lead_sessions')
      .select('*')
      .eq('id', targetId)
      .single();

    if (fetchError || !session) {
      console.error('Lead session not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Lead session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found session:', session.id, 'completed:', session.completed, 'notified:', session.rodger_whatsapp_notified);

    if (!session.completed && !force) {
      console.log('Session not completed yet, skipping');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Session not completed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.rodger_whatsapp_notified && !force) {
      console.log('Already notified, skipping');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Already notified' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const errors: string[] = [];

    // 1. Sync to Kommo
    let kommoSuccess = false;
    try {
      const kommoResult = await withRetry(() => syncToKommo(session));
      kommoSuccess = kommoResult.success;
      if (!kommoSuccess && kommoResult.error) {
        errors.push(`Kommo: ${kommoResult.error}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Kommo: ${msg}`);
      console.error('Kommo sync failed:', msg);
    }

    // 2. Send WhatsApp to Rodger
    let whatsappSuccess = false;
    let messageId: string | undefined;
    try {
      const waResult = await withRetry(() => sendWhatsAppToRodger(session, targetId));
      whatsappSuccess = waResult.success;
      messageId = waResult.messageId;
      if (!whatsappSuccess && waResult.error) {
        errors.push(`WhatsApp: ${waResult.error}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`WhatsApp: ${msg}`);
      console.error('WhatsApp send failed:', msg);
    }

    // Update session with results
    const updatePayload: Record<string, unknown> = {};
    
    if (whatsappSuccess) {
      updatePayload.rodger_whatsapp_notified = true;
      updatePayload.rodger_whatsapp_notified_at = new Date().toISOString();
      if (messageId) {
        updatePayload.rodger_whatsapp_message_id = messageId;
      }
      updatePayload.rodger_whatsapp_last_error = null;
    } else if (errors.length > 0) {
      updatePayload.rodger_whatsapp_last_error = errors.join('; ');
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from('lead_sessions')
        .update(updatePayload)
        .eq('id', targetId);

      if (updateError) {
        console.error('Failed to update session:', updateError);
      }
    }

    console.log('Notification complete - Kommo:', kommoSuccess, 'WhatsApp:', whatsappSuccess);

    return new Response(
      JSON.stringify({
        success: true,
        kommo: kommoSuccess,
        whatsapp: whatsappSuccess,
        messageId,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in notify-lead function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
