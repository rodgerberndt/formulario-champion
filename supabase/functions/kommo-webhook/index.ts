import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const kommoApiKey = Deno.env.get('KOMMO_API_KEY');
const kommoSubdomainRaw = Deno.env.get('KOMMO_SUBDOMAIN') || '';
const internalWebhookSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

// Extract just the subdomain if full URL was provided
const kommoSubdomain = kommoSubdomainRaw
  .replace(/^https?:\/\//, '')
  .replace(/\.kommo\.com.*$/, '')
  .trim();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate internal webhook secret (for calls from DB triggers or internal services)
    const webhookSecret = req.headers.get('x-webhook-secret');
    
    if (!webhookSecret || webhookSecret !== internalWebhookSecret) {
      console.error('Invalid or missing webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Webhook authentication successful');

    const leadData = await req.json();
    
    console.log('Received lead data:', leadData);
    console.log('Kommo subdomain:', kommoSubdomain);

    if (!kommoApiKey || !kommoSubdomain) {
      console.error('Missing Kommo credentials');
      return new Response(
        JSON.stringify({ error: 'Kommo credentials not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create lead in Kommo (amoCRM)
    const kommoUrl = `https://${kommoSubdomain}.kommo.com/api/v4/leads/complex`;
    
    // Build note text with all available data
    const noteText = `📊 DADOS DO LEAD CHAMPION
━━━━━━━━━━━━━━━━━
🏆 Score: ${leadData.score || 'N/A'} | Tier: ${leadData.tier || 'N/A'}
━━━━━━━━━━━━━━━━━
👤 Nome: ${leadData.nome_completo}
📱 WhatsApp: ${leadData.whatsapp}
📧 Email: ${leadData.email || 'N/A'}
📸 Instagram: ${leadData.instagram}
🏢 Empresa: ${leadData.empresa || 'N/A'}
━━━━━━━━━━━━━━━━━
📊 Segmento: ${leadData.segmento || 'N/A'}
🎯 Mercado: ${leadData.mercado}
📈 Estágio: ${leadData.estagio_negocio}
💸 Investimento em Tráfego: ${leadData.investimento_faixa || 'N/A'}
👑 Decisor: ${leadData.decisor ? 'Sim' : 'Não'}
━━━━━━━━━━━━━━━━━
💰 Faturamento: ${leadData.faturamento_faixa || 'N/A'}
📢 Tráfego: ${leadData.trafego_faixa || 'N/A'}
🚧 Gargalo: ${leadData.gargalo || 'N/A'}
⏰ Timing: ${leadData.timing || 'N/A'}
💵 Orçamento: ${leadData.orcamento_faixa || 'N/A'}
━━━━━━━━━━━━━━━━━
📝 Dor/Desejo:
${leadData.dor_desejo}`;

    // Build tags array
    const tags = [
      { name: leadData.mercado },
      { name: leadData.estagio_negocio },
      { name: "Champion Form" }
    ];
    
    // Add tier tag if available
    if (leadData.tier) {
      tags.push({ name: `Tier ${leadData.tier}` });
    }

    const kommoPayload = [
      {
        name: `[${leadData.tier || 'N/A'}] ${leadData.nome_completo} - ${leadData.empresa || 'Lead'}`,
        custom_fields_values: [
          {
            field_code: "PHONE",
            values: [{ value: leadData.whatsapp }]
          }
        ],
        _embedded: {
          contacts: [
            {
              name: leadData.nome_completo,
              first_name: leadData.nome_completo.split(' ')[0],
              custom_fields_values: [
                {
                  field_code: "PHONE",
                  values: [{ value: leadData.whatsapp }]
                },
                {
                  field_code: "EMAIL",
                  values: [{ value: leadData.email || '' }]
                }
              ]
            }
          ],
          tags: tags
        },
        _embedded_notes: [
          {
            note_type: "common",
            params: {
              text: noteText
            }
          }
        ]
      }
    ];

    console.log('Sending to Kommo:', JSON.stringify(kommoPayload, null, 2));

    const kommoResponse = await fetch(kommoUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kommoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(kommoPayload),
    });

    const responseText = await kommoResponse.text();
    console.log('Kommo response status:', kommoResponse.status);
    console.log('Kommo response:', responseText);

    if (!kommoResponse.ok) {
      // Try alternative endpoint for simpler lead creation
      const simpleUrl = `https://${kommoSubdomain}.kommo.com/api/v4/leads`;
      const simplePayload = [
        {
          name: `Lead: ${leadData.nome_completo}`,
          custom_fields_values: [],
          _embedded: {
            tags: [
              { name: leadData.mercado },
              { name: leadData.estagio_negocio }
            ]
          }
        }
      ];

      const simpleResponse = await fetch(simpleUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kommoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(simplePayload),
      });

      const simpleText = await simpleResponse.text();
      console.log('Simple lead response:', simpleText);

      if (!simpleResponse.ok) {
        throw new Error(`Kommo API error: ${simpleText}`);
      }

      return new Response(
        JSON.stringify({ success: true, kommoResponse: JSON.parse(simpleText) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, kommoResponse: JSON.parse(responseText) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in kommo-webhook function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
