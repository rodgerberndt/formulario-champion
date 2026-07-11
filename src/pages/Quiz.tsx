import { useState, useEffect, useCallback, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Check, Loader2, ArrowLeft, Target, MessageCircle, AlertTriangle } from "lucide-react";
import {
  calculateLeadScore,
  computeLeadScore100,
  getTierFromFaturamento,
  MERCADO_OPTIONS,
  INVESTIMENTO_OPTIONS } from
"@/lib/leadScoring";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture, getUtmForDb, getAttributionSource } from "@/hooks/useUtmCapture";
import { PhoneField, isPhoneE164Valid } from "@/components/PhoneField";

const env = import.meta.env as Record<string, string | undefined>;
const externalSupabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const externalSupabaseAnonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!externalSupabaseUrl || !externalSupabaseAnonKey) {
  throw new Error("External Supabase env vars are missing (SUPABASE_URL/SUPABASE_ANON_KEY)");
}

const supabaseExternal = createClient(externalSupabaseUrl, externalSupabaseAnonKey);

// Roteamento pós-submit por faixa de investimento:
//  - "Não vendo ainda" ou "Até R$ 5 mil" ou "R$ 5-10 mil" → /obrigadosprint (Gustavo)
//  - ≥ R$ 10 mil → /obrigadomql (Miguel)
// "Não vendo ainda" entrou pra Gustavo em 2026-07-11 — antes caía no bucket
// Direct/sem SDR e redirecionava pra fora do site sem ninguém ligar pro lead.
const MIGUEL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil", "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil", "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões", "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];
const GUSTAVO_FAIXAS = ["Não vendo ainda (R$0/mês)", "Até R$ 5 mil", "De R$ 5 mil a R$ 10 mil"];

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  email: string;
  mercado: string;
  operacoes_ativas: number | null;
  investimento_faixa: string;
  dor_desejo: string;
  quer_vender_mais: string;
  lgpd: boolean;
  compromisso_whatsapp: boolean;
  nps_score: number | null;
  aceita_call_diagnostico: string;
}

// Bumped to v3 to invalidate old cached state from before "aceita_call_diagnostico" step
const STORAGE_KEY = "champion_quiz_progress_v3";
const RESULT_STORAGE_KEY = "champion_quiz_result";

// Step IDs for tracking (12 steps now: aceita_call_diagnostico added before loading)
const STEP_IDS = [
  "q1_quer_vender",
  "q2_mercado",
  "q3_operacoes",
  "q4_faturamento",
  "q5_nome",
  "q6_whats",
  "q7_insta",
  "q8_email",
  "q9_dor",
  "q10_nps",
  "q11_aceita_call",
  "q12_loading",
];


// Memoized background component
const QuizBackground = memo(function QuizBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Rich gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            145deg, 
            hsl(235 50% 4%) 0%, 
            hsl(238 65% 10%) 35%,
            hsl(250 55% 12%) 60%,
            hsl(235 50% 5%) 100%
          )`
        }} />


      {/* Subtle Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

      
      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }} />


      {/* Glow blobs - Static for performance */}
      <div
        className="absolute -top-20 left-1/4 w-[350px] h-[350px] rounded-full blur-[70px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.1) 0%, transparent 70%)'
        }} />

      <div
        className="absolute top-1/2 -right-20 w-[300px] h-[300px] rounded-full blur-[60px]"
        style={{
          background: 'radial-gradient(circle, hsl(43 85% 55% / 0.07) 0%, transparent 70%)'
        }} />

      <div
        className="absolute -bottom-16 left-1/3 w-[280px] h-[280px] rounded-full blur-[50px]"
        style={{
          background: 'radial-gradient(circle, hsl(260 80% 50% / 0.06) 0%, transparent 70%)'
        }} />

    </div>);

});

// NPS slider step (0-10) — quick, mobile-friendly feedback on quiz UX
function NpsStep({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const numbers = Array.from({ length: 11 }, (_, i) => i);

  const colorFor = (n: number) => {
    if (n <= 3) return "bg-red-500/90 border-red-400 text-white";
    if (n <= 6) return "bg-amber-500/90 border-amber-400 text-black";
    if (n <= 8) return "bg-lime-500/90 border-lime-400 text-black";
    return "bg-emerald-500/90 border-emerald-400 text-white";
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 sm:w-5 sm:h-5 text-secondary shrink-0" />
          <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
            Sua resposta nos ajuda a <span className="text-secondary font-semibold">entender</span> se você leu a página.
          </p>
        </div>
      </div>

      <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
        De 0 a 10, quanto você acha que a Champion pode resolver o seu problema?
      </label>
      <p className="text-xs sm:text-sm text-muted-foreground -mt-3">
        0 = não leu a página · 5 = leu mas não entendeu · 10 = leu e entendeu
      </p>

      <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 sm:gap-2 pt-1">
        {numbers.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-11 sm:h-12 rounded-lg border-2 text-sm sm:text-base font-bold transition-all duration-150 active:scale-95 ${
                selected
                  ? `${colorFor(n)} shadow-lg scale-[1.05]`
                  : "bg-input text-foreground border-border/60 hover:border-primary/60"
              }`}
              aria-label={`Nota ${n}`}>
              {n}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground/80 px-1 pt-1">
        <span>Não leu</span>
        <span>Leu e entendeu</span>
      </div>

      {value !== null && (
        <p className="text-center text-sm text-secondary font-semibold animate-fade-in pt-1">
          Obrigado! Nota: <span className="text-base">{value}</span>/10
        </p>
      )}
    </div>
  );
}

