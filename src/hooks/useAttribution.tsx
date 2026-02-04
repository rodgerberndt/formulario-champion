import { useCallback, useEffect, useRef } from "react";

const ATTRIBUTION_KEY = "champion_attribution";

export interface AttributionData {
  // UTM Parameters
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  
  // Click IDs
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  
  // Meta Ads IDs
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  creative_id: string | null;
  
  // Metadata
  captured_at: string;
  landing_page: string;
}

function getQueryParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
    fbclid: params.get("fbclid"),
    gclid: params.get("gclid"),
    ttclid: params.get("ttclid"),
    campaign_id: params.get("campaign_id"),
    adset_id: params.get("adset_id"),
    ad_id: params.get("ad_id"),
    creative_id: params.get("creative_id"),
  };
}

function hasAnyValue(data: Record<string, string | null>): boolean {
  return Object.values(data).some((v) => v !== null && v !== "");
}

export function getStoredAttribution(): AttributionData | null {
  try {
    const stored = localStorage.getItem(ATTRIBUTION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error reading attribution data:", e);
  }
  return null;
}

export function useAttribution() {
  const initialized = useRef(false);

  // Capture and persist attribution on first visit
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const urlParams = getQueryParams();
    
    // Only save if we have new attribution data in URL
    if (hasAnyValue(urlParams)) {
      const existingData = getStoredAttribution();
      
      // Merge with existing data (don't overwrite with nulls)
      const newData: AttributionData = {
        utm_source: urlParams.utm_source || existingData?.utm_source || null,
        utm_medium: urlParams.utm_medium || existingData?.utm_medium || null,
        utm_campaign: urlParams.utm_campaign || existingData?.utm_campaign || null,
        utm_content: urlParams.utm_content || existingData?.utm_content || null,
        utm_term: urlParams.utm_term || existingData?.utm_term || null,
        fbclid: urlParams.fbclid || existingData?.fbclid || null,
        gclid: urlParams.gclid || existingData?.gclid || null,
        ttclid: urlParams.ttclid || existingData?.ttclid || null,
        campaign_id: urlParams.campaign_id || existingData?.campaign_id || null,
        adset_id: urlParams.adset_id || existingData?.adset_id || null,
        ad_id: urlParams.ad_id || existingData?.ad_id || null,
        creative_id: urlParams.creative_id || existingData?.creative_id || null,
        captured_at: existingData?.captured_at || new Date().toISOString(),
        landing_page: existingData?.landing_page || window.location.pathname,
      };

      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(newData));
      console.log("Attribution data captured:", newData);
    }
  }, []);

  const getAttribution = useCallback((): AttributionData | null => {
    return getStoredAttribution();
  }, []);

  // Get attribution data for database insert (without null fields)
  const getAttributionForDb = useCallback((): Record<string, string> => {
    const data = getStoredAttribution();
    if (!data) return {};

    const result: Record<string, string> = {};
    
    if (data.utm_source) result.utm_source = data.utm_source;
    if (data.utm_medium) result.utm_medium = data.utm_medium;
    if (data.utm_campaign) result.utm_campaign = data.utm_campaign;
    if (data.utm_content) result.utm_content = data.utm_content;
    if (data.utm_term) result.utm_term = data.utm_term;
    if (data.fbclid) result.fbclid = data.fbclid;
    if (data.gclid) result.gclid = data.gclid;
    if (data.ttclid) result.ttclid = data.ttclid;
    if (data.campaign_id) result.campaign_id = data.campaign_id;
    if (data.adset_id) result.adset_id = data.adset_id;
    if (data.ad_id) result.ad_id = data.ad_id;
    if (data.creative_id) result.creative_id = data.creative_id;

    return result;
  }, []);

  return {
    getAttribution,
    getAttributionForDb,
  };
}
