import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const NOTIFY_PREF_KEY = "champion_notify_enabled";
const LAST_LEAD_KEY = "champion_last_lead_ts";

interface NewLead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  estagio_negocio: string;
  mercado: string;
  tier: string | null;
  created_at: string;
}

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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingLeadsRef = useRef<NewLead[]>([]);
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch notifications to avoid spam
  const flushNotifications = useCallback(() => {
    const leads = pendingLeadsRef.current;
    if (leads.length === 0) return;

    pendingLeadsRef.current = [];

    // Toast notification inside the app
    if (leads.length === 1) {
      const lead = leads[0];
      toast({
        title: "🔔 Novo lead!",
        description: `${lead.nome_completo} | ${lead.mercado} | ${lead.estagio_negocio}`,
      });
    } else {
      toast({
        title: `🔔 +${leads.length} novos leads!`,
        description: `Últimos: ${leads
          .slice(0, 3)
          .map((l) => l.nome_completo)
          .join(", ")}`,
      });
    }

    // Native desktop notification
    if (
      notificationsEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        const title = leads.length === 1
          ? "Novo lead no Champion"
          : `+${leads.length} novos leads no Champion`;
        const body = leads.length === 1
          ? `Nome: ${leads[0].nome_completo} | Etapa: ${leads[0].estagio_negocio}`
          : leads
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
          // Navigate to admin leads
          const highlightId = leads.length === 1 ? leads[0].id : undefined;
          if (highlightId) {
            window.location.href = `/admin?highlight=${highlightId}`;
          }
          notification.close();
        };
      } catch (err) {
        console.error("Native notification error:", err);
      }
    }

    // Callback to refresh data
    onNewLead?.();
  }, [notificationsEnabled, onNewLead]);

  const enqueueLead = useCallback(
    (lead: NewLead) => {
      pendingLeadsRef.current.push(lead);

      // Batch: wait 5 seconds to group multiple leads
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      batchTimeoutRef.current = setTimeout(() => {
        flushNotifications();
      }, 5000);
    },
    [flushNotifications]
  );

  // Subscribe to realtime leads inserts
  useEffect(() => {
    if (!isAuthenticated) return;

    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          const newLead = payload.new as NewLead;
          console.log("New lead detected:", newLead.nome_completo);
          enqueueLead(newLead);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, enqueueLead]);

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