// Loading step component — shows promo phrase while submitting answers
function LoadingCommitStep({
  onFinish,
  onCommit,
  submitFailed,
  onRetry,
}: {
  onFinish: () => void;
  onCommit: (v: boolean) => void;
  submitFailed: boolean;
  onRetry: () => void;
}) {
  const onFinishRef = useRef(onFinish);
  const onCommitRef = useRef(onCommit);
  onFinishRef.current = onFinish;
  onCommitRef.current = onCommit;
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    onCommitRef.current(true);
    const t = setTimeout(() => {
      onFinishRef.current();
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  if (submitFailed) {
    return (
      <div className="space-y-6 animate-fade-in text-center py-4">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
        <div className="space-y-2">
          <p className="text-white text-base sm:text-lg font-semibold">
            Tivemos um problema ao enviar
          </p>
          <p className="text-sm text-muted-foreground">
            Sem stress, clique abaixo para tentar de novo. Suas respostas estão salvas.
          </p>
        </div>
        <Button
          size="lg"
          onClick={onRetry}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-center py-4">
      <div className="space-y-4">
        <Loader2 className="w-12 h-12 sm:w-14 sm:h-14 text-secondary animate-spin mx-auto" />
        <p className="text-white text-base sm:text-lg font-semibold">
          Enviando suas respostas...
        </p>
        <div className="h-1.5 w-full max-w-[280px] mx-auto bg-muted/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-secondary rounded-full"
            style={{ animation: "quiz-intro-progress 10s linear forwards" }}
          />
        </div>
      </div>

      <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-5 sm:p-6 max-w-md mx-auto">
        {/* Equação visual: ✅ formulário + ⬜ responder time = 🎁 bônus surpresa */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {/* Caixinha 1 — formulário (já feito) */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-secondary border-2 border-secondary flex items-center justify-center shadow-lg shadow-secondary/30">
              <Check className="w-6 h-6 sm:w-7 sm:h-7 text-background" strokeWidth={3} />
            </div>
            <span className="text-[10px] sm:text-xs text-white/80 font-medium leading-tight text-center max-w-[64px] sm:max-w-[72px]">
              Preencher aplicação
            </span>
          </div>

          {/* Sinal de + */}
          <span className="text-2xl sm:text-3xl font-bold text-white/70 -mt-5 select-none">+</span>

          {/* Caixinha 2 — responder time (pendente) */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/5 border-2 border-dashed border-white/40 flex items-center justify-center animate-pulse">
              <span className="block w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-sm border border-white/40" />
            </div>
            <span className="text-[10px] sm:text-xs text-white/80 font-medium leading-tight text-center max-w-[64px] sm:max-w-[72px]">
              Responder nosso time
            </span>
          </div>
        </div>

        {/* Sinal de = */}
        <div className="flex justify-center my-3 sm:my-4" aria-hidden="true">
          <div className="flex flex-col gap-1">
            <span className="block w-7 h-[3px] bg-secondary/80 rounded-full" />
            <span className="block w-7 h-[3px] bg-secondary/80 rounded-full" />
          </div>
        </div>

        {/* Bônus surpresa */}
        <p className="text-base sm:text-lg text-white/95 font-medium leading-relaxed text-center">
          🎁 Uma <span className="text-secondary font-bold">call de diagnóstico gratuita</span> — antes vendida por R$ 2.000.
          <span className="block mt-1.5 text-sm sm:text-base text-white/75">
            Você só garante se <span className="text-secondary font-semibold">responder o nosso time</span> no WhatsApp.
          </span>
        </p>
      </div>
    </div>
  );
}

export default function Quiz() {
  const navigate = useNavigate();
  const { trackQuizPageView, trackStepView, trackStepNext, trackStepBack, trackSubmit } = useTracking();
  const { getUtmPayload } = useUtmCapture();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [introCanSkip, setIntroCanSkip] = useState(false);

  // Allow skipping intro after 3s; auto-close after 10s
  useEffect(() => {
    const skipTimer = setTimeout(() => setIntroCanSkip(true), 3000);
    const t = setTimeout(() => setShowIntro(false), 10000);
    return () => {
      clearTimeout(t);
      clearTimeout(skipTimer);
    };
  }, []);

  const formDataRef = useRef<QuizFormData | null>(null);
  const [phoneValid, setPhoneValid] = useState(false);
  const [formData, setFormData] = useState<QuizFormData>({
    nome_completo: "",
    whatsapp: "",
    instagram: "",
    email: "",
    mercado: "",
    operacoes_ativas: null,
    investimento_faixa: "",
    dor_desejo: "",
    quer_vender_mais: "",
    lgpd: false,
    compromisso_whatsapp: false,
    nps_score: null,
    aceita_call_diagnostico: "",
  });

  const totalSteps = 12;
  const hasTrackedQuizView = useRef(false);
  const lastTrackedStep = useRef<number | null>(null);
  const hasSubmittedRef = useRef(false); // Hard guard against double-submit
  const isAdvancingRef = useRef(false); // Prevents double-click on next button

  // Track quiz page view on mount
  useEffect(() => {
    if (!hasTrackedQuizView.current) {
      hasTrackedQuizView.current = true;
      trackQuizPageView();
    }
  }, [trackQuizPageView]);

  // Track step view when step changes
  useEffect(() => {
    if (lastTrackedStep.current !== step) {
      const stepId = STEP_IDS[step - 1];
      if (stepId) trackStepView(stepId);
      lastTrackedStep.current = step;
    }
  }, [step, trackStepView]);

  // Restore from localStorage with safe clamping
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.formData && typeof parsed.formData === "object") {
        setFormData((prev) => ({ ...prev, ...parsed.formData }));
      }
      // Clamp step to valid range and never resume on the loading/submit step
      if (typeof parsed?.step === "number") {
        const safeStep = Math.max(1, Math.min(parsed.step, totalSteps - 1));
        setStep(safeStep);
      }
      if (parsed?.formData?.whatsapp) {
        setPhoneValid(isPhoneE164Valid(parsed.formData.whatsapp));
      }
    } catch {
      // Corrupted data — wipe it
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Keep ref in sync so handleSubmit always reads latest formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Persist progress (skip step 10 — loading is transient)
  useEffect(() => {
    if (step >= totalSteps) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, step }));
    } catch {
      // Storage quota / private mode — silently ignore
    }
  }, [formData, step]);

  const updateField = useCallback((field: keyof QuizFormData, value: string | boolean | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value as never }));
  }, []);

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return formData.quer_vender_mais !== "";
      case 2:
        return formData.mercado !== "";
      case 3:
        return formData.operacoes_ativas !== null;
      case 4:
        return formData.investimento_faixa !== "";
      case 5:
        return formData.nome_completo.trim().length >= 3;
      case 6: {
        return phoneValid && isPhoneE164Valid(formData.whatsapp) && formData.lgpd;
      }
      case 7:
        return formData.instagram.trim().length >= 1;
      case 8: {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(formData.email.trim());
      }
      case 9:
        return formData.dor_desejo.trim().length >= 10;
      case 10:
        return formData.nps_score !== null;
      case 11:
        return formData.aceita_call_diagnostico !== "";
      case 12:
        return true;
      default:
        return false;
    }
  }, [step, formData, phoneValid]);

  const handleSubmit = useCallback(async () => {
    // Hard guard: never run twice
    if (hasSubmittedRef.current) return;
    if (isSubmitting) return;
    hasSubmittedRef.current = true;
    setSubmitFailed(false);

    const currentData = formDataRef.current || formData;
    setIsSubmitting(true);

    // Safety: if everything stalls, allow retry after 25s
    const safetyTimer = setTimeout(() => {
      setIsSubmitting(false);
      setSubmitFailed(true);
      hasSubmittedRef.current = false;
    }, 25000);

    try {
      // Lead Score 0–100 using ALL quiz answers.
      const scoreResult = computeLeadScore100({
        investimento_faixa: currentData.investimento_faixa,
        mercado: currentData.mercado,
        operacoes_ativas: currentData.operacoes_ativas,
        quer_vender_mais: currentData.quer_vender_mais,
        compromisso_whatsapp: currentData.compromisso_whatsapp,
        aceita_call_diagnostico: currentData.aceita_call_diagnostico,
        dor_desejo: currentData.dor_desejo,
        nps_score: currentData.nps_score,
        lgpd: currentData.lgpd,
      });
      const tier = getTierFromFaturamento(currentData.investimento_faixa);

      // Fire IP capture in parallel (non-blocking)
      const clientIpPromise = supabase.functions
        .invoke('get-client-ip', { body: { action: 'get_ip_only' } })
        .then((r) => (r.data?.ip as string) || null)
        .catch((e) => {
          console.warn('Failed to get client IP:', e);
          return null;
        });

      const clientIp: string | null = await Promise.race([
        clientIpPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
      ]);

      const dbData = {
        nome_completo: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        email: currentData.email,
        mercado: currentData.mercado,
        operacoes_ativas: currentData.operacoes_ativas,
        investimento_faixa: currentData.investimento_faixa,
        dor_desejo: currentData.dor_desejo,
        score: scoreResult.score,
        tier,
        nps_score: currentData.nps_score,
        raw_answers_json: JSON.parse(JSON.stringify(currentData)),
        attribution_source: getAttributionSource(),
        ip_address: clientIp,
        ...getUtmPayload()
      };

      const leadId = crypto.randomUUID();
      const { error } = await supabase.from("leads").insert([{ id: leadId, ...dbData }]);

      if (error) throw error;

      const insertedLead = { id: leadId };

      // Persist for "skip queue" tracking on /obrigado pages
      try { localStorage.setItem('champion_lead_id', leadId); } catch {}

      const eventTimestamp = Math.floor(Date.now() / 1000);
      const eventIds: Record<string, string> = {
        CompleteRegistration: `${insertedLead?.id}_CompleteRegistration_${eventTimestamp}`,
        MQL: `${insertedLead?.id}_MQL_${eventTimestamp}`,
      };

      localStorage.setItem('champion_event_ids', JSON.stringify({
        lead_id: insertedLead?.id,
        event_ids: eventIds,
        timestamp: eventTimestamp,
      }));

      // Página de destino real do lead (usada como event_source_url no CAPI, pra bater
      // com a URL onde o pixel client-side vai efetivamente disparar o mesmo evento —
      // ver roteamento abaixo, MIGUEL_FAIXAS/GUSTAVO_FAIXAS).
      const destinationPath = MIGUEL_FAIXAS.includes(currentData.investimento_faixa)
        ? "/obrigadomql"
        : "/obrigadosprint";

      // CAPI events (background)
      if (insertedLead?.id) {
        supabase.functions.invoke('fire-capi-events', {
          body: { lead_db_id: insertedLead.id, event_ids: eventIds, event_source_url: `https://championadstudio.com${destinationPath}` },
        }).then(res => {
          console.log('[CAPI] fire-capi-events response:', res.data);
        }).catch(err => {
          console.warn('[CAPI] fire-capi-events failed:', err);
        });
      }

      // External quiz_leads insert (background)
      const utmData = getUtmPayload();
      const quizLeadPayload = {
        name: currentData.nome_completo ?? null,
        phone: currentData.whatsapp ?? null,
        email: currentData.email ?? null,
        status: "Novo",
        answers: {
          nome_completo: currentData.nome_completo,
          whatsapp: currentData.whatsapp,
          instagram: currentData.instagram,
          email: currentData.email,
          mercado: currentData.mercado,
          operacoes_ativas: currentData.operacoes_ativas,
          investimento_faixa: currentData.investimento_faixa,
          dor_desejo: currentData.dor_desejo,
          compromisso_whatsapp: currentData.compromisso_whatsapp,
          nps_score: currentData.nps_score,
        },
        utm: {
          utm_source: utmData.utm_source ?? null,
          utm_medium: utmData.utm_medium ?? null,
          utm_campaign: utmData.utm_campaign ?? null,
          utm_content: utmData.utm_content ?? null,
          utm_term: utmData.utm_term ?? null,
        },
      };

      console.log("QUIZ_LEADS_PAYLOAD", quizLeadPayload);

      supabaseExternal
        .from("quiz_leads")
        .insert([quizLeadPayload])
        .then(({ data: quizLeadInsertData, error: quizLeadError }) => {
          if (quizLeadError) {
            console.error("QUIZ_LEADS_INSERT_ERROR", quizLeadError);
          } else {
            console.log("QUIZ_LEADS_INSERT_SUCCESS", quizLeadInsertData);
          }
        });

      // n8n webhook (background)
      const utmPayload = getUtmPayload();
      const n8nBody = {
        name: currentData.nome_completo,
        phone: currentData.whatsapp,
        email: currentData.email,
        answers: {
          nome_completo: currentData.nome_completo,
          whatsapp: currentData.whatsapp,
          instagram: currentData.instagram,
          email: currentData.email,
          mercado: currentData.mercado,
          operacoes_ativas: currentData.operacoes_ativas,
          investimento_faixa: currentData.investimento_faixa,
          dor_desejo: currentData.dor_desejo,
          compromisso_whatsapp: currentData.compromisso_whatsapp,
          nps_score: currentData.nps_score,
        },
        utm_source: utmPayload.utm_source || null,
        utm_medium: utmPayload.utm_medium || null,
        utm_campaign: utmPayload.utm_campaign || null,
        utm_content: utmPayload.utm_content || null,
      };

      supabase.functions
        .invoke('send-quiz-data', { body: n8nBody })
        .then((n8nRes) => {
          if (n8nRes.error) {
            console.error("n8n webhook error:", n8nRes.error);
          } else {
            console.log("n8n webhook sent successfully");
          }
        })
        .catch((n8nErr) => {
          console.error("n8n webhook error:", n8nErr);
        });

      trackSubmit({
        name: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        market: currentData.mercado,
        stage: currentData.mercado,
        investimentoFaixa: currentData.investimento_faixa,
      }).catch((e) => console.warn('trackSubmit failed:', e));

      localStorage.removeItem(STORAGE_KEY);

      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({
        nome_completo: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        email: currentData.email,
        mercado: currentData.mercado,
        operacoes_ativas: currentData.operacoes_ativas,
        investimento_faixa: currentData.investimento_faixa,
        dor_desejo: currentData.dor_desejo
      }));

      toast({
        title: "Aplicação enviada!",
        description: "Em breve entraremos em contato."
      });

      clearTimeout(safetyTimer);

      const faixa = currentData.investimento_faixa;
      if (MIGUEL_FAIXAS.includes(faixa)) {
        // ≥ R$ 10 mil → Miguel
        navigate("/obrigadomql");
      } else if (GUSTAVO_FAIXAS.includes(faixa)) {
        // "Não vendo ainda", até R$ 5 mil ou R$ 5-10 mil → Gustavo (Sprint)
        navigate("/obrigadosprint");
      } else {
        // Faixa não reconhecida (dado legado/inesperado) — fallback de segurança
        window.location.href = "https://sprint.championadstudio.com";
      }
    } catch (error) {
      console.error("Error submitting lead:", error);
      clearTimeout(safetyTimer);
      hasSubmittedRef.current = false;
      setSubmitFailed(true);
      toast({
        title: "Erro ao enviar",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isSubmitting, navigate, getUtmPayload, trackSubmit]);

  const retrySubmit = useCallback(() => {
    setSubmitFailed(false);
    hasSubmittedRef.current = false;
    handleSubmit();
  }, [handleSubmit]);

  const nextStep = async () => {
    if (isAdvancingRef.current) return;
    if (!canProceed()) return;

    if (step < totalSteps) {
      isAdvancingRef.current = true;
      const fromStepId = STEP_IDS[step - 1];
      const toStepId = STEP_IDS[step];

      const fieldData: Record<string, string> = {};
      switch (step) {
        case 1: fieldData.quer_vender_mais = formData.quer_vender_mais; break;
        case 2: fieldData.mercado = formData.mercado; break;
        case 3: fieldData.operacoes = String(formData.operacoes_ativas ?? ""); break;
        case 4: fieldData.investimento = formData.investimento_faixa; break;
        case 5: fieldData.nome = formData.nome_completo; break;
        case 6: fieldData.whatsapp = formData.whatsapp; break;
        case 7: fieldData.instagram = formData.instagram; break;
        case 8: fieldData.email = formData.email; break;
        case 9: fieldData.dor_desejo = formData.dor_desejo; break;
        case 10: fieldData.nps_score = String(formData.nps_score ?? ""); break;
        case 11: fieldData.aceita_call_diagnostico = formData.aceita_call_diagnostico; break;
      }

      try {
        await trackStepNext(fromStepId, toStepId, fieldData);
      } catch (e) {
        console.warn("trackStepNext failed:", e);
      }
      setStep(step + 1);
      // Release lock on next tick
      setTimeout(() => { isAdvancingRef.current = false; }, 250);
    }
  };

  const prevStep = async () => {
    if (step > 1 && step < totalSteps) {
      const fromStepId = STEP_IDS[step - 1];
      const toStepId = STEP_IDS[step - 2];
      try {
        await trackStepBack(fromStepId, toStepId);
      } catch (e) {
        console.warn("trackStepBack failed:", e);
      }
      setStep(step - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceed() && step < totalSteps) {
      e.preventDefault();
      nextStep();
    }
  };

  const inputClasses = "w-full text-sm sm:text-base h-11 sm:h-12 md:h-14 bg-input border-2 border-border/60 rounded-xl px-3 sm:px-4 text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200";
  const selectClasses = "w-full text-sm sm:text-base h-11 sm:h-12 md:h-14 bg-input border-2 border-border/60 rounded-xl px-3 sm:px-4 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200";

  // Scroll focused input into view above mobile keyboard
  const scrollIntoViewOnFocus = (e: React.FocusEvent<HTMLElement>) => {
    setTimeout(() => {
      try {
        e.target.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* ignore */
      }
    }, 280);
  };

  const renderStep = () => {
    switch (step) {
      case 5:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu nome completo?
            </label>
            <Input
              className={inputClasses}
              placeholder="Digite seu nome"
              value={formData.nome_completo}
              autoComplete="name"
              inputMode="text"
              enterKeyHint="next"
              onFocus={scrollIntoViewOnFocus}
              onChange={(e) => updateField("nome_completo", e.target.value)} />
          </div>);

      case 6:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu WhatsApp?
            </label>
            <PhoneField
              value={formData.whatsapp}
              onChange={(e164, valid) => {
                updateField("whatsapp", e164);
                setPhoneValid(valid);
              }}
              placeholder="Seu número de WhatsApp"
            />

            <div className="flex items-start gap-2.5 pt-1">
              <Checkbox
                id="lgpd"
                checked={formData.lgpd}
                onCheckedChange={(checked) => updateField("lgpd", checked === true)}
                className="border-2 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5 mt-0.5 rounded-md shrink-0" />
              <label htmlFor="lgpd" className="text-xs sm:text-sm text-muted-foreground cursor-pointer leading-relaxed">
                Concordo em receber contato sobre a call de diagnóstico (antes R$ 2.000, agora gratuita), e responder o mais rápido possível.
              </label>
            </div>
          </div>);

      case 7:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu Instagram?
            </label>
            <Input
              className={inputClasses}
              placeholder="@seuinstagram"
              value={formData.instagram}
              autoComplete="username"
              inputMode="text"
              enterKeyHint="next"
              autoCapitalize="none"
              onFocus={scrollIntoViewOnFocus}
              onChange={(e) => updateField("instagram", e.target.value)} />
          </div>);

      case 8:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu e-mail?
            </label>
            <Input
              id="campo_email"
              className={inputClasses}
              placeholder="seu@email.com"
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              autoCapitalize="none"
              onFocus={scrollIntoViewOnFocus}
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)} />
          </div>);

      case 2:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Se você quer vender mais, então qual o seu mercado hoje?
            </label>
            <Select
              value={formData.mercado}
              onValueChange={(value) => updateField("mercado", value)}>
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o mercado" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-xl max-h-[280px]">
                {MERCADO_OPTIONS.map((option) =>
                <SelectItem
                  key={option}
                  value={option}
                  className="text-foreground hover:bg-muted focus:bg-muted text-sm sm:text-base py-2.5 sm:py-3">
                    {option}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>);

      case 3:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Quantas operações você tem ativas ou em fase de construção?
            </label>
            <Select
              value={formData.operacoes_ativas !== null ? String(formData.operacoes_ativas) : ""}
              onValueChange={(value) => updateField("operacoes_ativas", parseInt(value, 10))}>
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o número de operações" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-xl max-h-[280px]">
                {Array.from({ length: 11 }, (_, i) => (
                  <SelectItem
                    key={i}
                    value={String(i)}
                    className="text-foreground hover:bg-muted focus:bg-muted text-sm sm:text-base py-2.5 sm:py-3">
                    {i === 0 ? "Nenhuma" : `${i} operação${i > 1 ? 's' : ''}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>);

      case 4:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Quanto de faturamento você tem hoje no seu ecossistema?
            </label>
            <Select
              value={formData.investimento_faixa}
              onValueChange={(value) => updateField("investimento_faixa", value)}>
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o faturamento" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-xl max-h-[280px]">
                {INVESTIMENTO_OPTIONS.map((option) =>
                <SelectItem
                  key={option}
                  value={option}
                  className="text-foreground hover:bg-muted focus:bg-muted text-sm sm:text-base py-2.5 sm:py-3">
                    {option}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>);

      case 1:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Você quer vender mais?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {["Sim", "Não"].map((opt) => {
                const selected = formData.quer_vender_mais === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={async () => {
                      if (isAdvancingRef.current) return;
                      isAdvancingRef.current = true;
                      updateField("quer_vender_mais", opt);
                      const fromStepId = STEP_IDS[0];
                      const toStepId = STEP_IDS[1];
                      try {
                        await trackStepNext(fromStepId, toStepId, { quer_vender_mais: opt });
                      } catch (e) {
                        console.warn("trackStepNext failed:", e);
                      }
                      setStep(2);
                      setTimeout(() => { isAdvancingRef.current = false; }, 250);
                    }}
                    className={`h-12 sm:h-14 rounded-xl border-2 text-sm sm:text-base font-semibold transition-colors duration-200 ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                        : "bg-input text-foreground border-border/60 hover:border-primary/60"
                    }`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>);

      case 9:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 sm:w-5 sm:h-5 text-secondary shrink-0" />
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Quanto mais <span className="text-secondary font-semibold">detalhada</span> sua resposta, mais <span className="text-secondary font-semibold">preciso</span> será o seu diagnóstico na call.
                </p>
              </div>
            </div>

            <label className="block text-base sm:text-lg font-medium text-foreground">
              O que você quer resolver hoje com a Champion?
            </label>

            <div className="flex flex-wrap gap-2">
              {[
                "Delegar para ganhar mais tempo",
                "Criativos que não vendem",
                "Criativos que aguentam escala",
                "Lead qualificado",
                "Reprovação de criativos",
                "Otimizações com base em métricas",
                "Falta de conhecimento",
              ].map((dor) => {
                const selected = formData.dor_desejo.trim() === dor;
                return (
                  <button
                    type="button"
                    key={dor}
                    onClick={() => {
                      updateField("dor_desejo", selected ? "" : dor);
                    }}
                    className={`text-xs sm:text-sm px-3 py-1.5 rounded-full border transition-all ${
                      selected
                        ? "bg-secondary text-secondary-foreground border-secondary"
                        : "bg-transparent text-foreground border-border/60 hover:border-secondary/60"
                    }`}
                  >
                    {dor}
                  </button>
                );
              })}
            </div>

            <Textarea
              className="w-full text-sm sm:text-base min-h-[90px] sm:min-h-[110px] resize-none bg-input border-2 border-border/60 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200"
              placeholder="Outra"
              value={formData.dor_desejo}
              enterKeyHint="next"
              onFocus={scrollIntoViewOnFocus}
              onChange={(e) => updateField("dor_desejo", e.target.value)} />
          </div>);

      case 10:
        return (
          <NpsStep
            value={formData.nps_score}
            onChange={(n) => updateField("nps_score", n)}
          />);

      case 11:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-secondary shrink-0" />
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Última pergunta antes de finalizar.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
                Você estaria disposto a fazer uma call de diagnóstico com o nosso time para analisarmos a sua operação e te passarmos o que pode melhorar?
              </label>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Essa call é vendida por <span className="text-secondary font-semibold">R$ 2.000</span>, mas somente para quem preenche a aplicação, recebe ela gratuitamente.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {["Sim", "Não"].map((opt) => {
                const selected = formData.aceita_call_diagnostico === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("aceita_call_diagnostico", opt)}
                    className={`h-12 sm:h-14 rounded-xl border-2 text-sm sm:text-base font-semibold transition-colors duration-200 ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                        : "bg-input text-foreground border-border/60 hover:border-primary/60"
                    }`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>);

      case 12:
        return (
          <LoadingCommitStep
            onFinish={handleSubmit}
            onCommit={(v) => updateField("compromisso_whatsapp", v)}
            submitFailed={submitFailed}
            onRetry={retrySubmit}
          />);
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100svh] relative w-full max-w-full overflow-x-hidden">
      <QuizBackground />

      {/* Intro screen — auto-closes after 10s, allow skip after 3s */}
      {showIntro && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-5 bg-background/95 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full text-center space-y-6">
            <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" strokeWidth={2.5} />
            <div className="space-y-3">
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                Atenção antes de continuar
              </h2>
              <p className="text-base sm:text-lg text-white/95 leading-relaxed font-medium">
                Ao preencher esta aplicação, você concorda que{" "}
                <span className="text-secondary font-bold">trabalha com o digital</span>.
                {" "}Se você não trabalha com o digital, e não quer vender mais,{" "}
                <span className="text-secondary font-bold">saia desta aplicação imediatamente</span>.
              </p>
            </div>
            <div className="h-1.5 w-full bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-secondary rounded-full"
                style={{ animation: "quiz-intro-progress 10s linear forwards" }}
              />
            </div>
            {introCanSkip && (
              <button
                type="button"
                onClick={() => setShowIntro(false)}
                className="text-sm text-white/80 hover:text-white underline underline-offset-4 transition-colors animate-fade-in">
                Continuar agora
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>
      </header>

      {/* Quiz Content */}
      <main className="pt-16 pb-6 px-4 min-h-[100svh] flex items-center justify-center w-full max-w-full overflow-x-hidden" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <div className="w-full max-w-[92vw] sm:max-w-md mx-auto">
          <div
            className="backdrop-blur-xl border border-border/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl w-full overflow-hidden quiz-card-enter"
            style={{
              background: 'hsl(235 45% 7% / 0.94)',
              boxShadow: '0 8px 40px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset'
            }}>

            <div className="mb-4 sm:mb-6">
              <p className="text-center text-muted-foreground text-xs sm:text-sm leading-relaxed opacity-80">
                Preencha a aplicação rápida para falarmos com você!
              </p>
            </div>

            <div className="min-h-[180px] sm:min-h-[200px] flex flex-col">
              <div key={step} className="flex-1 quiz-step-enter">
                {renderStep()}
              </div>

              {/* Navigation Buttons - Hidden on loading step (11) and step 1 (auto-advance) */}
              {step !== totalSteps && step !== 1 &&
                <div className={`mt-6 sm:mt-8 ${step > 1 ? 'flex flex-col-reverse sm:flex-row gap-3' : ''}`}>
                  {step > 1 &&
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={prevStep}
                    className="w-full sm:flex-1 h-11 sm:h-12 md:h-14 text-sm sm:text-base rounded-xl border-2 border-border/60 hover:bg-muted hover:border-border transition-colors duration-200 min-w-0">
                      <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2 shrink-0" />
                      Voltar
                    </Button>
                  }
                  <Button
                    size="lg"
                    onClick={nextStep}
                    disabled={!canProceed() || isSubmitting}
                    className="w-full sm:flex-1 h-11 sm:h-12 md:h-14 text-sm sm:text-base rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none min-w-0">
                    {isSubmitting ?
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> :
                    <>
                        Continuar
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-1.5 sm:ml-2 shrink-0" />
                      </>
                    }
                  </Button>
                </div>
              }
            </div>
          </div>
        </div>
      </main>
    </div>);
}
