import { useEffect, useCallback, useRef } from "react";
import {
  ATRIBUICAO_PADRAO,
  CamposAtribuicao,
  CHAVE_RECUPERADO,
  capturarAtribuicaoDaVisita,
  lerAtribuicaoDaAba,
} from "@/lib/atribuicaoPaga";

/**
 * Captura de atribuição.
 *
 * TODA a decisão de "esta visita é paga?" e "o que sobrevive?" mora em
 * `src/lib/atribuicaoPaga.ts`, que não importa React — é o que permite testá-la
 * sem navegador (`scripts/testar-atribuicao-paga.mjs`), exercitando o MESMO
 * código que roda em produção e não uma cópia dele. Aqui ficou só o que é de
 * React: rodar uma vez por carregamento e expor as leituras aos formulários.
 *
 * Regra em uma frase (18/09/2026): visita paga é a que traz identificador de
 * anúncio (`campaign_id`/`adset_id`/`ad_id` ou `utm_medium=paid_social`);
 * visita sem identificador pago não apaga nem sobrescreve o toque pago já
 * guardado, e um novo clique pago vence o pago anterior.
 */

/** Mantido como nome público do tipo; a forma é a de `CamposAtribuicao`. */
export type UtmData = CamposAtribuicao;

/** Reexportado para quem já importava o padrão a partir daqui. */
export const DEFAULT_UTM: UtmData = ATRIBUICAO_PADRAO;

/**
 * De onde veio a atribuição desta sessão.
 *
 * MUDANÇA DE SEMÂNTICA DOCUMENTADA (18/09/2026): a marca de resgate passa a ser
 * consultada ANTES do teste de UTM válido. Antes ela só era alcançada quando a
 * recuperação deixava `utm_campaign` em "(not set)" — ou seja, praticamente
 * nunca. Agora uma volta pela bio que recupera o toque pago guardado devolve
 * `bio_recovery` (a informação verdadeira: o toque pago é anterior e foi
 * resgatado) em vez de `direct_ad`.
 *
 * Isto muda apenas o valor que o NAVEGADOR manda. A coluna `attribution_source`
 * no banco continua sendo decidida pelo gatilho `recover_attribution_from_session`,
 * que marca `direct_ad` sempre que `utm_source` é válido — inalterado aqui.
 */
export function getAttributionSource(): "direct_ad" | "bio_recovery" | "organic" {
  try {
    if (sessionStorage.getItem(CHAVE_RECUPERADO) === "true") return "bio_recovery";
  } catch {
    /* armazenamento indisponível */
  }

  const utm = getStoredUtm();
  if (
    utm.utm_source !== "direct" &&
    utm.utm_source !== "(not set)" &&
    utm.utm_campaign !== "(not set)"
  ) {
    return "direct_ad";
  }

  return "organic";
}

export function getStoredUtm(): UtmData {
  return lerAtribuicaoDaAba();
}

export function getUtmForDb(): Record<string, string | null> {
  const utm = getStoredUtm();
  return {
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    utm_term: utm.utm_term,
    fbclid: utm.fbclid,
    gclid: utm.gclid,
    campaign_id: utm.campaign_id,
    adset_id: utm.adset_id,
    ad_id: utm.ad_id,
    placement: utm.placement,
    site_source_name: utm.site_source_name,
  };
}

export function useUtmCapture() {
  const initialized = useRef(false);

  // Capture UTMs on first load
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const decisao = capturarAtribuicaoDaVisita(
      window.location.search,
      window.location.pathname,
    );

    if (decisao.origem === "recuperado") {
      console.log("🔄 Bio recovery: toque pago recuperado do localStorage", decisao.dados);
    } else if (decisao.origem === "clique_pago") {
      console.log("Tracking data captured (clique pago):", decisao.dados);
    }
  }, []);

  const getUtm = useCallback((): UtmData => {
    return getStoredUtm();
  }, []);

  const getUtmPayload = useCallback((): Record<string, string | null> => {
    return getUtmForDb();
  }, []);

  return {
    getUtm,
    getUtmPayload,
  };
}
