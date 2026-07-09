import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";

const NOTIFY_PREF_KEY = "champion_notify_enabled";
const POLL_INTERVAL_MS = 15_000; // Poll every 15 seconds
const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

/** Converts a VAPID public key (base64url) into the Uint8Array format required by pushManager.subscribe(). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function safeFetchAdminList<T>(url: string, headers: Record<string, string>, label: string): Promise<T[]> {
  try {
    const response = await fetchAdmin(url, { headers });
    if (response.ok) return response.json();

    if (TRANSIENT_STATUS_CODES.has(response.status)) {
      console.warn(`[Notifications] ${label} temporariamente indisponível (${response.status}); mantendo polling ativo.`);
      return [];
    }

    console.warn(`[Notifications] Falha ao carregar ${label}: ${response.status}`);
    return [];
  } catch (error) {
    if (error instanceof Error && error.message === "Sessão expirada") throw error;
    console.warn(`[Notifications] Falha temporária ao carregar ${label}:`, error);
    return [];
  }
}

/** Plays a bright ascending chime for new (non-MQL) leads */
function playLeadSound() {
  try {
    const audio = new Audio("/newlead.wav");
    audio.volume = 0.7;
    audio.play().catch((err) => console.warn("Could not play lead sound:", err));
  } catch (err) {
    console.warn("Could not play lead sound:", err);
  }
}

