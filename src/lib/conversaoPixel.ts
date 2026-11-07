/**
 * Eventos de conversão do PIXEL no nascimento do lead, num lugar só (17/09/2026).
 *
 * Até aqui cada página de obrigado disparava os seus:
 *   /obrigadomql    CompleteRegistration, Lead, MQL (se faixa >= R$ 10 mil)
 *   /obrigadosprint CompleteRegistration, Lead, Sprint, MQL (se faixa >= R$ 10 mil)
 * Com o formulário mandando TODO lead para /obrigadomql (e o >= R$ 100 mil
 * passando antes por /agendar), a página deixou de dizer qual é o produto. Quem
 * decide agora é a FAIXA, com a mesma regra do servidor (fire-capi-events):
 *   faixa >= R$ 10 mil → MQL
 *   abaixo             → Sprint
 * CompleteRegistration e Lead saem sempre.
 *
 * O event_id de cada um é o de `champion_event_ids` (`<lead_id>_<Evento>`), o
 * mesmo que o formulário mandou ao fire-capi-events: navegador e servidor se
 * deduplicam no Meta.
 *
 * Uma vez por lead neste navegador. O lead >= R$ 100 mil passa por /agendar e
 * depois por /obrigadomql; os eventos saem na PRIMEIRA delas (se ele fechar a
 * aba em /agendar, o sinal do navegador já foi) e a segunda não repete.
 */

import { pixelPermitido, avisarPixelBloqueado } from "@/lib/ambienteMeta";

// Espelho de MQL_FAIXAS (src/pages/Quiz.tsx, HeroLeadForm.tsx e
// supabase/functions/_shared/meta.ts), mais os dois rótulos antigos que as
// páginas de obrigado já aceitavam.
const MQL_PIXEL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil",
  "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil",
  "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil",
  "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 20k – 50k",
  "R$ 50k – 100k",
];

export function faixaEhMql(faixa: string | null | undefined): boolean {
  return !!faixa && MQL_PIXEL_FAIXAS.includes(faixa);
}

const MARCA_KEY = "champion_pixel_conversao_lead";

function lerEventIds(): { leadId: string | null; ids: Record<string, string> } {
  try {
    const parsed = JSON.parse(localStorage.getItem("champion_event_ids") || "null");
    return { leadId: parsed?.lead_id ?? null, ids: parsed?.event_ids ?? {} };
  } catch {
    return { leadId: null, ids: {} };
  }
}

/**
 * Dispara CompleteRegistration + Lead + (MQL | Sprint).
 * Devolve true se disparou agora, false se o pixel não existe ou este lead já
 * teve os eventos disparados neste navegador.
 */
export function dispararConversaoDoLead(investimentoFaixa: string | null | undefined, pagina: string): boolean {
  if (typeof window.fbq !== "function") return false;

  // Fora do domínio de produção o pixel NÃO dispara: o `fbq` não aceita
  // `test_event_code` (é parâmetro da CAPI), então um evento de navegador
  // mandado de localhost ou da prévia do Cloudflare entraria como conversão
  // REAL na conta — otimização, custo por resultado e ROAS incluídos. A CAPI
  // continua saindo, marcada como teste. Ver src/lib/ambienteMeta.ts.
  if (!pixelPermitido()) {
    avisarPixelBloqueado(pagina);
    return false;
  }

  const { leadId, ids } = lerEventIds();
  // Lead fictício da prévia local de /agendar: o pixel real está carregado em
  // localhost também, e evento de mentira iria para o Meta.
  if (leadId?.startsWith("previa-")) {
    console.log(`Facebook Pixel: prévia local (${pagina}), nenhum evento disparado`);
    return false;
  }
  if (leadId) {
    try {
      if (localStorage.getItem(MARCA_KEY) === leadId) {
        console.log(`Facebook Pixel: conversão do lead ${leadId} já disparada, ${pagina} não repete`);
        return false;
      }
    } catch { /* ignore */ }
  }

  const faixa = investimentoFaixa || "unknown";

  window.fbq("track", "CompleteRegistration", {}, { eventID: ids.CompleteRegistration });
  // Evento padrão (track, não trackCustom): é o que a campanha de Lead otimiza.
  window.fbq("track", "Lead", { content_name: "Lead", investimento_faixa: faixa }, { eventID: ids.Lead });

  if (faixaEhMql(investimentoFaixa)) {
    window.fbq("trackCustom", "MQL", { content_name: "MQL Lead", investimento_faixa: faixa }, { eventID: ids.MQL });
    console.log(`Facebook Pixel (${pagina}): CompleteRegistration, Lead, MQL`, ids.MQL);
  } else {
    window.fbq("trackCustom", "Sprint", { content_name: "Sprint Application", investimento_faixa: faixa }, { eventID: ids.Sprint });
    console.log(`Facebook Pixel (${pagina}): CompleteRegistration, Lead, Sprint (faixa abaixo de R$ 10 mil, sem MQL)`, ids.Sprint);
  }

  if (leadId) {
    try { localStorage.setItem(MARCA_KEY, leadId); } catch { /* ignore */ }
  }
  return true;
}
