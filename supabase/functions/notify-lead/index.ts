import { createClient } from "jsr:@supabase/supabase-js@2";

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
const DARA_WHATSAPP_E164 = Deno.env.get('DARA_WHATSAPP_E164');
const CAIO_WHATSAPP_E164 = Deno.env.get('CAIO_WHATSAPP_E164');
const WHATSAPP_TEMPLATE_NAME = Deno.env.get('WHATSAPP_TEMPLATE_NAME');
const WHATSAPP_TEMPLATE_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') || 'pt_BR';

// WAHA (auto-message to MQL leads)
const WAHA_API_URL = Deno.env.get('WAHA_API_URL');
const WAHA_API_KEY = Deno.env.get('WAHA_API_KEY');
const WAHA_PHONE_NUMBER_ID = Deno.env.get('WAHA_PHONE_NUMBER_ID') || 'default';

// SDR routing: All >= 5k → Caio, rest → Dara (Rodger removido)
const SDR_CAIO_FATURAMENTO = [
  "De R$ 5 mil a R$ 10 mil", "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];

function getSdrForLead(investimentoFaixa?: string | null): { name: string; phone: string } {
  if (investimentoFaixa && SDR_CAIO_FATURAMENTO.includes(investimentoFaixa)) {
    return { name: "Caio", phone: CAIO_WHATSAPP_E164 || "" };
  }
  return { name: "Dara", phone: DARA_WHATSAPP_E164 || "" };
}

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

  const formSentAt = Math.floor(Date.now() / 1000);
  
  const payload = [
    {
      source_uid: "quiz_champion",
      source_name: "Quiz Champion",
      created_at: formSentAt,
      metadata: {
        form_id: "champion_quiz",
        form_name: "Quiz Champion",
        form_page: PUBLIC_BASE_URL,
        form_sent_at: formSentAt,
        ip: lead.ip_address || null,
        referer: lead.referrer || PUBLIC_BASE_URL
      },
      _embedded: {
        contacts: [
          {
            name: String(leadName),
            custom_fields_values: [
              { field_code: "PHONE", values: [{ value: String(whatsapp) }] }
            ]
          }
        ],
        leads: [
          {
            name: `Lead Quiz - ${leadName || whatsapp}`,
            _embedded: {
              tags: [
                { name: "Quiz Champion" }
              ]
            }
          }
        ]
      },
      request_id: `quiz_${Date.now()}`
    }
  ];
  
  // Build a note with all the extra info
  const noteText = `📋 Dados do Quiz Champion

👤 Nome: ${leadName}
📲 WhatsApp: ${whatsapp}
📸 Instagram: ${instagram}
📌 Mercado: ${market}
🏁 Estágio: ${stage}
🧲 Botão de entrada: ${entryButton}
📖 Abriu quiz: ${quizOpened ? 'Sim' : 'Não'}
🛑 Onde parou: ${lastStep}`;
  
  console.log('Note for lead:', noteText);

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

// Send WhatsApp message to the assigned SDR (Rodger or Dara)
async function sendWhatsAppToSdr(lead: Record<string, unknown>, sessionId: string, sdr: { name: string; phone: string }): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !sdr.phone) {
    console.log('WhatsApp credentials not configured or SDR phone missing');
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
      to: sdr.phone,
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
      to: sdr.phone,
      type: "text",
      text: { preview_url: false, body: resumo }
    };
  }

  console.log(`Sending WhatsApp message to ${sdr.name}:`, sdr.phone);

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

