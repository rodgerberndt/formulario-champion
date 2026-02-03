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
  trackStepNext: (fromStep: string, toStep: string) => Promise<void>;
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

function getUTMParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
  };
}

// Helper to update session via direct REST API call to bypass type validation
async function updateSessionDirect(sessionId: string, data: Record<string, unknown>) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/lead_sessions?id=eq.${sessionId}`;
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        ...data,
        last_seen_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      console.error("Error updating session:", await response.text());
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
            utm_source: utmParams.utm_source,
            utm_medium: utmParams.utm_medium,
            utm_campaign: utmParams.utm_campaign,
            utm_content: utmParams.utm_content,
            utm_term: utmParams.utm_term,
            device_type: getDeviceType(),
            user_agent: navigator.userAgent,
          }),
        });
        
        if (!response.ok) {
          console.error("Error creating session:", await response.text());
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

  // Track step next
  const trackStepNext = useCallback(async (fromStep: string, toStep: string) => {
    await trackEvent("step_next", {
      stepId: toStep,
      metadata: { from_step: fromStep, to_step: toStep },
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
    await trackEvent("submit");
    await updateSession({
      completed: true,
      lead_name: leadData.name,
      lead_whatsapp: leadData.whatsapp,
      lead_instagram: leadData.instagram,
      lead_market: leadData.market,
      lead_stage: leadData.stage,
    });
  }, [trackEvent, updateSession]);

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
