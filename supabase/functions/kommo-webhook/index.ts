import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTERNAL_WEBHOOK_SECRET = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

const KOMMO_API_KEY = Deno.env.get('KOMMO_API_KEY');
const KOMMO_SUBDOMAIN_RAW = Deno.env.get('KOMMO_SUBDOMAIN') || '';
const KOMMO_SUBDOMAIN = KOMMO_SUBDOMAIN_RAW
  .replace(/^https?:\/\//, '')
  .replace(/\.kommo\.com.*$/, '')
  .trim();
const KOMMO_PIPELINE_ID = Deno.env.get('KOMMO_PIPELINE_ID');
const KOMMO_STATUS_ID = Deno.env.get('KOMMO_STATUS_ID_NEW_LEAD');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+55${digits}`;
}

function maskSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    if (obj.length > 20 && /^(ey|Bearer\s)/i.test(obj)) return '***MASKED***';
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(maskSecrets);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (/token|secret|key|password|authorization/i.test(k)) {
        result[k] = '***MASKED***';
      } else {
        result[k] = maskSecrets(v);
      }
    }
    return result;
  }
  return obj;
}

interface LogEntry {
  lead_db_id?: string;
  lead_name?: string;
  lead_phone?: string;
  stage: string;
  source: string;
  request_payload?: unknown;
  response_payload?: unknown;
  status: string;
  final_status: string;
  error_message?: string;
  retry_count?: number;
  contact_id?: number;
  lead_id?: number;
  external_key?: string;
}

async function writeLog(supabase: ReturnType<typeof createClient>, entry: LogEntry) {
  try {
    await supabase.from('kommo_webhook_logs').insert({
      lead_phone: entry.lead_phone,
      lead_name: entry.lead_name,
      stage: entry.stage,
      source: entry.source,
      request_payload: maskSecrets(entry.request_payload) as Record<string, unknown>,
      response_payload: maskSecrets(entry.response_payload) as Record<string, unknown>,
      status: entry.status,
      final_status: entry.final_status,
      error_message: entry.error_message,
      retry_count: entry.retry_count || 0,
      contact_id: entry.contact_id,
      lead_id: entry.lead_id,
      external_key: entry.external_key,
    });
  } catch (e) {
    console.error('Failed to write log:', e);
  }
}

async function updateLeadKommoStatus(
  supabase: ReturnType<typeof createClient>,
  leadDbId: string,
  status: string,
  contactId?: number,
  leadId?: number,
  error?: string,
  retryCount?: number,
) {
  const update: Record<string, unknown> = { kommo_status: status };
  if (contactId) update.kommo_contact_id = contactId;
  if (leadId) update.kommo_lead_id = leadId;
  if (error) update.last_kommo_error = error;
  if (retryCount !== undefined) update.kommo_retry_count = retryCount;
  if (status === 'success') update.kommo_synced_at = new Date().toISOString();

  await supabase.from('leads').update(update).eq('id', leadDbId);
}

// Search contact by phone
async function searchContact(phone: string): Promise<{ id: number } | null> {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts?query=${encodeURIComponent(phone)}&limit=1`;
  console.log(`[search_contact] Searching: ${phone}`);
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${KOMMO_API_KEY}` },
  });

  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search contact failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const contacts = data?._embedded?.contacts;
  if (contacts && contacts.length > 0) {
    console.log(`[search_contact] Found existing contact: ${contacts[0].id}`);
    return { id: contacts[0].id };
  }
  return null;
}

// Create new contact
async function createContact(name: string, phone: string, instagram?: string): Promise<{ id: number }> {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts`;
  
  const customFields = [
    { field_code: "PHONE", values: [{ value: phone, enum_code: "WORK" }] },
  ];

  const payload = [{ name, custom_fields_values: customFields }];
  console.log(`[create_contact] Creating contact: ${name} / ${phone}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Contact creation failed (${res.status}): ${text}`);

  const data = JSON.parse(text);
  const contactId = data?._embedded?.contacts?.[0]?.id;
  if (!contactId) throw new Error(`No contact ID in response: ${text}`);
  
  console.log(`[create_contact] Created contact: ${contactId}`);
  return { id: contactId };
}