/** Plays a triumphant victory fanfare for MQL leads (synthesized via Web Audio API) */
function playMqlSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Victory fanfare: C5 → E5 → G5 → C6 (major arpeggio ascending)
    const notes = [
      { freq: 523.25, start: 0.00, dur: 0.18 }, // C5
      { freq: 659.25, start: 0.15, dur: 0.18 }, // E5
      { freq: 783.99, start: 0.30, dur: 0.22 }, // G5
      { freq: 1046.5, start: 0.50, dur: 0.55 }, // C6 (sustained)
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + start);

      // ADSR envelope
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0.25, now + start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    });

    // Add a subtle bell harmonic on the final note
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = "sine";
    bell.frequency.setValueAtTime(2093, now + 0.50); // C7
    bellGain.gain.setValueAtTime(0, now + 0.50);
    bellGain.gain.linearRampToValueAtTime(0.15, now + 0.52);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 1.10);
    bell.connect(bellGain);
    bellGain.connect(ctx.destination);
    bell.start(now + 0.50);
    bell.stop(now + 1.15);

    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch (err) {
    console.warn("Could not play MQL sound:", err);
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
  investimento_faixa?: string | null;
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

const MQL_FAIXAS = new Set([
  "De R$ 10 mil a R$ 20 mil",
  "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil",
  "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil",
  "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
]);

function isMqlLead(lead: NewLead): boolean {
  if (lead.investimento_faixa && MQL_FAIXAS.has(lead.investimento_faixa)) return true;
  const t = (lead.tier || "").toLowerCase();
  return t === "large" || t.startsWith("enterprise");
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
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  const knownSaleIdsRef = useRef<Set<string>>(new Set());
  const knownMeetingIdsRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;

  const getToken = useCallback(() => getAdminToken(), []);

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

  // ── Notify new leads (split MQL vs non-MQL for distinct sounds) ──
  const notifyNewLeads = useCallback(
    (newLeads: NewLead[]) => {
      if (newLeads.length === 0) return;

      const mqlLeads = newLeads.filter(isMqlLead);
      const normalLeads = newLeads.filter((l) => !isMqlLead(l));

      // Play victory sound for MQLs, normal chime for the rest
      if (mqlLeads.length > 0) playMqlSound();
      if (normalLeads.length > 0) playLeadSound();

      if (newLeads.length === 1) {
        const lead = newLeads[0];
        const isMql = mqlLeads.length === 1;
        toast({
          title: isMql ? "🏆 Novo MQL!" : "🔔 Novo lead!",
          description: `${lead.nome_completo} | ${lead.mercado} | ${lead.estagio_negocio}`,
        });
      } else {
        toast({
          title: `🔔 +${newLeads.length} novos leads!${mqlLeads.length > 0 ? ` (${mqlLeads.length} MQL 🏆)` : ""}`,
          description: `Últimos: ${newLeads.slice(0, 3).map((l) => l.nome_completo).join(", ")}`,
        });
      }

      const title = newLeads.length === 1
        ? (mqlLeads.length === 1 ? "🏆 Novo MQL no Champion" : "Novo lead no Champion")
        : `+${newLeads.length} novos leads no Champion${mqlLeads.length > 0 ? ` (${mqlLeads.length} MQL)` : ""}`;
      const body = newLeads.length === 1
        ? `Nome: ${newLeads[0].nome_completo} | Etapa: ${newLeads[0].estagio_negocio}`
        : newLeads.slice(0, 3).map((l) => `${l.nome_completo} (${l.estagio_negocio})`).join("\n");
      sendNativeNotification(title, body, mqlLeads.length > 0 ? "champion-new-mql" : "champion-new-lead");

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

      // Fetch leads, sales, and meetings independently so one transient 503 doesn't break the whole admin screen
      const [leads, sales, meetings] = await Promise.all([
        safeFetchAdminList<NewLead>(`${baseUrl}/leads?from=${today}&to=${today}`, headers, "leads"),
        safeFetchAdminList<SaleRecord>(`${baseUrl}/manual-sales?from=${today}&to=${today}`, headers, "vendas"),
        safeFetchAdminList<MeetingRecord>(`${baseUrl}/meetings?from=${today}&to=${today}`, headers, "reuniões"),
      ]);

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
      if (err instanceof Error && err.message === "Sessão expirada") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }
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

  // Fetch how many devices are actively subscribed to background push
  const fetchSubscriberCount = useCallback(async () => {
    try {
      const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/subscriptions`;
      const res = await fetchAdmin(pushUrl);
      if (res.ok) {
        const data = await res.json();
        setSubscriberCount(typeof data.count === "number" ? data.count : null);
      }
    } catch (err) {
      console.warn("[Push] Failed to fetch subscriber count:", err);
    }
  }, []);

  // Subscribes this browser to real background push (delivers even with the tab/app closed)
  const subscribeToPush = useCallback(async (): Promise<boolean> => {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) {
      console.warn("[Push] Push API or VAPID key unavailable in this browser/build.");
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }
      const json = subscription.toJSON();
      const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/subscribe`;
      const res = await fetchAdmin(pushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          label: navigator.userAgent.slice(0, 80),
        }),
      });
      setPushSubscribed(res.ok);
      return res.ok;
    } catch (err) {
      console.error("[Push] Subscribe failed:", err);
      return false;
    }
  }, []);

  // Unsubscribes this browser from background push
  const unsubscribeFromPush = useCallback(async (): Promise<void> => {
    try {
      if (!("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/unsubscribe`;
        await fetchAdmin(pushUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
    } finally {
      setPushSubscribed(false);
    }
  }, []);

  // Check existing subscription state on mount / when auth becomes available
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchSubscriberCount();
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(!!sub))
      .catch(() => {});
  }, [isAuthenticated, fetchSubscriberCount]);

  // Toggle notifications: local permission + real background push subscription
  const toggleNotifications = useCallback(async () => {
    if (!notificationsEnabled) {
      if (typeof Notification !== "undefined") {
        const permission = await Notification.requestPermission();
        setPermissionState(permission);
        if (permission === "granted") {
          setNotificationsEnabled(true);
          localStorage.setItem(NOTIFY_PREF_KEY, "true");
          const subscribed = await subscribeToPush();
          toast({
            title: "Notificações ativadas! 🔔",
            description: subscribed
              ? "Você vai receber alertas de leads, vendas e reuniões — mesmo com o app fechado."
              : "Alertas ativos nesta aba. Não foi possível habilitar o push em segundo plano.",
          });
          fetchSubscriberCount();
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
      await unsubscribeFromPush();
      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais alertas.",
      });
      fetchSubscriberCount();
    }
  }, [notificationsEnabled, subscribeToPush, unsubscribeFromPush, fetchSubscriberCount]);

  const sendWebPush = useCallback(async (title: string, body: string, sound?: string) => {
    try {
      const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/send`;
      await fetchAdmin(pushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, sound }),
      });
    } catch (err) {
      console.warn("[Push] Failed to send web push:", err);
    }
  }, []);

  // Deterministic test: fires one real local notification + one real push, no dependency on historical data
  const testNotifications = useCallback(async () => {
    playLeadSound();
    toast({
      title: "🧪 Notificação de teste disparada",
      description: "Se você ouviu o som e recebeu o alerta, está tudo funcionando.",
    });
    sendNativeNotification(
      "🧪 Teste — Champion Hub",
      "Esta é uma notificação de teste local.",
      "champion-test"
    );
    await sendWebPush(
      "🧪 Notificação de teste",
      "Se você recebeu esta notificação em segundo plano, o push está funcionando corretamente.",
      "newlead"
    );
  }, [sendNativeNotification, sendWebPush]);

  return {
    notificationsEnabled,
    permissionState,
    pushSubscribed,
    subscriberCount,
    toggleNotifications,
    testNotifications,
    sendWebPush,
  };
}
