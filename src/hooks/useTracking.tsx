import { getFbc, ensureIndexCookie, lembrarSessionId, esquecerSessionId, getSessionId } from "@/lib/metaTracking";
import { temIdentificadorPago, type CamposAtribuicao } from "@/lib/atribuicaoPaga";
import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/** Disparado quando o visitante clica no CTA e sai da landing para o quiz. */
export const LEAVING_LANDING_EVENT = "champion:leaving-landing";

const SESSION_KEY = "champion_session_id";

interface TrackingContextType {
  sessionId: string | null;
  trackEvent: (eventName: string, data?: {
    page?: string;
    stepId?: string;
    buttonId?: string;
    metadata?: Json;
  }) => Promise<void>;
  trackStartClick: (buttonId: string) => Promise<void>;
  trackQuizPageView: (variante?: { codigo: string; path: string }) => Promise<void>;
  /**
   * Fim da tela de abertura do quiz. Sem este evento não dá para saber se a
   * pessoa desistiu no aviso de 10s ou na primeira pergunta: as duas coisas
   * moram na mesma tela e nenhum evento era emitido entre uma e outra.
   */
  trackIntroEnd: (comoFechou: "pulou" | "esperou", segundos: number) => Promise<void>;
  trackStepView: (stepId: string) => Promise<void>;
  trackStepNext: (fromStep: string, toStep: string, fieldData?: Record<string, string>) => Promise<void>;
  trackStepBack: (fromStep: string, toStep: string) => Promise<void>;
  trackSubmit: (leadData: {
    name: string;
    whatsapp: string;
    instagram: string;
    market: string;
    stage: string;
    investimentoFaixa?: string;
  }) => Promise<void>;
  updateSession: (data: Record<string, unknown>) => Promise<void>;
}

const TrackingContext = createContext<TrackingContextType | null>(null);