// Update existing contact
async function updateContact(contactId: number, name: string, phone: string, instagram?: string): Promise<void> {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/contacts/${contactId}`;
  
  const customFields = [
    { field_code: "PHONE", values: [{ value: phone, enum_code: "WORK" }] },
  ];

  const payload = { name, custom_fields_values: customFields };
  console.log(`[update_contact] Updating contact ${contactId}`);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`[update_contact] Update failed (${res.status}): ${text}`);
    // Non-fatal, contact already exists
  }
}

// Create lead in pipeline
async function createLead(
  name: string,
  contactId: number,
  leadData: Record<string, unknown>,
): Promise<{ id: number }> {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads`;

  const tags = [
    { name: "Champion Form" },
  ];
  if (leadData.mercado) tags.push({ name: String(leadData.mercado) });
  if (leadData.estagio_negocio) tags.push({ name: String(leadData.estagio_negocio) });
  if (leadData.tier) tags.push({ name: `Tier ${leadData.tier}` });

  const payload: Record<string, unknown> = {
    name,
    pipeline_id: KOMMO_PIPELINE_ID ? Number(KOMMO_PIPELINE_ID) : undefined,
    status_id: KOMMO_STATUS_ID ? Number(KOMMO_STATUS_ID) : undefined,
    _embedded: {
      contacts: [{ id: contactId }],
      tags,
    },
  };

  console.log(`[create_lead] Creating lead: ${name} in pipeline ${KOMMO_PIPELINE_ID} status ${KOMMO_STATUS_ID}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([payload]),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Lead creation failed (${res.status}): ${text}`);

  const data = JSON.parse(text);
  const leadId = data?._embedded?.leads?.[0]?.id;
  if (!leadId) throw new Error(`No lead ID in response: ${text}`);

  console.log(`[create_lead] Created lead: ${leadId}`);
  return { id: leadId };
}

