import { useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getStoredAttribution } from "@/hooks/useAttribution";

const UTM_STORAGE_KEY = "champion_utm";
const BIO_RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface UtmData {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  // Meta Ads tracking
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
}

const DEFAULT_UTM: UtmData = {
  utm_source: "direct",
  utm_medium: "none",
  utm_campaign: "(not set)",
  utm_content: null,
  utm_term: null,
  fbclid: null,
  gclid: null,
  campaign_id: null,
  adset_id: null,
  ad_id: null,
  placement: null,
  site_source_name: null,
};

// Strip Meta Ads unresolved placeholders like {{campaign.name}}
function sanitizeParam(value: string | null): string | null {
  if (!value) return null;
  if (/\{\{.*\}\}/.test(value)) return null;
  return value;
}

function parseQueryParams(search: string): Partial<UtmData> {
  const params = new URLSearchParams(search);
  const result: Partial<UtmData> = {};

  // UTM parameters (sanitize placeholders)
  const utm_source = sanitizeParam(params.get("utm_source"));
  const utm_medium = sanitizeParam(params.get("utm_medium"));
  const utm_campaign = sanitizeParam(params.get("utm_campaign"));
  const utm_content = sanitizeParam(params.get("utm_content"));
  const utm_term = sanitizeParam(params.get("utm_term"));
  const fbclid = sanitizeParam(params.get("fbclid"));
  const gclid = sanitizeParam(params.get("gclid"));

  // Meta Ads parameters (IDs are numeric, no need to sanitize).
  // Vários anúncios usam os parâmetros dinâmicos utm_campaign={{campaign.id}}/
  // utm_content={{ad.id}} em vez de campaign_id/ad_id dedicados — nesse caso
  // o ID numérico cru do Meta cai em utm_campaign/utm_content, então usa como
  // fallback pra não perder o dado (campaign_id/ad_id explícitos têm prioridade).
  const isNumericId = (v: string | null) => !!v && /^\d+$/.test(v);
  const campaign_id = params.get("campaign_id") || (isNumericId(utm_campaign) ? utm_campaign : null);
  const adset_id = params.get("adset_id");
  const ad_id = params.get("ad_id") || (isNumericId(utm_content) ? utm_content : null);
  const placement = sanitizeParam(params.get("placement"));
  const site_source_name = sanitizeParam(params.get("site_source_name"));

  if (utm_source) result.utm_source = utm_source;
  if (utm_medium) result.utm_medium = utm_medium;
  if (utm_campaign) result.utm_campaign = utm_campaign;
  if (utm_content) result.utm_content = utm_content;
  if (utm_term) result.utm_term = utm_term;
  if (fbclid) result.fbclid = fbclid;
  if (gclid) result.gclid = gclid;
  if (campaign_id) result.campaign_id = campaign_id;
  if (adset_id) result.adset_id = adset_id;
  if (ad_id) result.ad_id = ad_id;
  if (placement) result.placement = placement;
  if (site_source_name) result.site_source_name = site_source_name;

  return result;
}

function hasTrackingParams(data: Partial<UtmData>): boolean {
  return !!(data.utm_source || data.utm_campaign || data.fbclid || data.gclid || data.campaign_id || data.ad_id);
}

// Determine attribution source based on current session data
export function getAttributionSource(): "direct_ad" | "bio_recovery" | "organic" {
  const utm = getStoredUtm();
  
  // If session has real UTM params, it's a direct ad click
  if (utm.utm_source !== "direct" && utm.utm_source !== "(not set)" && utm.utm_campaign !== "(not set)") {
    return "direct_ad";
  }
  
  // Check if we recovered from localStorage attribution
  try {
    const recoveryFlag = sessionStorage.getItem("champion_utm_recovered");
    if (recoveryFlag === "true") return "bio_recovery";
  } catch {}
  
  return "organic";
}

export function getStoredUtm(): UtmData {
  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_UTM, ...parsed };
    }
  } catch (e) {
    console.error("Error reading UTM data:", e);
  }
  return DEFAULT_UTM;
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
  const location = useLocation();
  const initialized = useRef(false);

  // Capture UTMs on first load with query params
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const urlParams = parseQueryParams(window.location.search);

    // If we have tracking data in URL, save it directly
    if (hasTrackingParams(urlParams)) {
      const existingData = getStoredUtm();

      // Merge new params with existing (prioritize new)
      const newData: UtmData = {
        utm_source: urlParams.utm_source || existingData.utm_source,
        utm_medium: urlParams.utm_medium || existingData.utm_medium,
        utm_campaign: urlParams.utm_campaign || existingData.utm_campaign,
        utm_content: urlParams.utm_content || existingData.utm_content,
        utm_term: urlParams.utm_term || existingData.utm_term,
        fbclid: urlParams.fbclid || existingData.fbclid,
        gclid: urlParams.gclid || existingData.gclid,
        campaign_id: urlParams.campaign_id || existingData.campaign_id,
        adset_id: urlParams.adset_id || existingData.adset_id,
        ad_id: urlParams.ad_id || existingData.ad_id,
        placement: urlParams.placement || existingData.placement,
        site_source_name: urlParams.site_source_name || existingData.site_source_name,
      };

      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(newData));
      console.log("Tracking data captured:", newData);
    } else {
      // No UTMs in URL — try to recover from localStorage attribution (bio recovery)
      const attribution = getStoredAttribution();
      if (attribution && attribution.captured_at) {
        const capturedAt = new Date(attribution.captured_at).getTime();
        const now = Date.now();
        const withinWindow = (now - capturedAt) < BIO_RECOVERY_WINDOW_MS;

        const hasAttributionData = !!(
          attribution.utm_source || attribution.utm_campaign || 
          attribution.fbclid || attribution.campaign_id || attribution.ad_id
        );

        if (withinWindow && hasAttributionData) {
          const recoveredData: UtmData = {
            utm_source: attribution.utm_source || DEFAULT_UTM.utm_source,
            utm_medium: attribution.utm_medium || DEFAULT_UTM.utm_medium,
            utm_campaign: attribution.utm_campaign || DEFAULT_UTM.utm_campaign,
            utm_content: attribution.utm_content || DEFAULT_UTM.utm_content,
            utm_term: attribution.utm_term || DEFAULT_UTM.utm_term,
            fbclid: attribution.fbclid || null,
            gclid: attribution.gclid || null,
            campaign_id: attribution.campaign_id || null,
            adset_id: attribution.adset_id || null,
            ad_id: attribution.ad_id || null,
            placement: null,
            site_source_name: null,
          };

          sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(recoveredData));
          sessionStorage.setItem("champion_utm_recovered", "true");
          console.log("🔄 Bio recovery: attribution recovered from localStorage", recoveredData);
        }
      }
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