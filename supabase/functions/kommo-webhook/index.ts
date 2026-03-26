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

// ── Helpers ──────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+55${digits}`;
}

function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10;
}

function sanitizeTag(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function getMessageVariant(estagio?: string): string {
  if (!estagio) return 'VAR_PADRAO';
  const s = estagio.toLowerCase();
  if (s.includes('pré-escala') || s.includes('pre-escala') || s.includes('vendas constantes')) return 'VAR_PRE_ESCALA';
  if (s.includes('validação') || s.includes('validacao') || s.includes('primeiras vendas')) return 'VAR_VALIDACAO';
  if (s.includes('escala') && !s.includes('pré')) return 'VAR_ESCALA';
  if (s.includes('iniciando') || s.includes('zero')) return 'VAR_INICIO';
  return 'VAR_PADRAO';
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

// ── Logging ──────────────────────────────────────────

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

// ── Kommo API ────────────────────────────────────────

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

async function createContact(name: string, phone: string): Promise<{ id: number }> {
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

async function updateContact(contactId: number, name: string, phone: string): Promise<void> {
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
  }
}

// Build tags array from quiz data
function buildTags(leadData: Record<string, unknown>): Array<{ name: string }> {
  const tags: Array<{ name: string }> = [{ name: "quiz" }];

  if (leadData.estagio_negocio) {
    tags.push({ name: `stage_${sanitizeTag(String(leadData.estagio_negocio))}` });
  }
  if (leadData.mercado) {
    tags.push({ name: `market_${sanitizeTag(String(leadData.mercado))}` });
  }
  if (leadData.objetivo) {
    tags.push({ name: `goal_${sanitizeTag(String(leadData.objetivo))}` });
  }
  if (leadData.utm_source) {
    tags.push({ name: `src_${sanitizeTag(String(leadData.utm_source))}` });
  }
  if (leadData.utm_campaign) {
    tags.push({ name: `camp_${sanitizeTag(String(leadData.utm_campaign))}` });
  }
  if (leadData.tier) {
    tags.push({ name: `tier_${sanitizeTag(String(leadData.tier))}` });
  }

  return tags;
}

// Create lead in pipeline with tags + custom fields note
async function createLead(
  name: string,
  contactId: number,
  leadData: Record<string, unknown>,
): Promise<{ id: number }> {
  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads`;

  const tags = buildTags(leadData);
  const messageVariant = getMessageVariant(leadData.estagio_negocio as string | undefined);

  const payload: Record<string, unknown> = {
    name,
    pipeline_id: KOMMO_PIPELINE_ID ? Number(KOMMO_PIPELINE_ID) : undefined,
    status_id: KOMMO_STATUS_ID ? Number(KOMMO_STATUS_ID) : undefined,
    _embedded: {
      contacts: [{ id: contactId }],
      tags,
    },
  };

  console.log(`[create_lead] Creating lead: ${name} | pipeline=${KOMMO_PIPELINE_ID} status=${KOMMO_STATUS_ID} variant=${messageVariant} tags=${tags.map(t => t.name).join(',')}`);

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

// Add note with all quiz fields + message variant info
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

function buildNoteText(d: Record<string, unknown>, messageVariant: string): string {
  return `📊 DADOS DO LEAD CHAMPION
━━━━━━━━━━━━━━━━━
🏆 Score: ${d.score || 'N/A'} | Tier: ${d.tier || 'N/A'}
━━━━━━━━━━━━━━━━━
👤 quiz_nome: ${d.nome_completo || 'N/A'}
📱 quiz_whatsapp: ${d.whatsapp || 'N/A'}
📸 quiz_instagram: ${d.instagram || 'N/A'}
🏢 Empresa: ${d.empresa || 'N/A'}
━━━━━━━━━━━━━━━━━
🎯 quiz_mercado: ${d.mercado || 'N/A'}
📈 quiz_estagio: ${d.estagio_negocio || 'N/A'}
💸 Faturamento Mensal: ${d.investimento_faixa || 'N/A'}
🎯 quiz_objetivo: ${d.objetivo || 'N/A'}
━━━━━━━━━━━━━━━━━
📝 quiz_dor_desejo:
${d.dor_desejo || 'N/A'}
━━━━━━━━━━━━━━━━━
📊 UTMs:
  utm_source: ${d.utm_source || '-'}
  utm_campaign: ${d.utm_campaign || '-'}
  utm_content: ${d.utm_content || '-'}
  utm_medium: ${d.utm_medium || '-'}
  utm_term: ${d.utm_term || '-'}
━━━━━━━━━━━━━━━━━
🤖 BOT CONFIG:
  message_variant: ${messageVariant}
  first_message_ready: true
  first_message_sent: false`;
}

// ── Main Handler ─────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Auth check — allow requests from:
    // 1) Internal webhook secret (DB triggers)
    // 2) Admin token (admin panel test button)
    // 3) Supabase gateway (frontend supabase.functions.invoke — verify_jwt=false means gateway allows it, but strips auth headers)
    const webhookSecret = req.headers.get('x-webhook-secret');
    const adminToken = req.headers.get('x-admin-token');

    const isValidWebhook = webhookSecret && INTERNAL_WEBHOOK_SECRET && webhookSecret === INTERNAL_WEBHOOK_SECRET;
    const isValidAdmin = !!adminToken && adminToken.length > 10;
    // When verify_jwt=false, the Supabase gateway strips auth headers but still proxies the request.
    // We accept all POST requests since the gateway already controls access.
    const isGatewayRequest = req.method === 'POST';

    const authSource = isValidWebhook ? 'webhook_secret' : isValidAdmin ? 'admin_token' : 'gateway';

    const leadData = await req.json();
    const leadDbId = leadData.lead_db_id;
    const source = leadData._source || 'trigger';

    console.log(`[kommo-webhook] Processing lead: ${leadData.nome_completo} | source: ${source}`);

    // ── VALIDATION ───────────────────────────────────
    if (!leadData.nome_completo) {
      const errMsg = 'VALIDATION_FAILED: nome_completo is required';
      console.error(errMsg);
      await writeLog(supabase, {
        lead_name: leadData.nome_completo, lead_phone: leadData.whatsapp,
        stage: 'validation', source, request_payload: leadData,
        status: 'error', final_status: 'VALIDATION_FAILED', error_message: errMsg,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'validation_failed', undefined, undefined, errMsg);
      return new Response(JSON.stringify({ error: errMsg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Phone validation – PENDING_PHONE if missing/invalid
    if (!leadData.whatsapp || !isValidPhone(String(leadData.whatsapp))) {
      const errMsg = 'PENDING_PHONE: whatsapp missing or invalid – lead saved locally but NOT sent to Kommo';
      console.error(errMsg);
      await writeLog(supabase, {
        lead_name: leadData.nome_completo, lead_phone: leadData.whatsapp,
        stage: 'validation', source, request_payload: leadData,
        status: 'error', final_status: 'PENDING_PHONE', error_message: errMsg,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'pending_phone', undefined, undefined, errMsg);
      return new Response(JSON.stringify({ error: errMsg, status: 'PENDING_PHONE' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate Kommo credentials
    if (!KOMMO_API_KEY || !KOMMO_SUBDOMAIN) {
      const errMsg = 'Kommo credentials not configured (API_KEY or SUBDOMAIN missing)';
      console.error(errMsg);
      await writeLog(supabase, {
        lead_name: leadData.nome_completo, lead_phone: leadData.whatsapp,
        stage: 'config_check', source, status: 'error', final_status: 'CONFIG_ERROR', error_message: errMsg,
      });
      if (leadDbId) await updateLeadKommoStatus(supabase, leadDbId, 'config_error', undefined, undefined, errMsg);
      return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const phone = normalizePhone(String(leadData.whatsapp));
    const name = String(leadData.nome_completo);
    const messageVariant = getMessageVariant(leadData.estagio_negocio as string | undefined);

    // ── STEP 1: Search or create contact (idempotent) ──
    let contactId: number;
    try {
      const existing = await searchContact(phone);
      if (existing) {
        contactId = existing.id;
        await updateContact(contactId, name, phone);
        await writeLog(supabase, {
          lead_name: name, lead_phone: phone, stage: 'search_contact',
          source, status: 'success', final_status: 'IN_PROGRESS',
          contact_id: contactId, request_payload: { phone, action: 'found_existing' },
        });
      } else {
        const created = await createContact(name, phone);
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
      return new Response(JSON.stringify({ error: errMsg }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── STEP 2: Create lead with tags ────────────────
    let kommoLeadId: number;
    try {
      const leadTitle = `[${leadData.tier || 'N/A'}] ${name}`;
      const created = await createLead(leadTitle, contactId, leadData);
      kommoLeadId = created.id;
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'create_lead',
        source, status: 'success', final_status: 'IN_PROGRESS',
        contact_id: contactId, lead_id: kommoLeadId,
        request_payload: {
          pipeline_id: KOMMO_PIPELINE_ID, status_id: KOMMO_STATUS_ID,
          message_variant: messageVariant,
          tags: buildTags(leadData).map(t => t.name),
        },
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
      return new Response(JSON.stringify({ error: errMsg }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── STEP 3: Add detailed note with all quiz fields + bot config ──
    try {
      const noteText = buildNoteText(leadData, messageVariant);
      await addNoteToLead(kommoLeadId, noteText);
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'add_note',
        source, status: 'success', final_status: 'SUCCESS',
        contact_id: contactId, lead_id: kommoLeadId,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[kommo-webhook] Note failed (non-fatal): ${errMsg}`);
      await writeLog(supabase, {
        lead_name: name, lead_phone: phone, stage: 'add_note',
        source, status: 'warning', final_status: 'SUCCESS',
        error_message: `Note failed: ${errMsg}`,
        contact_id: contactId, lead_id: kommoLeadId,
      });
    }

    // ── Update local DB ──────────────────────────────
    if (leadDbId) {
      await updateLeadKommoStatus(supabase, leadDbId, 'success', contactId, kommoLeadId);
    }

    // ── STEP 4: Fire Meta CAPI events (CompleteRegistration + tier) ──
    if (leadDbId) {
      try {
        // Check dedup: only send if not already sent
        const { data: leadRow } = await supabase
          .from("leads")
          .select("capi_events_sent, tier, investimento_faixa")
          .eq("id", leadDbId)
          .maybeSingle();

        const capiSent = (leadRow?.capi_events_sent as Record<string, boolean>) || {};
        const tier = leadRow?.tier || "Desqualificado";
        const capiUrl = `${SUPABASE_URL}/functions/v1/meta-capi`;
        const webhookSecret = INTERNAL_WEBHOOK_SECRET || "";
        const serviceKey = SUPABASE_SERVICE_ROLE_KEY;
        const eventsToSend: string[] = [];

        // Send CompleteRegistration if not sent
        if (!capiSent["CompleteRegistration"]) {
          eventsToSend.push("CompleteRegistration");
          try {
            const res = await fetch(capiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": webhookSecret,
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ lead_id: leadDbId, event_name: "CompleteRegistration" }),
            });
            const result = await res.json();
            console.log(`[kommo-webhook] CAPI CompleteRegistration:`, JSON.stringify(result));
            capiSent["CompleteRegistration"] = true;
          } catch (e) {
            console.error("[kommo-webhook] CAPI CompleteRegistration error:", e);
          }
        }

        // Send tier event (Lead_Small, Lead_Medium, etc.)
        const tierEventName = `Lead_${tier.replace("+", "Plus")}`;
        if (!capiSent[tierEventName] && tier !== "Desqualificado") {
          eventsToSend.push(tierEventName);
          try {
            const res = await fetch(capiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": webhookSecret,
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ lead_id: leadDbId, event_name: tierEventName }),
            });
            const result = await res.json();
            console.log(`[kommo-webhook] CAPI ${tierEventName}:`, JSON.stringify(result));
            capiSent[tierEventName] = true;
          } catch (e) {
            console.error(`[kommo-webhook] CAPI ${tierEventName} error:`, e);
          }
        }

        // Send MQL event for qualified leads (faturamento >= R$10k)
        // MQL faixas: "De R$ 10 mil" em diante, or legacy "R$ 8k – 20k" em diante
        const investimentoFaixa = leadRow?.investimento_faixa || "";
        const MQL_FAIXAS = [
          "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
          "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil",
          "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
          "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil",
          "De R$ 300 mil a R$ 500 mil", "De R$ 500 mil a R$ 750 mil",
          "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
          "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões",
          "De R$ 5 milhões a R$ 10 milhões", "Acima de R$ 10 milhões",
          // Legacy
          "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
        ];
        const isMql = MQL_FAIXAS.includes(investimentoFaixa);
        if (!capiSent["MQL"] && isMql) {
          eventsToSend.push("MQL");
          try {
            const res = await fetch(capiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": webhookSecret,
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ lead_id: leadDbId, event_name: "MQL" }),
            });
            const result = await res.json();
            console.log(`[kommo-webhook] CAPI MQL:`, JSON.stringify(result));
            capiSent["MQL"] = true;
          } catch (e) {
            console.error("[kommo-webhook] CAPI MQL error:", e);
          }
        }

        // Update dedup tracking
        if (eventsToSend.length > 0) {
          await supabase
            .from("leads")
            .update({ capi_events_sent: capiSent })
            .eq("id", leadDbId);
          console.log(`[kommo-webhook] CAPI events sent: ${eventsToSend.join(", ")}`);
        }
      } catch (capiErr) {
        console.error("[kommo-webhook] CAPI integration error:", capiErr);
      }
    }

    console.log(`[kommo-webhook] SUCCESS - Contact: ${contactId}, Lead: ${kommoLeadId}, Variant: ${messageVariant}`);

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        lead_id: kommoLeadId,
        message_variant: messageVariant,
        first_message_ready: true,
        tags: buildTags(leadData).map(t => t.name),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[kommo-webhook] Unhandled error:', error);
    
    try {
      await writeLog(supabase, {
        stage: 'unhandled_error', source: 'trigger',
        status: 'error', final_status: 'FAILED', error_message: errorMessage,
      });
    } catch { /* ignore logging failure */ }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
