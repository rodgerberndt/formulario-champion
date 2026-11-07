import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";

const NOTIFY_PREF_KEY = "champion_notify_enabled";
/**
 * Quem é o dono DESTE aparelho.
 *
 * Fica no localStorage porque o navegador reinscreve sozinho quando a inscrição
 * expira (o Chrome troca o endpoint de tempos em tempos), e nessa hora não há
 * ninguém na tela para perguntar de novo. Sem isso a inscrição voltaria anônima
 * e a pessoa pararia de receber os leads dela sem perceber.
 */
const PUSH_PESSOA_KEY = "champion_push_pessoa";

/**
 * Identidade fixa do aparelho. O endpoint de push muda (reinstalar o app, o iOS
 * refazer a inscrição) e cada troca virava uma linha nova na lista; com o id o
 * servidor mantém uma linha por aparelho.
 */
const DEVICE_ID_KEY = "champion_device_id";
export function idDesteAparelho(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Texto exato pedido pelo Rodger em 14/09/2026. */
export const ALERTA_NOTIFICACOES = "Ative as Notificações para Quando Leads Caírem🛑";

/** Quem pode receber push. Espelha PESSOAS em supabase/functions/_shared/roteamento.ts. */
export const PESSOAS_PUSH = ["Miguel", "Caio", "Guguinha", "Rodger"] as const;
export type PessoaPush = (typeof PESSOAS_PUSH)[number];

export function pessoaDesteAparelho(): PessoaPush | null {
  try {
    const v = localStorage.getItem(PUSH_PESSOA_KEY);
    return (PESSOAS_PUSH as readonly string[]).includes(v || "") ? (v as PessoaPush) : null;
  } catch {
    return null;
  }
}

/**
 * O app está instalado na tela de início?
 *
 * No iPhone o push simplesmente não existe fora do modo standalone — não é
 * limitação nossa, é da Apple. Sem esta checagem o Miguel ativaria as
 * notificações no Safari, não receberia nada, e não haveria como ele saber por
 * quê.
 */
export function estaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return !!standalone || !!iosStandalone;
}

export function ehIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Tag da notificação de um lead. A MESMA regra do notify-lead (últimos 11
 * dígitos do WhatsApp): o lead avisado pelo push do servidor e pelo polling
 * desta aba vira uma notificação só.
 */
export function tagDoLead(whatsapp: string | null | undefined, fallback: string): string {
  const d = String(whatsapp || "").replace(/\D/g, "").slice(-11);
  return d ? `lead-${d}` : `lead-${fallback}`;
}

export interface DispositivoPush {
  id: string;
  device_id: string | null;
  pessoa: string | null;
  label: string | null;
  last_used_at: string | null;
  last_received_at: string | null;
  created_at: string;
}

export interface ResultadoEnvio {
  ok: boolean;
  sent: number;
  total: number;
  motivo?: string;
}

type EventoInstalacao =Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

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

/**
 * Chamada ao web-push FORA da fila do fetchAdmin.
 *
 * O fetchAdmin serializa todas as requisições do painel numa fila única. O
 * botão Testar e o aviso personalizado esperavam cada carregamento de aba
 * terminar antes de sair — era a demora de vários segundos que o Rodger viu no
 * iPhone em 14/09/2026. Push é um POST pequeno e não disputa com nada.
 */