// Send auto-message to MQL lead via WAHA
async function sendWahaAutoMessage(
  leadWhatsapp: string,
  leadName: string
): Promise<{ success: boolean; error?: string }> {
  if (!WAHA_API_URL) {
    console.log('WAHA not configured, skipping auto-message to lead');
    return { success: false, error: 'WAHA not configured' };
  }

  // Format phone: ensure it starts with country code, remove non-digits
  let phone = leadWhatsapp.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '55' + phone.substring(1);
  if (!phone.startsWith('55')) phone = '55' + phone;

  const message = `Opaa ${leadName}, tudo bem? Entrei em contato referente ao cadastro que você fez no nosso site, vim falar que bem em breve ja vamos entrar em contato com você!😄`;

  const wahaUrl = `${WAHA_API_URL.replace(/\/$/, '')}/api/sendText`;

  console.log(`[WAHA] Sending auto-message to MQL lead: ${phone}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const response = await fetch(wahaUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session: WAHA_PHONE_NUMBER_ID,
      chatId: `${phone}@c.us`,
      text: message,
    }),
  });

  const responseText = await response.text();
  console.log('[WAHA] Response:', response.status, responseText);

  if (!response.ok) {
    return { success: false, error: `WAHA error ${response.status}: ${responseText}` };
  }

  return { success: true };
}

Deno.serve(async (req: Request) => {
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

    const { sessionId, leadId, force, investimento_faixa } = await req.json();
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

    // Look up the lead's investimento_faixa to determine SDR
    let leadInvestimentoFaixa: string | null = investimento_faixa || null;
    let leadTierFromDb: string | null = null;
    if (!leadInvestimentoFaixa && (session.lead_whatsapp || session.lead_name)) {
      // Try whatsapp first, then nome_completo — avoid .or() with special chars
      let leadRow: { investimento_faixa: string | null; tier: string | null } | null = null;
      if (session.lead_whatsapp) {
        const { data } = await supabase
          .from('leads')
          .select('investimento_faixa, tier')
          .eq('whatsapp', session.lead_whatsapp)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        leadRow = data;
      }
      if (!leadRow && session.lead_name) {
        const { data } = await supabase
          .from('leads')
          .select('investimento_faixa, tier')
          .eq('nome_completo', session.lead_name)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        leadRow = data;
      }
      if (leadRow) {
        leadInvestimentoFaixa = leadRow.investimento_faixa;
        leadTierFromDb = leadRow.tier;
      }
    }

    const leadTier = leadTierFromDb || session.lead_stage || 'N/A';
    const sdr = getSdrForLead(leadInvestimentoFaixa);
    console.log(`SDR assigned: ${sdr.name} (faturamento: ${leadInvestimentoFaixa || 'N/A'}, tier: ${leadTier})`);

    // Kommo sync is now handled by DB trigger on leads table INSERT
    // (notify_kommo_on_lead_insert → kommo-webhook)
    const kommoSuccess = true; // Skip, handled elsewhere

    // 2. Send WhatsApp to assigned SDR
    let whatsappSuccess = false;
    let messageId: string | undefined;
    try {
      const waResult = await withRetry(() => sendWhatsAppToSdr(session, targetId, sdr));
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

    // 3. Send auto-message to MQL lead via WAHA (MQL = faturamento >= 10k, now handled by Caio)
    let wahaSuccess = false;
    const isPixelMqlEligible = [
      'De R$ 10 mil a R$ 20 mil',
      'De R$ 20 mil a R$ 30 mil',
      'De R$ 30 mil a R$ 50 mil',
      'De R$ 50 mil a R$ 75 mil',
      'De R$ 75 mil a R$ 100 mil',
      'De R$ 100 mil a R$ 150 mil',
      'De R$ 150 mil a R$ 200 mil',
      'De R$ 200 mil a R$ 300 mil',
      'De R$ 300 mil a R$ 500 mil',
      'De R$ 500 mil a R$ 750 mil',
      'De R$ 750 mil a R$ 1 milhão',
      'De R$ 1 milhão a R$ 2 milhões',
      'De R$ 2 milhões a R$ 3 milhões',
      'De R$ 3 milhões a R$ 5 milhões',
      'De R$ 5 milhões a R$ 10 milhões',
      'Acima de R$ 10 milhões',
    ].includes(leadInvestimentoFaixa || '');

    if (sdr.name === 'Caio' && isPixelMqlEligible && session.lead_whatsapp && session.lead_name) {
      try {
        const wahaResult = await withRetry(() =>
          sendWahaAutoMessage(session.lead_whatsapp, session.lead_name)
        );
        wahaSuccess = wahaResult.success;
        if (!wahaSuccess && wahaResult.error) {
          errors.push(`WAHA: ${wahaResult.error}`);
        }
        console.log(`[WAHA] Auto-message to MQL lead: ${wahaSuccess ? 'OK' : 'FAILED'}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`WAHA: ${msg}`);
        console.error('WAHA auto-message failed:', msg);
      }
    }
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

    // Determine if this lead is MQL (faturamento >= R$ 10k) for distinct push styling
    const isMqlForPush = isPixelMqlEligible;
    const pushTitle = isMqlForPush ? '🏆 Novo MQL Caiu!' : '🚀 Novo Lead Caiu!';
    const pushHeading = isMqlForPush ? '🏆 Novo MQL!' : '🚀 Novo Lead!';

    // 3. Send Web Push notification (non-blocking)
    let webPushSuccess = false;
    try {
      const pushPayload = {
        title: pushTitle,
        body: `Tier: ${leadTier} | SDR: ${sdr.name}`,
        url: `/${ADMIN_ROUTE_SLUG}?highlight=${targetId}`,
      };

      const pushResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/web-push/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(pushPayload),
        }
      );

      const pushResult = await pushResponse.json();
      webPushSuccess = pushResult.success && (pushResult.sent > 0);
      console.log('Web Push result:', JSON.stringify(pushResult));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Web Push failed (non-critical):', msg);
    }

    // 4. Send OneSignal push notification (non-blocking)
    let oneSignalSuccess = false;
    try {
      const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
      if (oneSignalApiKey) {
        const leadName = session.lead_name || 'Desconhecido';
        const osResponse = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Key ${oneSignalApiKey}`,
          },
          body: JSON.stringify({
            app_id: '2ba7eef1-4bc9-47dd-83fc-745bb1548799',
            included_segments: ['All'],
            headings: { en: pushHeading },
            contents: { en: `Nome: ${leadName} - Tier: ${leadTier} SDR: ${sdr.name}` },
            url: `/${ADMIN_ROUTE_SLUG}?highlight=${targetId}`,
          }),
        });
        const osResult = await osResponse.json();
        oneSignalSuccess = osResponse.ok;
        console.log('OneSignal result:', JSON.stringify(osResult));
      } else {
        console.log('ONESIGNAL_REST_API_KEY not configured, skipping');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('OneSignal push failed (non-critical):', msg);
    }

    console.log('Notification complete - Kommo:', kommoSuccess, 'WhatsApp:', whatsappSuccess, 'WebPush:', webPushSuccess, 'OneSignal:', oneSignalSuccess, 'WAHA:', wahaSuccess);

    return new Response(
      JSON.stringify({
        success: true,
        kommo: kommoSuccess,
        whatsapp: whatsappSuccess,
        webPush: webPushSuccess,
        oneSignal: oneSignalSuccess,
        wahaAutoMessage: wahaSuccess,
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
