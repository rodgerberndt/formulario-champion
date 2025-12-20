import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const kommoApiKey = Deno.env.get('KOMMO_API_KEY');
const kommoSubdomain = Deno.env.get('KOMMO_SUBDOMAIN');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    
    const kommoPayload = [
      {
        name: `Lead: ${leadData.nome_completo}`,
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
                }
              ]
            }
          ],
          tags: [
            { name: leadData.mercado },
            { name: leadData.estagio_negocio },
            { name: "Champion Form" }
          ]
        },
        // Add note with full details
        _embedded_notes: [
          {
            note_type: "common",
            params: {
              text: `Instagram: ${leadData.instagram}\n\nMercado: ${leadData.mercado}\n\nEstágio: ${leadData.estagio_negocio}\n\nDor/Desejo:\n${leadData.dor_desejo}`
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
