 import { useEffect, useCallback, useRef } from "react";
 import { useLocation } from "react-router-dom";
 
 const UTM_STORAGE_KEY = "champion_utm";
 
 export interface UtmData {
   utm_source: string;
   utm_medium: string;
   utm_campaign: string;
   utm_content: string | null;
   utm_term: string | null;
   fbclid: string | null;
   gclid: string | null;
 }
 
 const DEFAULT_UTM: UtmData = {
   utm_source: "direct",
   utm_medium: "none",
   utm_campaign: "(not set)",
   utm_content: null,
   utm_term: null,
   fbclid: null,
   gclid: null,
 };
 
 function parseQueryParams(search: string): Partial<UtmData> {
   const params = new URLSearchParams(search);
   const result: Partial<UtmData> = {};
 
   const utm_source = params.get("utm_source");
   const utm_medium = params.get("utm_medium");
   const utm_campaign = params.get("utm_campaign");
   const utm_content = params.get("utm_content");
   const utm_term = params.get("utm_term");
   const fbclid = params.get("fbclid");
   const gclid = params.get("gclid");
 
   if (utm_source) result.utm_source = utm_source;
   if (utm_medium) result.utm_medium = utm_medium;
   if (utm_campaign) result.utm_campaign = utm_campaign;
   if (utm_content) result.utm_content = utm_content;
   if (utm_term) result.utm_term = utm_term;
   if (fbclid) result.fbclid = fbclid;
   if (gclid) result.gclid = gclid;
 
   return result;
 }
 
 function hasUtmParams(data: Partial<UtmData>): boolean {
   return !!(data.utm_source || data.utm_campaign || data.fbclid || data.gclid);
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
 
     // Only save if we have UTM data in URL
     if (hasUtmParams(urlParams)) {
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
       };
 
       sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(newData));
       console.log("UTM data captured:", newData);
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