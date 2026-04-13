import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";

const NOTIFY_PREF_KEY = "champion_notify_enabled";
const POLL_INTERVAL_MS = 15_000; // Poll every 15 seconds

/** Plays a bright ascending chime for new leads */
function playLeadSound() {
  try {
    const audio = new Audio("/newlead.wav");
    audio.volume = 0.7;
    audio.play().catch((err) => console.warn("Could not play lead sound:", err));
  } catch (err) {
    console.warn("Could not play lead sound:", err);
  }
}

/** Plays a Kiwify-style "ka-ching!" cash register sound for sales */
function playSaleSound() {
  try {
    const audio = new Audio("/cashregister.mp3");
    audio.volume = 0.8;
    audio.play().catch((err) => console.warn("Could not play sale sound:", err));
  } catch (err) {
    console.warn("Could not play sale sound:", err);
  }
}

/** Plays a calm double-tap notification for meetings */
function playMeetingSound() {
  try {
    const audio = new Audio("/meeting.wav");
    audio.volume = 0.7;
    audio.play().catch((err) => console.warn("Could not play meeting sound:", err));
  } catch (err) {
    console.warn("Could not play meeting sound:", err);
  }
}

interface NewLead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  estagio_negocio: string;
  mercado: string;
  tier: string | null;
  created_at: string;
}

interface SaleRecord {
  id: string;
  sale_type: string;
  revenue: number;
  sale_date: string;
  notes: string | null;
  lead_id: string | null;
  created_at: string;
}

interface MeetingRecord {
  id: string;
  notes: string | null;
  lead_id: string | null;
  attended: boolean;
  created_at: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Polls the admin-data endpoint for new leads, sales, and meetings and fires notifications.
 */
export function useLeadNotifications(
  isAuthenticated: boolean,
  onNewLead?: () => void,
  onAuthError?: () => void
) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem(NOTIFY_PREF_KEY) === "true";
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  const knownSaleIdsRef = useRef<Set<string>>(new Set());
  const knownMeetingIdsRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;

  const getToken = useCallback(() => {
    return sessionStorage.getItem("admin_analytics_token");
  }, []);

