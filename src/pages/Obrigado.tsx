import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Declare fbq for TypeScript
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const RESULT_STORAGE_KEY = "champion_quiz_result";

export default function Obrigado() {
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem(RESULT_STORAGE_KEY);
    if (saved) {
      try {
        // Fire CompleteRegistration pixel before redirect
        if (typeof window.fbq === 'function') {
          let eventID: string | undefined;
          try {
            const stored = localStorage.getItem('champion_event_ids');
            if (stored) {
              const parsedIds = JSON.parse(stored);
              eventID = parsedIds.event_ids?.CompleteRegistration;
            }
          } catch { /* ignore */ }

          window.fbq('track', 'CompleteRegistration', {}, { eventID });
          console.log('Facebook Pixel: CompleteRegistration event fired with eventID:', eventID);
        }

        // Immediate redirect — no page rendered
        window.location.replace("https://education.championadstudio.com");
      } catch {
        navigate("/quiz");
      }
    } else {
      navigate("/quiz");
    }
  }, [navigate]);

  // Never renders the thank-you page content
  return null;
}