function generateUUID(): string {
  return crypto.randomUUID();
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

function sanitizeParam(val: string | null): string | null {
  if (!val) return null;
  // As duas pontas testadas SEPARADAMENTE desde 18/09/2026: valor truncado no
  // caminho chega com só `{{` ou só `}}` e continua não sendo dado.
  if (/\{\{|\}\}/.test(val)) return null;
  // Parte dos anúncios monta a URL com o valor JÁ codificado, então o
  // URLSearchParams devolve "Luis-Nathan+Case+%232+-+V3" (uma volta de encoding
  // sobrando) e o mesmo criativo virava dois nomes diferentes no relatório.
  // Só desfaz quando sobrou percent-encoding: nome de campanha usa "+" real
  // ("Ads validados + HD0") e não pode virar espaço.
  if (/%[0-9A-Fa-f]{2}/.test(val)) {
    try {
      return decodeURIComponent(val.replace(/\+/g, " "));
    } catch {
      return val;
    }
  }
  return val;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function getUTMParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  const utm_campaign = sanitizeParam(params.get("utm_campaign"));
  const utm_content = sanitizeParam(params.get("utm_content"));
  // Vários anúncios usam os parâmetros dinâmicos utm_campaign={{campaign.id}}/
  // utm_content={{ad.id}} em vez de campaign_id/ad_id dedicados — nesse caso
  // o ID numérico cru do Meta cai em utm_campaign/utm_content, então usa como
  // fallback pra não perder o dado (campaign_id/ad_id explícitos têm prioridade).
  const isNumericId = (v: string | null) => !!v && /^\d+$/.test(v);
  return {
    utm_source: sanitizeParam(params.get("utm_source")),
    utm_medium: sanitizeParam(params.get("utm_medium")),
    utm_campaign,
    utm_content,
    utm_term: sanitizeParam(params.get("utm_term")),
    // Click IDs
    fbclid: sanitizeParam(params.get("fbclid")),
    gclid: sanitizeParam(params.get("gclid")),
    ttclid: sanitizeParam(params.get("ttclid")),
    // Meta Ads IDs.
    //
    // `sanitizeParam` entra aqui em 18/09/2026. Estes quatro eram lidos CRUS —
    // eram os únicos do objeto que não passavam por ele — e foi por esta porta
    // que a macro literal entrou no banco: duas sessões de 16/09 nasceram com
    // `ad_id = "{{ad.id}}"` (clique em PRÉVIA de anúncio dentro do
    // Gerenciador), o lead herdou os três IDs como macro e virou uma linha de
    // "tráfego" no painel de criativos. Um ID que não identifica nada é pior
    // que nenhum ID: ele CASA, por igualdade, com um anúncio inexistente em
    // toda leitura que fizer join por ad_id.
    campaign_id: sanitizeParam(params.get("campaign_id")) || (isNumericId(utm_campaign) ? utm_campaign : null),
    adset_id: sanitizeParam(params.get("adset_id")),
    ad_id: sanitizeParam(params.get("ad_id")) || (isNumericId(utm_content) ? utm_content : null),
    creative_id: sanitizeParam(params.get("creative_id")),
    // ONDE o anúncio foi visto, no mesmo toque que trouxe campanha e anúncio.
    // `sanitizeParam` já descarta `{{placement}}` não expandido.
    placement: sanitizeParam(params.get("utm_placement") || params.get("placement")),
  };
}

/**
 * O TOQUE PAGO MAIS RECENTE MANDA NA SESSÃO (18/09/2026).
 *
 * ── O defeito ──────────────────────────────────────────────────────────────
 * A linha de `lead_sessions` nascia no PRIMEIRO toque e nunca mais era
 * atualizada nos campos de anúncio: o insert acima devolve 409 quando a sessão
 * já existe (o `session_id` mora no localStorage e sobrevive a aba nova, a
 * reabertura do app e dias inteiros), e nada além do progresso era gravado
 * depois. Quem clicou em dois anúncios diferentes ficava, na tabela, com o
 * primeiro — e o resgate do gatilho, que lê JUSTAMENTE essa linha, então
 * carimbava no lead o anúncio errado.
 *
 * Casos medidos em 18/09: Tiago clicou em Nulle #5 às 13:29 e em Nulle #6 às
 * 15:24 e virou lead como Nulle #5, com conjunto e placement do toque velho;
 * Emerson clicou em Case Ighor #7 e ficou com Nulle #7.
 *
 * ── A regra ────────────────────────────────────────────────────────────────
 * `reference_atribuicao_meta`: vale o ÚLTIMO clique ATÉ o lead nascer. Então
 * todo toque com identificador PAGO novo reescreve o bloco de anúncio da
 * sessão. Toque orgânico (bio, direto) não reescreve nada — quem decide isso é
 * `temIdentificadorPago`, a MESMA função que o front usa para a atribuição da
 * aba, e não uma segunda régua.
 *
 * O primeiro toque não se perde: a RPC guarda o bloco anterior em
 * `lead_sessions.primeiro_toque_pago` (jsonb) na primeira troca.
 */
async function atualizarAnuncioDaSessao(sessionId: string, utm: Record<string, string | null>) {
  if (!temIdentificadorPago(utm as Partial<CamposAtribuicao>)) return;
  try {
    const r = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/atualizar_anuncio_da_sessao`,
      {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_session_id: sessionId,
          p_campaign_id: utm.campaign_id,
          p_adset_id: utm.adset_id,
          p_ad_id: utm.ad_id,
          p_creative_id: utm.creative_id ?? null,
          p_utm_source: utm.utm_source,
          p_utm_medium: utm.utm_medium,
          p_utm_campaign: utm.utm_campaign,
          p_utm_content: utm.utm_content,
          p_utm_term: utm.utm_term,
          p_placement_raw: utm.placement,
          p_fbclid: utm.fbclid,
          p_gclid: utm.gclid,
        }),
      },
    );
    // 404 = migration ainda não aplicada. Não é erro do visitante e não pode
    // virar ruído no console de quem está na página.
    if (r.status === 404) return;
    if (!r.ok) {
      console.warn("[sessao] não atualizou o anúncio:", r.status, await r.text());
      return;
    }
    const trocou = await r.json().catch(() => null);
    if (trocou === true) console.log("[sessao] anúncio da sessão atualizado para o toque pago desta visita");
  } catch (e) {
    // Telemetria nunca derruba a visita.
    console.warn("[sessao] erro ao atualizar o anúncio:", e);
  }
}

// Helper to update session via Supabase client
/**
 * Colunas de progresso que o navegador pode gravar, e o parâmetro correspondente
 * na RPC. Lista fechada de propósito: a chamada sai do cliente com a chave
 * anônima, então nada fora daqui deve ser escrito por ela.
 */
const SESSION_RPC_PARAMS: Record<string, string> = {
  fbc: "p_fbc",
  started_quiz: "p_started_quiz",
  completed: "p_completed",
  current_step_id: "p_current_step_id",
  entered_quiz_page: "p_entered_quiz_page",
  start_button_id: "p_start_button_id",
  last_page: "p_last_page",
  lead_name: "p_lead_name",
  lead_whatsapp: "p_lead_whatsapp",
  lead_instagram: "p_lead_instagram",
  lead_market: "p_lead_market",
  lead_stage: "p_lead_stage",
  fbp: "p_fbp",
  quiz_variant: "p_quiz_variant",
};

/**
 * Grava o progresso da sessão via RPC.
 *
 * O UPDATE direto do PostgREST NÃO funciona nesta tabela: `lead_sessions` tem
 * policy de INSERT e de UPDATE, mas nenhuma de SELECT, e sem SELECT o Postgres
 * não localiza a linha para avaliar o WHERE — o update afeta zero linhas e
 * responde 204, sem erro nenhum. Foi assim que `started_quiz`, `completed` e
 * `lead_whatsapp` ficaram vazios em TODAS as sessões desde julho, levando junto
 * a atribuição do Meta e a recuperação de criativo no admin.
 *
 * A RPC `update_lead_session` é SECURITY DEFINER e não passa pela RLS. Mesmo
 * remédio já usado em `increment_section_time` pelo mesmo motivo.
 */
async function updateSessionDirect(sessionId: string, data: Record<string, unknown>) {
  try {
    // O tipo dos argumentos é montado dinamicamente a partir do mapa acima, e o
    // tipo gerado do banco exige o objeto literal — daí o cast, restrito a esta
    // linha. As chaves possíveis são as de SESSION_RPC_PARAMS, todas válidas.
    const args: Record<string, unknown> = { p_session_id: sessionId };
    for (const [column, value] of Object.entries(data)) {
      const param = SESSION_RPC_PARAMS[column];
      if (!param || value === undefined || value === null) continue;
      args[param] = value;
    }
    if (Object.keys(args).length === 1) return; // nada a gravar

    const { data: found, error } = await supabase.rpc(
      "update_lead_session",
      args as Parameters<typeof supabase.rpc<"update_lead_session">>[1],
    );

    if (error) {
      console.error("Error updating session:", error.message, error.code);
      return;
    }
    if (found === false) {
      // A sessão guardada no localStorage não existe mais no banco.
      // Limpa as TRÊS camadas: memória, localStorage e cookie de domínio.
      // Limpar só o localStorage deixaria o cookie ressuscitar o id morto na
      // próxima leitura (ver `esquecerSessionId` em src/lib/metaTracking.ts).
      console.warn("Session not found in DB, clearing stale session ID");
      esquecerSessionId();
    }
  } catch (error) {
    console.error("Error updating session:", error);
  }
}

export function TrackingProvider({ children }: { children: ReactNode }) {
  const sessionIdRef = useRef<string | null>(null);
  const sessionInitialized = useRef(false);
  const location = useLocation();

  // Initialize or get session ID
  const getOrCreateSessionId = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }

    // Ordem de resolução: localStorage → cookie de domínio → id novo.
    // O cookie entra aqui porque o script inline do index.html já o grava no
    // primeiro byte: sem ele, um armazenamento que esvazia no meio da visita
    // faria esta função cunhar um id NOVO e partir a jornada em duas.
    let sessionId: string | null = null;
    try {
      sessionId = localStorage.getItem(SESSION_KEY);
    } catch { /* storage indisponível */ }
    if (!sessionId) sessionId = getSessionId();
    if (!sessionId) {
      sessionId = generateUUID();
    }
    // O `setItem` PRECISA ser tolerante a falha: em navegador embutido com
    // armazenamento bloqueado ele levanta exceção, e uma exceção aqui derrubaria
    // a criação da sessão inteira — sem sessão, sem funil e sem atribuição.
    try {
      localStorage.setItem(SESSION_KEY, sessionId);
    } catch { /* ignore */ }
    // Memória e cookie ANTES de qualquer ida à rede. É isto que garante que o
    // insert do lead enxergue o mesmo id que os eventos, mesmo que o
    // armazenamento evapore no meio do quiz.
    lembrarSessionId(sessionId);

    // Garante que a linha exista em lead_sessions mesmo quando o id já veio
    // do localStorage: o script inline de landing-hit em index.html roda
    // ANTES do React e usa essa MESMA chave só pra correlacionar
    // landing_hits, sem nunca inserir em lead_sessions.
    //
    // IMPORTANTE: NÃO usar on_conflict/upsert aqui. O Postgres precisa de
    // permissão de SELECT sob RLS pra resolver "ON CONFLICT" (mesmo com
    // DO NOTHING) — e lead_sessions não tem policy de SELECT pública
    // (removida de propósito em 2026-05-27, leitura só via service_role
    // no admin-data). Com upsert, TODO insert falhava com 42501
    // silenciosamente (só no console do visitante), deixando a tabela
    // 100% vazia mesmo depois do "fix" anterior que tentou justamente
    // corrigir isso. Um INSERT simples funciona (confirmado); conflito de
    // chave (sessão já existe) vira 409/23505, tratado abaixo como normal.
    const utmParams = getUTMParams();
    const currentPage = window.location.pathname;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/lead_sessions`;
      let bodySessao = "";
      let response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: (bodySessao = JSON.stringify({
          id: sessionId,
          first_page: currentPage,
          last_page: currentPage,
          referrer: document.referrer || null,
          // UTM params
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          utm_content: utmParams.utm_content,
          utm_term: utmParams.utm_term,
          // Click IDs
          fbclid: utmParams.fbclid,
          gclid: utmParams.gclid,
          ttclid: utmParams.ttclid,
          // Meta Ads IDs
          campaign_id: utmParams.campaign_id,
          adset_id: utmParams.adset_id,
          ad_id: utmParams.ad_id,
          creative_id: utmParams.creative_id,
          // Posicionamento do MESMO toque que criou a sessão. Guardado cru,
          // sem derivar plataforma nem posição — a URL não manda essas duas.
          placement_raw: utmParams.placement,
          // Device info
          device_type: getDeviceType(),
          user_agent: navigator.userAgent,
          // Facebook browser params for CAPI matching
          fbp: getCookie('_fbp') || null,
          // Cookie do clique de anúncio. É o que liga a conversão ao anúncio
          // no Meta; nunca tinha sido lido (ver src/lib/metaTracking.ts).
          fbc: getFbc(),
        })),
      });

      // Se a coluna `fbc` ainda não existir no banco (migration de 06/09
      // pendente), a sessão NÃO pode se perder: tenta de novo sem ela.
      if (response.status === 400) {
        const txt = await response.clone().text().catch(() => "");
        if (/fbc/.test(txt) && /column|schema cache|PGRST204/i.test(txt)) {
          const semFbc = JSON.parse(bodySessao);
          delete semFbc.fbc;
          const retry = await fetch(url, {
            method: 'POST',
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(semFbc),
          });
          response = retry;
        }
      }
      // 409 = sessão já existe (unique violation na PK) — normal quando o
      // id já veio do localStorage, não é um erro real.
      //
      // E é EXATAMENTE aqui que o anúncio se perdia: no 409 a sessão seguia
      // com os campos do primeiro toque para sempre. A chamada abaixo roda nos
      // dois casos (na criação ela é no-op, porque a linha já nasceu com estes
      // mesmos valores) e é o que faz valer o último clique pago.
      void atualizarAnuncioDaSessao(sessionId!, utmParams);

      if (!response.ok && response.status !== 409) {
        console.error("Error creating session:", await response.text());
      } else {
        // Capture IP address via edge function
        try {
          const ipResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-client-ip`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({ session_id: sessionId, action: 'check_session' }),
            }
          );
          if (ipResponse.ok) {
            const ipData = await ipResponse.json();
            console.log("IP captured:", ipData.ip, "New visitor:", ipData.is_new_visitor);
          }
        } catch (ipError) {
          console.error("Error capturing IP:", ipError);
        }

        // Retry fbp/fbc capture after Meta Pixel has time to set the cookies
        const faltouFbp = !getCookie('_fbp');
        const faltouFbc = !getCookie('_fbc') && !!utmParams.fbclid;
        const retryCookies = (attempt: number) => {
          if (attempt > 5) return;
          setTimeout(() => {
            const fbpVal = getCookie('_fbp');
            const fbcVal = getCookie('_fbc');
            const patch: Record<string, string> = {};
            if (faltouFbp && fbpVal) patch.fbp = fbpVal;
            if (faltouFbc && fbcVal) patch.fbc = fbcVal;
            if (Object.keys(patch).length) {
              console.log("meta cookies captured on retry", attempt, patch);
              updateSessionDirect(sessionId!, patch);
            } else if (attempt < 5) {
              retryCookies(attempt + 1);
            }
          }, attempt * 1500); // 1.5s, 3s, 4.5s, 6s, 7.5s
        };
        if (faltouFbp || faltouFbc) {
          retryCookies(1);
        }
        ensureIndexCookie(sessionId);
      }
    } catch (error) {
      console.error("Error creating session:", error);
    }

    sessionIdRef.current = sessionId;
    return sessionId;
  }, []);

  // Track event
  const trackEvent = useCallback(async (
    eventName: string,
    data?: {
      page?: string;
      stepId?: string;
      buttonId?: string;
      metadata?: Json;
    }
  ) => {
    const sessionId = await getOrCreateSessionId();
    
    try {
      await supabase.from("lead_events").insert([{
        session_id: sessionId,
        event_name: eventName,
        page: data?.page || window.location.pathname,
        step_id: data?.stepId || null,
        button_id: data?.buttonId || null,
        metadata: data?.metadata || null,
      }]);
    } catch (error) {
      console.error("Error tracking event:", error);
    }
  }, [getOrCreateSessionId]);

  // Update session data
  const updateSession = useCallback(async (data: Record<string, unknown>) => {
    const sessionId = await getOrCreateSessionId();
    await updateSessionDirect(sessionId, data);
  }, [getOrCreateSessionId]);

  // Track start button click
  const trackStartClick = useCallback(async (buttonId: string) => {
    // Dispara dois eventos semânticos:
    // - "start_click": legado (mantido para compatibilidade do funil atual)
    // - "click_outbound": clique no CTA que sai da landing (fonte da verdade de cliques internos)
    // A leitura da landing termina AQUI. O medidor de tempo por seção vive em
    // outro hook (useLandingTracking) e não tem como saber do clique sozinho:
    // a navegação para o quiz é SPA, então nem `pagehide` nem
    // `visibilitychange` disparam. Sem este aviso, o relógio da seção continua
    // correndo enquanto a pessoa responde o quiz — foi o que fez uma headline
    // aparecer com 2min32 de leitura num visitante que clicou em 22 segundos.
    window.dispatchEvent(new CustomEvent(LEAVING_LANDING_EVENT));
    await Promise.allSettled([
      trackEvent("start_click", { buttonId }),
      trackEvent("click_outbound", { buttonId, metadata: { destination: "/quiz", source: "landing_cta" } as Json }),
    ]);
    await updateSession({
      started_quiz: true,
      start_button_id: buttonId,
    });
  }, [trackEvent, updateSession]);

  // Track quiz page view - marks both entered_quiz_page AND started_quiz
  const trackQuizPageView = useCallback(async (variante?: { codigo: string; path: string }) => {
    await trackEvent("quiz_view", {
      page: variante?.path ?? "/quiz",
      metadata: (variante ? { quiz_variant: variante.codigo } : null) as Json,
    });
    await updateSession({
      entered_quiz_page: true,
      started_quiz: true,
      ...(variante ? { quiz_variant: variante.codigo } : {}),
    });
  }, [trackEvent, updateSession]);

  const trackIntroEnd = useCallback(async (comoFechou: "pulou" | "esperou", segundos: number) => {
    await trackEvent("intro_end", {
      metadata: { como: comoFechou, segundos } as Json,
    });
  }, [trackEvent]);

  // Track step view
  const trackStepView = useCallback(async (stepId: string) => {
    await trackEvent("step_view", { stepId });
    await updateSession({ current_step_id: stepId });
  }, [trackEvent, updateSession]);

  // Track step next with field data
  const trackStepNext = useCallback(async (fromStep: string, toStep: string, fieldData?: Record<string, string>) => {
    await trackEvent("step_next", {
      stepId: toStep,
      metadata: { 
        from_step: fromStep, 
        to_step: toStep,
        field_value: fieldData 
      } as Json,
    });
    await updateSession({ current_step_id: toStep });
  }, [trackEvent, updateSession]);

  // Track step back
  const trackStepBack = useCallback(async (fromStep: string, toStep: string) => {
    await trackEvent("step_back", {
      stepId: toStep,
      metadata: { from_step: fromStep, to_step: toStep },
    });
    await updateSession({ current_step_id: toStep });
  }, [trackEvent, updateSession]);

  // Track submit
  const trackSubmit = useCallback(async (leadData: {
    name: string;
    whatsapp: string;
    instagram: string;
    market: string;
    stage: string;
    investimentoFaixa?: string;
  }) => {
    const sessionId = await getOrCreateSessionId();
    
    // Capture fbp/fbc one last time before submit (pixel should have set them by now)
    const fbpVal = getCookie('_fbp');
    const fbcVal = getFbc();

    await trackEvent("submit");
    await updateSession({
      completed: true,
      lead_name: leadData.name,
      lead_whatsapp: leadData.whatsapp,
      lead_instagram: leadData.instagram,
      lead_market: leadData.market,
      lead_stage: leadData.stage,
      ...(fbpVal ? { fbp: fbpVal } : {}),
      ...(fbcVal ? { fbc: fbcVal } : {}),
    });
    
    // Trigger server-side notification (Kommo + WhatsApp)
    // This runs in background and doesn't block the user
    try {
      const notifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-lead`;
      fetch(notifyUrl, {
        method: 'POST',
        // keepalive: o formulário curto do topo da landing (17/09/2026) troca de
        // página logo após o envio, sem os 10 s de animação do quiz. Sem isto a
        // navegação completa cancelaria o aviso do lead no meio do caminho.
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ sessionId, investimento_faixa: leadData.investimentoFaixa }),
      }).then(async (res) => {
        if (res.ok) {
          console.log('Notification triggered successfully');
        } else {
          console.error('Notification failed:', await res.text());
        }
      }).catch((err) => {
        console.error('Error triggering notification:', err);
      });
    } catch (error) {
      console.error('Error calling notify-lead:', error);
    }
  }, [trackEvent, updateSession, getOrCreateSessionId]);

  // Track page views on route change
  useEffect(() => {
    const trackPageView = async () => {
      const sessionId = await getOrCreateSessionId();
      
      await trackEvent("page_view", { page: location.pathname });
      
      // Update session with last page
      await updateSessionDirect(sessionId, { last_page: location.pathname });
    };

    if (!sessionInitialized.current) {
      sessionInitialized.current = true;
      trackPageView();
    } else {
      trackPageView();
    }
  }, [location.pathname, getOrCreateSessionId, trackEvent]);

  // Track abandonment on visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        await trackEvent("visibility_hidden");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [trackEvent]);

  return (
    <TrackingContext.Provider
      value={{
        sessionId: sessionIdRef.current,
        trackEvent,
        trackStartClick,
        trackQuizPageView,
        trackStepView,
        trackIntroEnd,
        trackStepNext,
        trackStepBack,
        trackSubmit,
        updateSession,
      }}
    >
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const context = useContext(TrackingContext);
  if (!context) {
    throw new Error("useTracking must be used within a TrackingProvider");
  }
  return context;
}