  const sendNativeNotification = useCallback((title: string, body: string, tag: string) => {
    if (
      !notificationsEnabledRef.current ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) return;

    try {
      const notification = new Notification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
      } as NotificationOptions);

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error("Native notification error:", err);
    }
  }, []);

  // ── Notify new leads ──
  const notifyNewLeads = useCallback(
    (newLeads: NewLead[]) => {
      if (newLeads.length === 0) return;
      playLeadSound();

      if (newLeads.length === 1) {
        const lead = newLeads[0];
        toast({
          title: "🔔 Novo lead!",
          description: `${lead.nome_completo} | ${lead.mercado} | ${lead.estagio_negocio}`,
        });
      } else {
        toast({
          title: `🔔 +${newLeads.length} novos leads!`,
          description: `Últimos: ${newLeads.slice(0, 3).map((l) => l.nome_completo).join(", ")}`,
        });
      }

      const title = newLeads.length === 1
        ? "Novo lead no Champion"
        : `+${newLeads.length} novos leads no Champion`;
      const body = newLeads.length === 1
        ? `Nome: ${newLeads[0].nome_completo} | Etapa: ${newLeads[0].estagio_negocio}`
        : newLeads.slice(0, 3).map((l) => `${l.nome_completo} (${l.estagio_negocio})`).join("\n");
      sendNativeNotification(title, body, "champion-new-lead");

      onNewLead?.();
    },
    [onNewLead, sendNativeNotification]
  );

  // ── Notify new sales ──
  const notifyNewSales = useCallback(
    (newSales: SaleRecord[]) => {
      if (newSales.length === 0) return;
      playSaleSound();

      for (const sale of newSales) {
        const typeLabel = sale.sale_type === "assessoria" ? "Assessoria" : "Sprint";
        toast({
          title: `💰 Nova venda ${typeLabel}!`,
          description: `${formatCurrency(sale.revenue)}${sale.notes ? ` — ${sale.notes}` : ""}`,
        });
      }

      const total = newSales.reduce((s, v) => s + v.revenue, 0);
      const title = newSales.length === 1
        ? `💰 Nova venda ${newSales[0].sale_type === "assessoria" ? "Assessoria" : "Sprint"}!`
        : `💰 +${newSales.length} novas vendas!`;
      const body = newSales.length === 1
        ? `Ticket: ${formatCurrency(newSales[0].revenue)}`
        : `Total: ${formatCurrency(total)} (${newSales.length} vendas)`;
      sendNativeNotification(title, body, "champion-new-sale");

      onNewLead?.();
    },
    [onNewLead, sendNativeNotification]
  );

  // ── Notify new meetings ──
  const notifyNewMeetings = useCallback(
    (newMeetings: MeetingRecord[]) => {
      if (newMeetings.length === 0) return;
      playMeetingSound();

      if (newMeetings.length === 1) {
        toast({
          title: "📅 Reunião agendada!",
          description: newMeetings[0].notes || "Nova reunião registrada",
        });
      } else {
        toast({
          title: `📅 +${newMeetings.length} reuniões agendadas!`,
          description: `${newMeetings.length} novas reuniões registradas`,
        });
      }

      const title = newMeetings.length === 1 ? "📅 Reunião agendada!" : `📅 +${newMeetings.length} reuniões!`;
      const body = newMeetings.length === 1
        ? (newMeetings[0].notes || "Nova reunião registrada")
        : `${newMeetings.length} novas reuniões registradas`;
      sendNativeNotification(title, body, "champion-new-meeting");

      onNewLead?.();
    },
    [onNewLead, sendNativeNotification]
  );

  // Poll for new leads, sales, and meetings
  const pollAll = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const today = new Date().toISOString().split("T")[0];
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`;
      const headers = {
        "x-admin-token": token,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };

      // Fetch leads, sales, and meetings in parallel
      const [leadsRes, salesRes, meetingsRes] = await Promise.all([
        fetch(`${baseUrl}/leads?from=${today}&to=${today}`, { headers }),
        fetch(`${baseUrl}/manual-sales?from=${today}&to=${today}`, { headers }),
        fetch(`${baseUrl}/meetings?from=${today}&to=${today}`, { headers }),
      ]);

      if (!leadsRes.ok && leadsRes.status === 401) {
        console.log("[Notifications] Token expired, stopping polling");
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        onAuthError?.();
        return;
      }

      const leads: NewLead[] = leadsRes.ok ? await leadsRes.json() : [];
      const sales: SaleRecord[] = salesRes.ok ? await salesRes.json() : [];
      const meetings: MeetingRecord[] = meetingsRes.ok ? await meetingsRes.json() : [];

      const currentLeadIds = new Set(leads.map((l) => l.id));
      const currentSaleIds = new Set(sales.map((s) => s.id));
      const currentMeetingIds = new Set(meetings.map((m) => m.id));

      if (isFirstPollRef.current) {
        knownLeadIdsRef.current = currentLeadIds;
        knownSaleIdsRef.current = currentSaleIds;
        knownMeetingIdsRef.current = currentMeetingIds;
        isFirstPollRef.current = false;
        return;
      }

      // Detect new items
      const newLeads = leads.filter((l) => !knownLeadIdsRef.current.has(l.id));
      const newSales = sales.filter((s) => !knownSaleIdsRef.current.has(s.id));
      const newMeetings = meetings.filter((m) => !knownMeetingIdsRef.current.has(m.id));

      // Update known sets
      knownLeadIdsRef.current = currentLeadIds;
      knownSaleIdsRef.current = currentSaleIds;
      knownMeetingIdsRef.current = currentMeetingIds;

      if (newLeads.length > 0) {
        console.log(`[Notifications] ${newLeads.length} new lead(s)`);
        notifyNewLeads(newLeads);
      }
      if (newSales.length > 0) {
        console.log(`[Notifications] ${newSales.length} new sale(s)`);
        notifyNewSales(newSales);
      }
      if (newMeetings.length > 0) {
        console.log(`[Notifications] ${newMeetings.length} new meeting(s)`);
        notifyNewMeetings(newMeetings);
      }
    } catch (err) {
      console.error("[Notifications] Poll error:", err);
    }
  }, [getToken, notifyNewLeads, notifyNewSales, notifyNewMeetings, onAuthError]);

  // Start/stop polling based on authentication
  useEffect(() => {
    if (!isAuthenticated) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isFirstPollRef.current = true;
      knownLeadIdsRef.current = new Set();
      knownSaleIdsRef.current = new Set();
      knownMeetingIdsRef.current = new Set();
      return;
    }

    pollAll();
    pollIntervalRef.current = setInterval(pollAll, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, pollAll]);

  // Toggle notifications
  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      if (typeof Notification !== "undefined") {
        const permission = await Notification.requestPermission();
        setPermissionState(permission);
        if (permission === "granted") {
          setNotificationsEnabled(true);
          localStorage.setItem(NOTIFY_PREF_KEY, "true");
          toast({
            title: "Notificações ativadas! 🔔",
            description: "Você receberá alertas de leads, vendas e reuniões.",
          });
        } else {
          toast({
            title: "Permissão negada",
            description: "Ative as notificações nas configurações do navegador.",
            variant: "destructive",
          });
        }
      }
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIFY_PREF_KEY, "false");
      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais alertas.",
      });
    }
  }, [notificationsEnabled]);

  // Test function: fires notifications for existing sales/meetings without creating anything
  const sendWebPush = useCallback(async (title: string, body: string) => {
    try {
      const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/send`;
      await fetch(pushUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ title, body }),
      });
    } catch (err) {
      console.warn("[Push] Failed to send web push:", err);
    }
  }, []);

  const testNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`;
    const headers = {
      "x-admin-token": token,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };

    try {
      const [salesRes, meetingsRes] = await Promise.all([
        fetch(`${baseUrl}/manual-sales?from=2026-04-01&to=2026-04-13`, { headers }),
        fetch(`${baseUrl}/meetings?from=2026-04-01T00:00:00Z&to=2026-04-13T23:59:59Z`, { headers }),
      ]);

      const sales: SaleRecord[] = salesRes.ok ? await salesRes.json() : [];
      const meetings: MeetingRecord[] = meetingsRes.ok ? await meetingsRes.json() : [];

      // Fire in-app notifications (sounds + toasts)
      if (sales.length > 0) notifyNewSales(sales.slice(0, 3));
      if (meetings.length > 0) {
        setTimeout(() => notifyNewMeetings(meetings.slice(0, 2)), 3000);
      }

      // Fire real web push notifications
      if (sales.length > 0) {
        const sale = sales[0];
        const typeLabel = sale.sale_type === "assessoria" ? "Assessoria" : "Sprint";
        await sendWebPush(
          `💰 Nova venda ${typeLabel}!`,
          `Ticket: ${formatCurrency(sale.revenue)}${sale.notes ? ` — ${sale.notes}` : ""}`
        );
      }
      if (meetings.length > 0) {
        await sendWebPush(
          "📅 Reunião agendada!",
          meetings[0].notes || "Nova reunião registrada"
        );
      }

      toast({
        title: "🧪 Teste disparado",
        description: `${sales.length} vendas e ${meetings.length} reuniões encontradas. Push enviado!`,
      });
    } catch (err) {
      console.error("Test notification error:", err);
    }
  }, [getToken, notifyNewSales, notifyNewMeetings, sendWebPush]);

  return {
    notificationsEnabled,
    permissionState,
    toggleNotifications,
    testNotifications,
  };
}