// Add note to lead
async function addNoteToLead(leadId: number, noteText: string): Promise<void> {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/${leadId}/notes`;
  const payload = [{ note_type: "common", params: { text: noteText } }];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`[add_note] Note failed (${res.status}): ${text}`);
  } else {
    console.log(`[add_note] Note added to lead ${leadId}`);
  }
}

function buildNoteText(d: Record<string, unknown>): string {
  return `📊 DADOS DO LEAD CHAMPION
━━━━━━━━━━━━━━━━━
🏆 Score: ${d.score || 'N/A'} | Tier: ${d.tier || 'N/A'}
━━━━━━━━━━━━━━━━━
👤 Nome: ${d.nome_completo || 'N/A'}
📱 WhatsApp: ${d.whatsapp || 'N/A'}
📸 Instagram: ${d.instagram || 'N/A'}
🏢 Empresa: ${d.empresa || 'N/A'}
━━━━━━━━━━━━━━━━━
🎯 Mercado: ${d.mercado || 'N/A'}
📈 Estágio: ${d.estagio_negocio || 'N/A'}
💸 Investimento em Tráfego: ${d.investimento_faixa || 'N/A'}
━━━━━━━━━━━━━━━━━
📝 Dor/Desejo:
${d.dor_desejo || 'N/A'}
━━━━━━━━━━━━━━━━━
📊 UTMs: src=${d.utm_source || '-'} | camp=${d.utm_campaign || '-'} | content=${d.utm_content || '-'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Auth: webhook secret OR admin token OR service role bearer
    const webhookSecret = req.headers.get('x-webhook-secret');
    const adminToken = req.headers.get('x-admin-token');
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const isValidWebhook = webhookSecret && INTERNAL_WEBHOOK_SECRET && webhookSecret === INTERNAL_WEBHOOK_SECRET;
    const isValidAdmin = !!adminToken && adminToken.length > 10;
    const isValidBearer = bearerToken === SUPABASE_SERVICE_ROLE_KEY;

    if (!isValidWebhook && !isValidAdmin && !isValidBearer) {
      console.error('Unauthorized request');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const leadData = await req.json();
    const leadDbId = leadData.lead_db_id;
    const source = leadData._source || 'trigger';

    console.log(`[kommo-webhook] Processing lead: ${leadData.nome_completo} | source: ${source}`);

    // Validate required fields
    if (!leadData.nome_completo || !leadData.whatsapp) {
      const errMsg = 'VALIDATION_FAILED: nome_completo and whatsapp are required';
      console.error(errMsg);
      await writeLog(supabase, {
        lead_db_id: leadDbId,
        lead_name: leadData.nome_completo,
        lead_phone: leadData.whatsapp,
        stage: 'validation',
        source,
        request_payload: leadData,
        status: 'error',
        final_status: 'VALIDATION_FAILED',
        error_message: errMsg,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'validation_failed', undefined, undefined, errMsg);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Kommo credentials
    if (!KOMMO_API_KEY || !KOMMO_SUBDOMAIN) {
      const errMsg = 'Kommo credentials not configured (API_KEY or SUBDOMAIN missing)';
      console.error(errMsg);
      await writeLog(supabase, {
        lead_db_id: leadDbId,
        lead_name: leadData.nome_completo,
        lead_phone: leadData.whatsapp,
        stage: 'config_check',
        source,
        status: 'error',
        final_status: 'CONFIG_ERROR',
        error_message: errMsg,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'config_error', undefined, undefined, errMsg);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const phone = normalizePhone(String(leadData.whatsapp));
    const name = String(leadData.nome_completo);

    // STEP 1: Search or create contact
    let contactId: number;
    try {
      const existing = await searchContact(phone);
      if (existing) {
        contactId = existing.id;
        await updateContact(contactId, name, phone, leadData.instagram);
        await writeLog(supabase, {
          lead_name: name, lead_phone: phone, stage: 'search_contact',
          source, status: 'success', final_status: 'IN_PROGRESS',
          contact_id: contactId, request_payload: { phone, action: 'found_existing' },
        });
      } else {
        const created = await createContact(name, phone, leadData.instagram);
        contactId = created.id;
        await writeLog(supabase, {
          lead_name: name, lead_phone: phone, stage: 'create_contact',
          source, status: 'success', final_status: 'IN_PROGRESS',
          contact_id: contactId, request_payload: { phone, action: 'created_new' },
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kommo-webhook] Contact step failed: ${errMsg}`);
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'create_contact',
        source, status: 'error', final_status: 'FAILED',
        error_message: errMsg, request_payload: leadData,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'failed', undefined, undefined, errMsg);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 2: Create lead in pipeline
    let kommoLeadId: number;
    try {
      const leadTitle = `[${leadData.tier || 'N/A'}] ${name}`;
      const created = await createLead(leadTitle, contactId, leadData);
      kommoLeadId = created.id;
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'create_lead',
        source, status: 'success', final_status: 'IN_PROGRESS',
        contact_id: contactId, lead_id: kommoLeadId,
        request_payload: { pipeline_id: KOMMO_PIPELINE_ID, status_id: KOMMO_STATUS_ID },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[kommo-webhook] Lead creation failed: ${errMsg}`);
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'create_lead',
        source, status: 'error', final_status: 'FAILED',
        error_message: errMsg, contact_id: contactId,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'failed', contactId, undefined, errMsg);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 3: Add note to lead
    try {
      const noteText = buildNoteText(leadData);
      await addNoteToLead(kommoLeadId, noteText);
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'add_note',
        source, status: 'success', final_status: 'SUCCESS',
        contact_id: contactId, lead_id: kommoLeadId,
      });
    } catch (err) {
      // Note failure is non-fatal
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[kommo-webhook] Note failed (non-fatal): ${errMsg}`);
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'add_note',
        source, status: 'warning', final_status: 'SUCCESS',
        error_message: `Note failed: ${errMsg}`,
        contact_id: contactId, lead_id: kommoLeadId,
      });
    }

    // Update lead in DB
    if (leadDbId) {
      await updateLeadKommoStatus(supabase, leadDbId, 'success', contactId, kommoLeadId);
    }

    console.log(`[kommo-webhook] SUCCESS - Contact: ${contactId}, Lead: ${kommoLeadId}`);

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        lead_id: kommoLeadId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[kommo-webhook] Unhandled error:', error);
    
    try {
      await writeLog(supabase, {
        stage: 'unhandled_error',
        source: 'trigger',
        status: 'error',
        final_status: 'FAILED',
        error_message: errorMessage,
      });
    } catch { /* ignore logging failure */ }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