async function fetchPush(caminho: string, init: RequestInit = {}): Promise<Response> {
  const token = getAdminToken();
  if (!token) throw new Error("Sessão expirada");
  const headers = new Headers(init.headers);
  headers.set("x-admin-token", token);
  headers.set("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push${caminho}`, { ...init, headers });
}

/**
 * Busca a lista, ou `null` quando a busca FALHOU.
 *
 * A diferença entre "não tem nada" e "não deu para saber" é o bug que fazia o
 * painel tocar o som sem lead novo: antes, um 503 passageiro devolvia lista
 * vazia, o conjunto de ids conhecidos era sobrescrito com vazio, e no poll
 * seguinte TODOS os leads do dia voltavam a parecer novos. O alarme tocava por
 * gente que já estava lá desde de manhã.
 *
 * Devolvendo `null`, quem chama sabe que não deve concluir nada daquele ciclo.
 */
async function safeFetchAdminList<T>(url: string, headers: Record<string, string>, label: string): Promise<T[] | null> {
  try {
    const response = await fetchAdmin(url, { headers });
    if (response.ok) return response.json();

    if (TRANSIENT_STATUS_CODES.has(response.status)) {
      console.warn(`[Notifications] ${label} temporariamente indisponível (${response.status}); mantendo polling ativo.`);
      return null;
    }

    console.warn(`[Notifications] Falha ao carregar ${label}: ${response.status}`);
    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "Sessão expirada") throw error;
    console.warn(`[Notifications] Falha temporária ao carregar ${label}:`, error);
    return null;
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

/** Mesmo corpo do push do servidor (notify-lead): faturamento, nicho, etapa. */
function corpoDoLead(lead: NewLead): string {
  return [
    `💰 ${lead.investimento_faixa || "Faturamento não informado"}`,
    `🎯 ${lead.mercado || "Nicho não informado"}`,
    lead.estagio_negocio ? `📍 ${lead.estagio_negocio}` : null,
  ].filter(Boolean).join("\n");
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
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission | "indisponivel">(
    typeof Notification !== "undefined" ? Notification.permission : "indisponivel"
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [dispositivos, setDispositivos] = useState<DispositivoPush[]>([]);
  const [podeInstalar, setPodeInstalar] = useState(
    () => typeof window !== "undefined" && !!(window as unknown as { __championInstallPrompt?: Event }).__championInstallPrompt,
  );

  /**
   * Quando esta aba começou a observar.
   *
   * Segunda trava contra alarme falso, independente da primeira: nada que
   * EXISTIA antes de a aba abrir pode tocar o alarme, aconteça o que acontecer
   * com os conjuntos de ids. Sem isto, qualquer caminho novo que ressuscite a
   * lista volta a acordar o time por lead de duas horas atrás.
   */
  const sessaoIniciadaEmRef = useRef<number>(Date.now());

  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  const knownSaleIdsRef = useRef<Set<string>>(new Set());
  const knownMeetingIdsRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;
  /** Tags que o push do servidor já mostrou neste aparelho (avisadas pelo sw.js). */
  const tagsDoPushRef = useRef<Set<string>>(new Set());
  const alertaMostradoRef = useRef(false);

  const getToken = useCallback(() => getAdminToken(), []);

  const sendNativeNotification = useCallback(async (title: string, body: string, tag: string) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // O servidor já avisou este lead por push: repetir seria tocar duas vezes.
    if (tagsDoPushRef.current.has(tag)) return;

    /**
     * Pelo SERVICE WORKER, não por `new Notification`.
     *
     * `new Notification()` cria uma notificação presa à página: ela some quando
     * o navegador tira a aba de foco, o Chrome a ignora no Android, e no
     * Windows ela não chega à Central de Ações. `registration.showNotification()`
     * entrega ao SISTEMA OPERACIONAL, com o navegador minimizado ou outra aba
     * em foco.
     *
     * Isto é a rede de baixo: depende da aba viva. Aba descartada pela economia
     * de memória não roda polling nenhum — quem cobre esse caso é o Web Push.
     */
    const opcoes: NotificationOptions = {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      requireInteraction: true,
      data: { url: "/admin" },
    };

    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const jaNaTela = await reg.getNotifications({ tag }).catch(() => []);
        if (jaNaTela.length > 0) return;
        await reg.showNotification(title, opcoes);
        return;
      } catch (err) {
        console.warn("[Notificações] SW falhou, caindo para a API da página:", err);
      }
    }

    try {
      const notification = new Notification(title, opcoes);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.error("Native notification error:", err);
    }
  }, []);

  // O service worker avisa as abas de todo push que mostrou.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const aoReceber = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.origem !== "champion-sw" || msg.tipo !== "push" || !msg.tag) return;
      tagsDoPushRef.current.add(msg.tag);
      if (msg.tipoPush === "lead") {
        // Chegou pelo push antes do polling: atualiza a lista na hora.
        onNewLead?.();
      }
    };
    navigator.serviceWorker.addEventListener("message", aoReceber);
    navigator.serviceWorker.startMessages?.();
    return () => navigator.serviceWorker.removeEventListener("message", aoReceber);
  }, [onNewLead]);

  // Botão "Instalar app" (Chrome no Android e no PC). O evento é guardado no
  // index.html porque dispara antes de este chunk carregar.
  useEffect(() => {
    const disponivel = () => setPodeInstalar(true);
    const instalado = () => {
      setPodeInstalar(false);
      (window as unknown as { __championInstallPrompt?: Event }).__championInstallPrompt = undefined;
    };
    window.addEventListener("champion-install-disponivel", disponivel);
    window.addEventListener("appinstalled", instalado);
    return () => {
      window.removeEventListener("champion-install-disponivel", disponivel);
      window.removeEventListener("appinstalled", instalado);
    };
  }, []);

  const instalarApp = useCallback(async () => {
    const w = window as unknown as { __championInstallPrompt?: EventoInstalacao };
    const ev = w.__championInstallPrompt;
    if (!ev) return false;
    await ev.prompt();
    const escolha = await ev.userChoice.catch(() => ({ outcome: "dismissed" }));
    if (escolha.outcome === "accepted") {
      w.__championInstallPrompt = undefined;
      setPodeInstalar(false);
      return true;
    }
    return false;
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
          description: `${lead.nome_completo} | ${lead.mercado} | ${lead.investimento_faixa || lead.estagio_negocio}`,
        });
      } else {
        toast({
          title: `🔔 +${newLeads.length} novos leads!${mqlLeads.length > 0 ? ` (${mqlLeads.length} MQL 🏆)` : ""}`,
          description: `Últimos: ${newLeads.slice(0, 3).map((l) => l.nome_completo).join(", ")}`,
        });
      }

      // Uma notificação POR lead, com a mesma tag do push do servidor. Agrupar
      // vários num "+3 leads" impediria casar com o push de cada um e o
      // aparelho tocaria duas vezes.
      for (const lead of newLeads) {
        const mql = isMqlLead(lead);
        void sendNativeNotification(
          mql ? `🏆 MQL caiu: ${lead.nome_completo}` : `🚀 Lead caiu: ${lead.nome_completo}`,
          corpoDoLead(lead),
          tagDoLead(lead.whatsapp, lead.id),
        );
      }

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
      void sendNativeNotification(title, body, `champion-sale-${newSales[0].id}`);

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
      void sendNativeNotification(title, body, `champion-meeting-${newMeetings[0].id}`);

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
        // `resumo=1`: só os oito campos de `NewLead`, sem atribuição nem nomes
        // de anúncio. Perguntar "chegou alguém novo?" não precisa do trabalho
        // que monta a tela — e fazia essa pergunta custar 1.080 ms a cada 15 s.
        safeFetchAdminList<NewLead>(`${baseUrl}/leads?from=${today}&to=${today}&resumo=1`, headers, "leads"),
        safeFetchAdminList<SaleRecord>(`${baseUrl}/manual-sales?from=${today}&to=${today}`, headers, "vendas"),
        safeFetchAdminList<MeetingRecord>(`${baseUrl}/meetings?from=${today}&to=${today}`, headers, "reuniões"),
      ]);

      // Ciclo em que TUDO falhou não ensina nada: sair sem mexer em nada.
      if (leads === null && sales === null && meetings === null) return;

      if (isFirstPollRef.current) {
        if (leads) knownLeadIdsRef.current = new Set(leads.map((l) => l.id));
        if (sales) knownSaleIdsRef.current = new Set(sales.map((s) => s.id));
        if (meetings) knownMeetingIdsRef.current = new Set(meetings.map((m) => m.id));
        // Só encerra a primeira rodada quando as três listas chegaram. Marcar
        // como "já vi" o que não foi visto é o que ressuscita o alarme falso.
        if (leads && sales && meetings) isFirstPollRef.current = false;
        return;
      }

      // Lista que falhou fica de fora do ciclo, sem apagar o que já se sabia.
      // Só é "novo" o que nasceu depois de a aba abrir. Um lead da manhã que
      // reaparecer na lista por qualquer motivo não toca nada.
      const nasceuAgora = (iso: string | null | undefined) => {
        if (!iso) return false;
        const t = Date.parse(iso);
        return Number.isFinite(t) && t >= sessaoIniciadaEmRef.current;
      };
      const newLeads = leads
        ? leads.filter((l) => !knownLeadIdsRef.current.has(l.id) && nasceuAgora(l.created_at))
        : [];
      const newSales = sales ? sales.filter((s) => !knownSaleIdsRef.current.has(s.id)) : [];
      const newMeetings = meetings ? meetings.filter((m) => !knownMeetingIdsRef.current.has(m.id)) : [];

      if (leads) knownLeadIdsRef.current = new Set(leads.map((l) => l.id));
      if (sales) knownSaleIdsRef.current = new Set(sales.map((s) => s.id));
      if (meetings) knownMeetingIdsRef.current = new Set(meetings.map((m) => m.id));

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

  const [pessoa, setPessoa] = useState<PessoaPush | null>(() => pessoaDesteAparelho());

  // Lista de aparelhos inscritos, com a última confirmação de recebimento.
  const fetchSubscriberCount = useCallback(async () => {
    try {
      const pushUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/subscriptions`;
      const res = await fetchAdmin(pushUrl);
      if (res.ok) {
        const data = await res.json();
        setSubscriberCount(typeof data.count === "number" ? data.count : null);
        setDispositivos(Array.isArray(data.subscriptions) ? data.subscriptions : []);
      }
    } catch (err) {
      console.warn("[Push] Failed to fetch subscriber count:", err);
    }
  }, []);

  // Subscribes this browser to real background push (delivers even with the tab/app closed)
  const subscribeToPush = useCallback(async (pessoa?: PessoaPush | null): Promise<boolean> => {
    const quem = pessoa || pessoaDesteAparelho();
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
          // `label` é o APARELHO e `pessoa` é quem recebe.
          label: navigator.userAgent.slice(0, 80),
          pessoa: quem || null,
          device_id: idDesteAparelho(),
        }),
      });
      if (res.ok && quem) {
        try { localStorage.setItem(PUSH_PESSOA_KEY, quem); } catch { /* modo privado */ }
      }
      setPushSubscribed(res.ok);
      return res.ok;
    } catch (err) {
      console.error("[Push] Subscribe failed:", err);
      return false;
    }
  }, []);

  /**
   * Permissão + inscrição, sem depender de ninguém lembrar de clicar.
   *
   * Pedido do Rodger em 14/09/2026: o painel pergunta sozinho, e se a
   * notificação estiver desligada dispara um alert. Desligar deixou de ser
   * opção no painel: o SDR com notificação desligada é o lead esfriando.
   *
   * Três caminhos, porque os navegadores diferem:
   * - Chrome/Edge aceitam pedir sem clique: o pedido aparece ao abrir.
   * - Firefox e Safari (inclusive o app instalado no iPhone) só mostram o
   *   pedido dentro de um toque. Ficam esperando o primeiro toque na tela.
   * - Bloqueado ("denied") o site não consegue perguntar de novo; só a pessoa,
   *   no cadeado da barra de endereço. Aí é o alert e o aviso fixo no topo.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof Notification === "undefined") return; // iPhone fora do app instalado: o aviso fixo cuida
    let cancelado = false;
    const removedores: Array<() => void> = [];

    const alertar = () => {
      if (cancelado || alertaMostradoRef.current) return;
      alertaMostradoRef.current = true;
      window.alert(ALERTA_NOTIFICACOES);
    };

    const aoConceder = async () => {
      setPermissionState("granted");
      setNotificationsEnabled(true);
      try { localStorage.setItem(NOTIFY_PREF_KEY, "true"); } catch { /* modo privado */ }
      await subscribeToPush(pessoaDesteAparelho());
      fetchSubscriberCount();
    };

    const pedir = async (): Promise<NotificationPermission> => {
      let p: NotificationPermission;
      try {
        p = await Notification.requestPermission();
      } catch {
        p = Notification.permission;
      }
      if (!cancelado) setPermissionState(p);
      if (p === "granted") await aoConceder();
      return p;
    };

    const esperarToque = () => {
      const noToque = async () => {
        removedores.forEach((r) => r());
        const r = await pedir();
        if (r !== "granted") alertar();
      };
      const opts = { once: true, capture: true } as const;
      document.addEventListener("pointerdown", noToque, opts);
      document.addEventListener("keydown", noToque, opts);
      removedores.push(
        () => document.removeEventListener("pointerdown", noToque, opts),
        () => document.removeEventListener("keydown", noToque, opts),
      );
    };

    (async () => {
      const atual = Notification.permission;
      if (atual === "granted") return aoConceder();
      if (atual === "denied") return alertar();
      const p = await pedir();
      if (cancelado || p === "granted") return;
      if (p === "denied") return alertar();
      esperarToque();
    })();

    // Mudou nas configurações do navegador com o painel aberto.
    let status: PermissionStatus | null = null;
    const aoMudar = () => {
      const p = Notification.permission;
      setPermissionState(p);
      if (p === "granted") {
        alertaMostradoRef.current = false;
        void aoConceder();
      } else {
        setNotificationsEnabled(false);
        alertaMostradoRef.current = false;
        alertar();
      }
    };
    navigator.permissions?.query({ name: "notifications" as PermissionName })
      .then((s) => {
        if (cancelado) return;
        status = s;
        s.addEventListener("change", aoMudar);
      })
      .catch(() => {});

    return () => {
      cancelado = true;
      removedores.forEach((r) => r());
      status?.removeEventListener("change", aoMudar);
    };
  }, [isAuthenticated, subscribeToPush, fetchSubscriberCount]);

  /**
   * Reconcilia a inscrição deste navegador com o banco, a cada abertura.
   *
   * Existem DUAS inscrições e elas podem divergir: a que o navegador guarda
   * (`pushManager.getSubscription`) e a linha em `push_subscriptions`. Reenviar
   * na abertura conserta isso sozinho. O servidor faz upsert pelo endpoint.
   */
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!("serviceWorker" in navigator)) {
      fetchSubscriberCount();
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!vivo) return;
        setPushSubscribed(!!sub);
        // Reenvia sempre, com ou sem nome: desde 14/09 todo aparelho inscrito
        // recebe todos os leads, então linha sem dono também precisa existir.
        const quem = pessoaDesteAparelho();
        if (sub) {
          const json = sub.toJSON();
          await fetchAdmin(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-push/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: json.endpoint,
              keys: json.keys,
              label: navigator.userAgent.slice(0, 80),
              pessoa: quem,
              device_id: idDesteAparelho(),
            }),
          });
        }
      } catch (err) {
        console.warn("[Push] Não deu para reconciliar a inscrição:", err);
      } finally {
        if (vivo) fetchSubscriberCount();
      }
    })();
    return () => { vivo = false; };
  }, [isAuthenticated, fetchSubscriberCount]);

  /**
   * Ativar ou reconectar. Não existe mais "desativar": a notificação é o que
   * mantém o tempo de resposta do SDR, e um clique distraído não pode desligar.
   */
  const toggleNotifications = useCallback(async (pessoaEscolhida?: PessoaPush | null) => {
    if (typeof Notification === "undefined") {
      toast({
        title: "Este navegador não tem notificação",
        description: ehIos()
          ? "No iPhone, instale o painel na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá."
          : "Use o Chrome ou o Edge.",
        variant: "destructive",
      });
      return;
    }
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
      setPermissionState(permission);
    }
    if (permission !== "granted") {
      window.alert(ALERTA_NOTIFICACOES);
      toast({
        title: "Notificações bloqueadas",
        description: "Clique no cadeado ao lado do endereço do site → Notificações → Permitir. Depois recarregue.",
        variant: "destructive",
      });
      return;
    }
    setNotificationsEnabled(true);
    try { localStorage.setItem(NOTIFY_PREF_KEY, "true"); } catch { /* modo privado */ }
    const quem = pessoaEscolhida || pessoaDesteAparelho();
    const subscribed = await subscribeToPush(quem);
    toast({
      title: subscribed ? "Aparelho conectado 🔔" : "Push em segundo plano falhou",
      description: subscribed
        ? "Este aparelho recebe todos os leads, mesmo com o painel fechado."
        : "Os alertas funcionam com o painel aberto. Recarregue a página e tente de novo.",
      variant: subscribed ? undefined : "destructive",
    });
    fetchSubscriberCount();
  }, [subscribeToPush, fetchSubscriberCount]);

  const sendWebPush = useCallback(async (
    title: string,
    body: string,
    sound?: string,
    pessoas?: string[],
    extra?: { tipo?: string; url?: string; tag?: string; ttl?: number; endpoints?: string[] },
  ): Promise<ResultadoEnvio> => {
    try {
      const res = await fetchPush("/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sem `pessoas` vai para todo mundo, que é o certo para venda, reunião e
        // pedido de atualização: isso é notícia da casa. Lead é de alguém.
        body: JSON.stringify({ title, body, sound, pessoas, ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      const sent = Number(j.sent) || 0;
      const total = Number(j.total) || 0;
      // "0 de 0" com selo de sucesso escondeu por um dia que o servidor recusava
      // o envio. Todo resultado sem entrega carrega o motivo que o servidor deu.
      if (!res.ok) return { ok: false, sent, total, motivo: j.error || `Servidor respondeu ${res.status}` };
      if (j.stubbed) return { ok: false, sent, total, motivo: "Chaves VAPID não configuradas no servidor" };
      if (sent === 0) return { ok: false, sent, total, motivo: j.message || (total ? "O serviço de push recusou todos os aparelhos" : "Nenhum aparelho inscrito para receber") };
      return { ok: true, sent, total };
    } catch (err) {
      console.warn("[Push] Failed to send web push:", err);
      return { ok: false, sent: 0, total: 0, motivo: err instanceof Error ? err.message : "Falha de rede" };
    }
  }, []);

  // Deterministic test: fires one real local notification + one real push, no dependency on historical data
  const testNotifications = useCallback(async () => {
    playLeadSound();
    // O teste vai só para o dono DESTE aparelho. Um teste que toca no celular
    // da equipe inteira é o tipo de coisa que faz o time desligar a notificação.
    const quem = pessoaDesteAparelho();
    let endpoint: string | undefined;
    try {
      endpoint = (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint;
    } catch { /* sem service worker */ }
    const r = await sendWebPush(
      "🧪 Teste do Champion",
      "Chegou neste aparelho. Os leads vão tocar assim.",
      "newlead",
      // `pessoas` fica para a função antiga, que não conhece `endpoints`.
      quem ? [quem] : undefined,
      { tipo: "teste", ...(endpoint ? { endpoints: [endpoint] } : {}) },
    );
    if (r.ok) {
      toast({ title: "Teste enviado", description: "Conferindo se chegou neste aparelho…" });
      // O recibo vem do service worker DEPOIS de o navegador aceitar mostrar a
      // notificação. Recibo sem nada na tela = o sistema operacional escondeu.
      // Foi exatamente o caso do Rodger em 14/09: servidor 1/1, recibo no mesmo
      // segundo, e nenhuma notificação visível no Windows.
      const enviadoEm = Date.now();
      const ua = navigator.userAgent.slice(0, 80);
      const meuId = idDesteAparelho();
      let confirmou = false;
      for (let i = 0; i < 5 && !confirmou; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        try {
          const res = await fetchPush("/subscriptions");
          const data = await res.json();
          confirmou = (data.subscriptions || []).some(
            (d: DispositivoPush) =>
              (d.device_id ? d.device_id === meuId : d.label === ua) &&
              !!d.last_received_at && Date.parse(d.last_received_at) >= enviadoEm - 20_000,
          );
        } catch { /* tenta de novo */ }
      }
      const windows = /Windows/.test(navigator.userAgent);
      if (confirmou) {
        toast({
          title: "Chegou neste aparelho ✅",
          description: windows
            ? "Não apareceu na tela? O Windows está escondendo: Configurações → Sistema → Notificações → ative o Google Chrome e desligue o Não perturbar. Veja também a central (Win+N)."
            : "Não apareceu na tela? As notificações do navegador estão silenciadas nas configurações do aparelho.",
        });
      } else {
        toast({
          title: "Este aparelho não confirmou",
          description: "O servidor enviou, mas o navegador não acusou recebimento. Clique em Reconectar e teste de novo.",
          variant: "destructive",
        });
      }
    } else {
      // Push do servidor falhou: mostra ao menos a notificação local, para a
      // pessoa separar "o navegador não mostra" de "o servidor não manda".
      void sendNativeNotification("🧪 Teste local", "O navegador mostra notificações. O envio pelo servidor falhou.", `champion-test-${Date.now()}`);
      toast({ title: "O teste não saiu do servidor", description: r.motivo, variant: "destructive" });
    }
    // O recibo do service worker chega em alguns segundos.
    setTimeout(() => fetchSubscriberCount(), 6000);
    return r;
  }, [sendNativeNotification, sendWebPush, fetchSubscriberCount]);

  const removerDispositivo = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetchPush("/remover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      await fetchSubscriberCount();
    }
  }, [fetchSubscriberCount]);

  return {
    removerDispositivo,
    notificationsEnabled,
    permissionState,
    pushSubscribed,
    subscriberCount,
    dispositivos,
    atualizarDispositivos: fetchSubscriberCount,
    toggleNotifications,
    testNotifications,
    sendWebPush,
    pessoa,
    // Trocar o dono do aparelho reinscreve na hora. Sem reinscrever, o banco
    // continuaria com o nome antigo e a pessoa receberia os leads de outro.
    definirPessoa: useCallback(async (nova: PessoaPush) => {
      setPessoa(nova);
      try { localStorage.setItem(PUSH_PESSOA_KEY, nova); } catch { /* modo privado */ }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") await subscribeToPush(nova);
      fetchSubscriberCount();
    }, [subscribeToPush, fetchSubscriberCount]),
    instalado: estaInstalado(),
    ios: ehIos(),
    podeInstalar,
    instalarApp,
  };
}
