import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

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
  trackQuizPageView: () => Promise<void>;
  trackStepView: (stepId: string) => Promise<void>;
  trackStepNext: (fromStep: string, toStep: string, fieldData?: Record<string, string>) => Promise<void>;
  trackStepBack: (fromStep: string, toStep: string) => Promise<void>;
  trackSubmit: (leadData: {
    name: string;
    whatsapp: string;
    instagram: string;
    market: string;
    stage: string;
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
  if (/\{\{.*\}\}/.test(val)) return null;
  return val;
}

function getUTMParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: sanitizeParam(params.get("utm_source")),
    utm_medium: sanitizeParam(params.get("utm_medium")),
    utm_campaign: sanitizeParam(params.get("utm_campaign")),
    utm_content: sanitizeParam(params.get("utm_content")),
    utm_term: sanitizeParam(params.get("utm_term")),
    // Click IDs
    fbclid: sanitizeParam(params.get("fbclid")),
    gclid: sanitizeParam(params.get("gclid")),
    ttclid: sanitizeParam(params.get("ttclid")),
    // Meta Ads IDs (numeric IDs, keep as-is)
    campaign_id: params.get("campaign_id"),
    adset_id: params.get("adset_id"),
    ad_id: params.get("ad_id"),
    creative_id: params.get("creative_id"),
  };
}

// Helper to update session via Supabase client
async function updateSessionDirect(sessionId: string, data: Record<string, unknown>) {
  try {
    const payload: Record<string, unknown> = {
      ...data,
      last_seen_at: new Date().toISOString(),
    };
    
    // Remove undefined values to prevent issues
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    
    console.log("Updating session:", sessionId, payload);
    
    // Use update without .single()/.maybeSingle() to avoid 406 errors
    const { data: result, error } = await supabase
      .from("lead_sessions")
      .update(payload)
      .eq("id", sessionId)
      .select("id");
    
    if (error) {
      console.error("Error updating session:", error.message, error.code);
      if (error.code === 'PGRST116' || error.code === '406') {
        console.warn("Session not found in DB, clearing stale session ID");
        localStorage.removeItem(SESSION_KEY);
      }
    } else if (!result || result.length === 0) {
      console.warn("Session update returned 0 rows for:", sessionId);
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

    let sessionId = localStorage.getItem(SESSION_KEY);
    
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem(SESSION_KEY, sessionId);
      
      // Create new session in database via direct REST API
      const utmParams = getUTMParams();
      const currentPage = window.location.pathname;
      
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/lead_sessions`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
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
            // Device info
            device_type: getDeviceType(),
            user_agent: navigator.userAgent,
          }),
        });
        
        if (!response.ok) {
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
        }
      } catch (error) {
        console.error("Error creating session:", error);
      }
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
    await trackEvent("start_click", { buttonId });
    await updateSession({
      started_quiz: true,
      start_button_id: buttonId,
    });
  }, [trackEvent, updateSession]);

  // Track quiz page view - marks both entered_quiz_page AND started_quiz
  const trackQuizPageView = useCallback(async () => {
    await trackEvent("quiz_view", { page: "/quiz" });
    await updateSession({ entered_quiz_page: true, started_quiz: true });
  }, [trackEvent, updateSession]);

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
  }) => {
    const sessionId = await getOrCreateSessionId();
    
    await trackEvent("submit");
    await updateSession({
      completed: true,
      lead_name: leadData.name,
      lead_whatsapp: leadData.whatsapp,
      lead_instagram: leadData.instagram,
      lead_market: leadData.market,
      lead_stage: leadData.stage,
    });
    
    // Trigger server-side notification (Kommo + WhatsApp)
    // This runs in background and doesn't block the user
    try {
      const notifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-lead`;
      fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ sessionId }),
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
