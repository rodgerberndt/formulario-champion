import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";

const NOTIFY_PREF_KEY = "champion_notify_enabled";
const POLL_INTERVAL_MS = 15_000; // Poll every 15 seconds

interface NewLead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  estagio_negocio: string;
  mercado: string;
  tier: string | null;
  created_at: string;
}

/**
 * Polls the admin-data endpoint for new leads and fires notifications.
 * Uses the admin JWT token for auth (no Supabase Realtime needed).
 */
export function useLeadNotifications(
  isAuthenticated: boolean,
  onNewLead?: () => void
) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem(NOTIFY_PREF_KEY) === "true";
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // Track known lead IDs to detect new arrivals
  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;

  const getToken = useCallback(() => {
    return sessionStorage.getItem("admin_analytics_token");
  }, []);

  // Fire notifications for new leads
  const notifyNewLeads = useCallback(
    (newLeads: NewLead[]) => {
      if (newLeads.length === 0) return;

      // Toast notification inside the app
      if (newLeads.length === 1) {
        const lead = newLeads[0];
        toast({
          title: "🔔 Novo lead!",
          description: `${lead.nome_completo} | ${lead.mercado} | ${lead.estagio_negocio}`,
        });
      } else {
        toast({
          title: `🔔 +${newLeads.length} novos leads!`,
          description: `Últimos: ${newLeads
            .slice(0, 3)
            .map((l) => l.nome_completo)
            .join(", ")}`,
        });
      }

      // Native desktop notification
      if (
        notificationsEnabledRef.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          const title =
            newLeads.length === 1
              ? "Novo lead no Champion"
              : `+${newLeads.length} novos leads no Champion`;
          const body =
            newLeads.length === 1
              ? `Nome: ${newLeads[0].nome_completo} | Etapa: ${newLeads[0].estagio_negocio}`
              : newLeads
                  .slice(0, 3)
                  .map((l) => `${l.nome_completo} (${l.estagio_negocio})`)
                  .join("\n");

          const notification = new Notification(title, {
            body,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: "champion-new-lead",
          } as NotificationOptions);

          notification.onclick = () => {
            window.focus();
            const highlightId =
              newLeads.length === 1 ? newLeads[0].id : undefined;
            if (highlightId) {
              window.location.href = `/admin?highlight=${highlightId}`;
            }
            notification.close();
          };
        } catch (err) {
          console.error("Native notification error:", err);
        }
      }

      // Callback to refresh data in the parent component
      onNewLead?.();
    },
    [onNewLead]
  );

  // Poll for new leads
  const pollLeads = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      // Fetch only today's leads for efficiency
      const today = new Date().toISOString().split("T")[0];
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads?from=${today}&to=${today}`;

      const response = await fetch(url, {
        headers: {
          "x-admin-token": token,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!response.ok) return;

      const leads: NewLead[] = await response.json();
      const currentIds = new Set(leads.map((l) => l.id));

      if (isFirstPollRef.current) {
        // First poll: just seed known IDs, don't notify
        knownLeadIdsRef.current = currentIds;
        isFirstPollRef.current = false;
        return;
      }

      // Find truly new leads (IDs not previously known)
      const newLeads = leads.filter(
        (l) => !knownLeadIdsRef.current.has(l.id)
      );

      // Update known set
      knownLeadIdsRef.current = currentIds;

      if (newLeads.length > 0) {
        console.log(
          `[LeadNotifications] ${newLeads.length} new lead(s) detected:`,
          newLeads.map((l) => l.nome_completo)
        );
        notifyNewLeads(newLeads);
      }
    } catch (err) {
      console.error("[LeadNotifications] Poll error:", err);
    }
  }, [getToken, notifyNewLeads]);

  // Start/stop polling based on authentication
  useEffect(() => {
    if (!isAuthenticated) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isFirstPollRef.current = true;
      knownLeadIdsRef.current = new Set();
      return;
    }

    // Initial poll
    pollLeads();

    // Set up interval
    pollIntervalRef.current = setInterval(pollLeads, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, pollLeads]);

  // Toggle notifications
  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      // Enable - request permission first
      if (typeof Notification !== "undefined") {
        const permission = await Notification.requestPermission();
        setPermissionState(permission);
        if (permission === "granted") {
          setNotificationsEnabled(true);
          localStorage.setItem(NOTIFY_PREF_KEY, "true");
          toast({
            title: "Notificações ativadas! 🔔",
            description: "Você receberá alertas quando novos leads chegarem.",
          });
        } else {
          toast({
            title: "Permissão negada",
            description:
              "Ative as notificações nas configurações do navegador.",
            variant: "destructive",
          });
        }
      }
    } else {
      // Disable
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIFY_PREF_KEY, "false");
      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais alertas de novos leads.",
      });
    }
  }, [notificationsEnabled]);

  return {
    notificationsEnabled,
    permissionState,
    toggleNotifications,
  };
}
