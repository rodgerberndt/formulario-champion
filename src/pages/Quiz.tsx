import { useState, useEffect, useCallback, memo, useRef } from "react";
import { getNavigationForLead, saveAdvancedMatching, eventIdsForLead } from "@/lib/metaTracking";
import { useNavigate, useLocation } from "react-router-dom";
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
  MERCADO_OPTIONS } from
"@/lib/leadScoring";
import {
  digitosParaValor,
  faixaDoFaturamento,
  faturamentoSuspeito,
  formatarReais } from
"@/lib/faturamento";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture, getUtmForDb, getAttributionSource } from "@/hooks/useUtmCapture";
import { instagramValido, normalizarInstagram } from "@/lib/instagramUsuario";
import { resgatarAtribuicaoDoLead } from "@/lib/atribuicaoPaga";
import { PhoneField, isPhoneE164Valid } from "@/components/PhoneField";
import { getQuizVariantByPath, visitaNoTeste, QUIZ_CONTROLE } from "@/config/quizVariants";
import { codigoDeTesteMeta } from "@/lib/ambienteMeta";

const env = import.meta.env as Record<string, string | undefined>;
const externalSupabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const externalSupabaseAnonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!externalSupabaseUrl || !externalSupabaseAnonKey) {
  throw new Error("External Supabase env vars are missing (SUPABASE_URL/SUPABASE_ANON_KEY)");
}

const supabaseExternal = createClient(externalSupabaseUrl, externalSupabaseAnonKey);

// Roteamento pós-submit por faixa de investimento — decide o PRODUTO, não o SDR:
//  - "Não vendo ainda", "Até R$ 5 mil" ou "R$ 5-10 mil" → /obrigadosprint (Sprint)
//  - ≥ R$ 10 mil → /obrigadomql (Assessoria)
// Desde 14/08/2026 o Miguel atende os dois lados; o Gustavo saiu. As faixas
// continuam separadas porque Sprint e Assessoria são ofertas diferentes.
// "Não vendo ainda" saiu do bucket sem SDR em 2026-07-11 — antes redirecionava
// pra fora do site sem ninguém ligar pro lead.
const MQL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil", "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil", "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil", "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões", "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];
const SPRINT_FAIXAS = ["Não vendo ainda (R$0/mês)", "Até R$ 5 mil", "De R$ 5 mil a R$ 10 mil"];

/** Duração da animação da tela de envio. O lead é gravado antes disso, não depois. */
const LOADING_MS = 10000;

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  email: string;
  mercado: string;
  operacoes_ativas: number | null;
  /**
   * Faturamento total somando TODAS as operações, em reais, digitado pelo lead.
   * Guardado como texto porque o campo é mascarado; vira número no envio.
   */
  faturamento_valor: string;
  /** Derivada de `faturamento_valor`. Continua sendo a régua de MQL. */
  investimento_faixa: string;
  dor_desejo: string;
  quer_vender_mais: string;
  lgpd: boolean;
  /** "Sim" | "Talvez" | "Não" — virou pergunta de verdade em 25/08/2026. */
  compromisso_whatsapp: string;
  nps_score: number | null;
  aceita_call_diagnostico: string;
  /**
   * Investimento mensal em trafego pago, declarado pelo lead (07/09/2026).
   * Coleta de EXPERIMENTO: nao entra no score, nao decide MQL e nao muda
   * roteamento. Existe para descobrir se capacidade real de investimento
   * explica venda alem do faturamento declarado. Gravado em leads.trafego_faixa.
   */
  trafego_faixa: string;
  /** Só para quem declara faixa acima de R$ 500 mil: "faturei" | "media" | "espera". */
  faturamento_confirmado: string;
}

// v5: o faturamento virou número digitado (a faixa passou a ser derivada dele).
// Progresso salvo em v4 tem `investimento_faixa` sem o número que a originou, e
// retomar aquilo devolveria o lead a uma tela que não existe mais.
// v6 em 07/09/2026: o quiz ganhou um passo (q13_trafego) e o loading virou o 14.
// Sem trocar a chave, quem estava no meio do quiz com progresso salvo em v5
// voltaria no passo errado.
const STORAGE_KEY = "champion_quiz_progress_v6";
const RESULT_STORAGE_KEY = "champion_quiz_result";

// Step IDs for tracking (13 steps: o compromisso no WhatsApp entrou antes do loading)
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
  "q12_compromisso_whats",
  // Pergunta de EXPERIMENTO, adicionada em 07/09/2026. Entrou no FIM do quiz de
  // proposito: quem chega aqui ja respondeu tudo, entao o custo em conversao e o
  // menor possivel, e nenhum passo existente mudou de posicao (o funil do admin
  // continua lendo os mesmos ids de q1 a q11).
  "q13_trafego",
  "q14_loading",
];

/**
 * Investimento mensal em trafego pago. Faixas novas, escolhidas em 07/09/2026.
 *
 * A coluna leads.trafego_faixa existe desde fevereiro e NUNCA foi preenchida
 * (0 linhas em toda a base), por isso da para reusar sem misturar semantica: nao
 * ha historico com as faixas antigas para confundir com estas.
 */
const TRAFEGO_OPTIONS = [
  "Nao invisto ainda",
  "Ate R$ 2 mil",
  "R$ 2 mil a R$ 10 mil",
  "R$ 10 mil a R$ 30 mil",
  "R$ 30 mil a R$ 100 mil",
  "Acima de R$ 100 mil",
];

// Faixas que disparam a confirmação do faturamento declarado.
//
// Acima de R$ 1 milhão são 49 leads na base, nenhuma assessoria fechada, e o
// único que agendou reunião não compareceu. Parte disso é gente declarando o
// que espera faturar. A pergunta separa caixa de expectativa.
const FAIXAS_CONFIRMACAO = new Set([
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões", "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
]);


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
/**
 * Tela de espera do envio.
 *
 * Duas coisas erradas moravam aqui, as duas corrigidas em 26/08/2026:
 *
 * 1. Ela marcava `compromisso_whatsapp = true` sozinha, para todo lead que
 *    chegasse até aqui, e esse campo valia 10 pontos na Taxa de Qualificação.
 *    Agora o compromisso é uma pergunta de verdade, no step 12.
 *
 * 2. O lead só era gravado DEPOIS de dez segundos de `setTimeout`. Quem
 *    fechava a aba nesse meio tempo virava lead nenhum — e no celular nem
 *    precisa fechar: o navegador congela o timer quando a aba sai de foco,
 *    então bastava olhar uma notificação. Eram 2,6% dos leads que tinham
 *    respondido o quiz INTEIRO, os mais caros que existem. Agora o envio
 *    dispara no mesmo instante em que a tela aparece, e os dez segundos
 *    valem só para a animação.
 */
function LoadingCommitStep({
  onFinish,
  onStart,
  submitFailed,
  onRetry,
}: {
  onFinish: () => void;
  onStart: () => void;
  submitFailed: boolean;
  onRetry: () => void;
}) {
  const onFinishRef = useRef(onFinish);
  const onStartRef = useRef(onStart);
  onFinishRef.current = onFinish;
  onStartRef.current = onStart;
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    onStartRef.current();
    onFinishRef.current();
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
  const { pathname } = useLocation();
  const { trackQuizPageView, trackIntroEnd, trackStepView, trackStepNext, trackStepBack, trackSubmit } = useTracking();
  const { getUtmPayload } = useUtmCapture();

  // Célula do teste A/B, decidida pelo path. Fora do teste, /quiz devolve o
  // controle, então todo o resto do componente segue funcionando igual.
  const variante = getQuizVariantByPath(pathname);
  // A Q3 não tem a pergunta de engajamento: o quiz abre no mercado. Os IDs dos
  // passos NÃO são renumerados de propósito — na Q3 o passo "q1_quer_vender"
  // simplesmente não existe, e "q2_mercado" continua sendo q2_mercado. É isso
  // que deixa o relatório comparar as células passo a passo sem desalinhar.
  const primeiroPasso = variante.perguntaEngajamento ? 1 : 2;

  const [step, setStep] = useState(primeiroPasso);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [introCanSkip, setIntroCanSkip] = useState(false);

  const introAbertaEm = useRef(Date.now());
  const introJaFechou = useRef(false);

  // O fim da abertura é o evento que separa duas desistências que hoje se
  // confundem: quem sai no aviso e quem sai na primeira pergunta. As duas
  // moram na mesma tela, e sem esta marca a única leitura possível era "parou
  // no começo".
  const fecharIntro = useCallback((como: "pulou" | "esperou") => {
    if (introJaFechou.current) return;
    introJaFechou.current = true;
    setShowIntro(false);
    const segundos = Math.round((Date.now() - introAbertaEm.current) / 100) / 10;
    trackIntroEnd(como, segundos).catch(() => {});
  }, [trackIntroEnd]);

  // Allow skipping intro after 3s; auto-close after 10s
  useEffect(() => {
    const skipTimer = setTimeout(() => setIntroCanSkip(true), 3000);
    const t = setTimeout(() => fecharIntro("esperou"), 10000);
    return () => {
      clearTimeout(t);
      clearTimeout(skipTimer);
    };
  }, [fecharIntro]);

  const formDataRef = useRef<QuizFormData | null>(null);
  const [phoneValid, setPhoneValid] = useState(false);
  const [formData, setFormData] = useState<QuizFormData>({
    nome_completo: "",
    whatsapp: "",
    instagram: "",
    email: "",
    mercado: "",
    operacoes_ativas: null,
    faturamento_valor: "",
    investimento_faixa: "",
    dor_desejo: "",
    quer_vender_mais: "",
    lgpd: false,
    compromisso_whatsapp: "",
    nps_score: null,
    aceita_call_diagnostico: "",
    faturamento_confirmado: "",
    trafego_faixa: "",
  });

  const totalSteps = 14;
  const hasTrackedQuizView = useRef(false);
  const lastTrackedStep = useRef<number | null>(null);
  const hasSubmittedRef = useRef(false); // Hard guard against double-submit
  // Quando a tela de envio apareceu. O lead é gravado na hora; este marcador
  // serve só para a navegação respeitar os 10 segundos da animação.
  const loadingStartedAtRef = useRef<number | null>(null);
  const isAdvancingRef = useRef(false); // Prevents double-click on next button

  // Track quiz page view on mount
  useEffect(() => {
    if (!hasTrackedQuizView.current) {
      hasTrackedQuizView.current = true;
      // A célula só é gravada para quem está DE FATO no teste. Quem chega por
      // outra campanha vê o controle, mas não entra na contagem dele: gravar
      // "Q5" para todo mundo encheria o controle de gente de outro criativo,
      // outra oferta e outra landing, e a comparação deixaria de valer.
      // Abrir /quiz/q3 na mão continua contando: é uma escolha explícita.
      const noTeste = variante.path !== QUIZ_CONTROLE.path || visitaNoTeste();
      trackQuizPageView(noTeste ? { codigo: variante.codigo, path: variante.path } : undefined);
    }
  }, [trackQuizPageView, variante.codigo, variante.path]);

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
        // Progresso salvo antes de a célula mudar não pode devolver a
        // pessoa a um passo que esta variante não tem.
        const safeStep = Math.max(primeiroPasso, Math.min(parsed.step, totalSteps - 1));
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

  // Valor numérico do faturamento e a conferência de ordem de grandeza. Os dois
  // saem do mesmo texto mascarado e são usados na tela e no envio.
  const faturamentoNumero = digitosParaValor(formData.faturamento_valor);
  const suspeitaFaturamento = faturamentoSuspeito(faturamentoNumero);

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return formData.quer_vender_mais !== "";
      case 2:
        return formData.mercado !== "";
      case 3:
        return formData.operacoes_ativas !== null;
      case 4:
        // Campo vazio não passa. Zero passa: "não vendo ainda" é resposta, e
        // exigir número positivo empurraria esse lead a inventar um.
        if (formData.faturamento_valor.trim() === "") return false;
        if (formData.investimento_faixa === "") return false;
        // Faixa alta só passa depois de dizer se o número é caixa ou expectativa.
        if (FAIXAS_CONFIRMACAO.has(formData.investimento_faixa)) {
          return formData.faturamento_confirmado !== "";
        }
        return true;
      case 5:
        return formData.nome_completo.trim().length >= 3;
      case 6: {
        return phoneValid && isPhoneE164Valid(formData.whatsapp) && formData.lgpd;
      }
      case 7:
        // "@" sozinho tem comprimento 1 e passava na régua antiga.
        return instagramValido(formData.instagram);
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
        return formData.compromisso_whatsapp !== "";
      case 13:
        return formData.trafego_faixa !== "";
      case 14:
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

    // O Instagram é normalizado UMA vez, aqui, e vale para todos os destinos
    // deste envio (banco, quiz_leads, n8n, tracking, página de obrigado): URL
    // colada vira usuário, espaço e "@" repetido somem. Ver
    // src/lib/instagramUsuario.ts — a validação do passo 7 aceitava "@" sozinho
    // até 18/09/2026, e um lead real entrou assim.
    const bruto = formDataRef.current || formData;
    const currentData = { ...bruto, instagram: normalizarInstagram(bruto.instagram) };
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
        quer_vender_mais: currentData.quer_vender_mais,
        compromisso_whatsapp: currentData.compromisso_whatsapp,
        aceita_call_diagnostico: currentData.aceita_call_diagnostico,
        dor_desejo: currentData.dor_desejo,
        nps_score: currentData.nps_score,
        faturamento_confirmado: currentData.faturamento_confirmado,
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

      const navegacao = getNavigationForLead();
      const fbp = navegacao.fbp;

      // Página de destino real do lead (usada como event_source_url no CAPI, pra bater
      // com a URL onde o pixel client-side vai efetivamente disparar o mesmo evento —
      // ver roteamento no fim do envio, MQL_FAIXAS/SPRINT_FAIXAS).
      //
      // Calculada ANTES do insert desde 18/09/2026: ela vai junto do lead em
      // `destino_conversao`, e é dela que o GATILHO do banco tira o
      // event_source_url. O gatilho não recebia nada e caía no palpite do
      // `fire-capi-events` (`/obrigadosprint` para faixa não-MQL), que diverge
      // da URL usada pelo pixel sempre que o destino real é outro.
      const destinationPath = MQL_FAIXAS.includes(currentData.investimento_faixa)
        ? "/obrigadomql"
        : "/obrigadosprint";
      const destinoAbsoluto = `${window.location.origin}${destinationPath}`;

      const dbData = {
        nome_completo: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        email: currentData.email,
        mercado: currentData.mercado,
        operacoes_ativas: currentData.operacoes_ativas,
        investimento_faixa: currentData.investimento_faixa,
        // O número que o lead digitou. A faixa acima é derivada dele e continua
        // sendo a régua de MQL; este campo é o que permite ver a distribuição
        // dentro da faixa, que a faixa sozinha esconde.
        faturamento_declarado: digitosParaValor(currentData.faturamento_valor),
        dor_desejo: currentData.dor_desejo,
        // EXPERIMENTO 07/09/2026. Coluna legada , reusada porque
        // a semantica e a mesma (investimento mensal em trafego) e ela nunca
        // teve uma linha preenchida em toda a base — nao ha historico com as
        // faixas antigas para se misturar com estas.
        trafego_faixa: currentData.trafego_faixa || null,
        score: scoreResult.score,
        // A NOTA SOZINHA NÃO DIZ DE ONDE VEIO.
        //
        // `calcularNota` já devolve `breakdown` e `version`; até 11/09/2026 o
        // insert descartava os dois e gravava só o total. As colunas existem
        // desde a migration 20260826120000, mas nunca foram preenchidas ao
        // vivo — o que havia era um recálculo em massa rodado uma única vez em
        // 28/08/2026 21:06, que cobriu os 2.168 leads existentes até ali e,
        // naturalmente, nenhum lead nascido depois.
        //
        // Sem isto não é possível responder "QUAL componente da nota caiu",
        // que foi exatamente a pergunta que a autópsia da CA03-BMsss não
        // conseguiu responder para os 78 leads do período deteriorado.
        //
        // Isto NÃO altera fórmula, pesos, threshold nem MQL: grava o que o
        // scorer já calculou.
        score_breakdown: scoreResult.breakdown,
        score_version: scoreResult.version,
        score_calculated_at: new Date().toISOString(),
        tier,
        nps_score: currentData.nps_score,
        raw_answers_json: JSON.parse(JSON.stringify(currentData)),
        attribution_source: getAttributionSource(),
        ip_address: clientIp,
        fbp,
        // Dados de navegação para a CAPI identificar a pessoa depois (venda,
        // reunião): cookie do clique, navegador, página. Ver src/lib/metaTracking.ts.
        fbc: navegacao.fbc,
        user_agent: navegacao.user_agent,
        page_url: navegacao.page_url,
        session_id: navegacao.session_id,
        // Para onde ESTE lead vai agora — a URL que o gatilho do banco usa
        // como event_source_url, a mesma que o pixel usa no navegador.
        destino_conversao: destinoAbsoluto,
        // REDE DE BAIXO (18/09/2026). `campaign_id`/`adset_id`/`ad_id`/
        // `utm_content` vazios são preenchidos pelo toque pago guardado antes
        // de o lead nascer — mesma ideia do resgate de `placement` no gatilho
        // (migration 20260911150000). Valor entregue pelo navegador sempre
        // manda; campo cheio não é tocado. Ver src/lib/atribuicaoPaga.ts.
        ...resgatarAtribuicaoDoLead(getUtmPayload())
      };

      const leadId = crypto.randomUUID();
      let { error } = await supabase.from("leads").insert([{ id: leadId, ...dbData }]);
      // Se a migration das colunas novas (navegação e detalhe da nota) ainda
      // não estiver no banco, o lead NÃO pode se perder: tenta de novo sem
      // elas. O lead vale mais que a telemetria dele.
      if (error && /column|schema cache|PGRST204|42703/i.test(`${error.code} ${error.message}`)) {
        console.warn("[lead] insert sem colunas opcionais (migration pendente):", error.message);
        const {
          fbc: _a, user_agent: _b, page_url: _c, session_id: _d,
          score_breakdown: _e, score_version: _f, score_calculated_at: _g,
          // `destino_conversao` só existe depois da migration 20260918180000.
          // Sem esta linha, site novo + banco velho derrubaria todo insert.
          destino_conversao: _h,
          ...semColunasOpcionais
        } = dbData;
        ({ error } = await supabase.from("leads").insert([{ id: leadId, ...semColunasOpcionais }]));
      }

      if (error) throw error;

      const insertedLead = { id: leadId };

      // Persist for "skip queue" tracking on /obrigado pages
      try { localStorage.setItem('champion_lead_id', leadId); } catch {}

      // Advanced matching do pixel na página de obrigado (lida no index.html
      // no fbq('init')): e-mail, telefone e nome normalizados.
      saveAdvancedMatching({ email: currentData.email, whatsapp: currentData.whatsapp, nome: currentData.nome_completo, leadId });

      // Ids determinísticos por lead e evento. Navegador e servidor (fire-capi-
      // events, gatilho do banco, kommo) chegam ao MESMO id sem combinar nada,
      // e o Meta desduplica. Antes levavam timestamp e cada chamador gerava
      // um id diferente: o Lead contava duas vezes.
      const eventTimestamp = Math.floor(Date.now() / 1000);
      const eventIds: Record<string, string> = eventIdsForLead(insertedLead.id);

      localStorage.setItem('champion_event_ids', JSON.stringify({
        lead_id: insertedLead?.id,
        event_ids: eventIds,
        timestamp: eventTimestamp,
      }));

      // CAPI events (background)
      if (insertedLead?.id) {
        // `test_event_code` fora do domínio de produção: o evento aparece em
        // "Testar eventos" no Gerenciador e o Meta não o conta em métrica
        // nenhuma. Ver src/lib/ambienteMeta.ts.
        const codigoTesteCapi = codigoDeTesteMeta();
        supabase.functions.invoke('fire-capi-events', {
          body: {
            lead_db_id: insertedLead.id,
            event_ids: eventIds,
            event_source_url: destinoAbsoluto,
            ...(codigoTesteCapi ? { test_event_code: codigoTesteCapi } : {}),
          },
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
          faturamento_declarado: digitosParaValor(currentData.faturamento_valor),
          faturamento_confirmado: currentData.faturamento_confirmado,
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

      // O lead já está gravado. O que sobra aqui é só respeitar o tempo da
      // animação de envio, para o lead não ser jogado na página de obrigado
      // um segundo depois de responder.
      const decorrido = Date.now() - (loadingStartedAtRef.current ?? Date.now());
      const restante = LOADING_MS - decorrido;
      if (restante > 0) await new Promise((r) => setTimeout(r, restante));

      const faixa = currentData.investimento_faixa;
      // Navegação COMPLETA (não SPA) para a página de obrigado: o pixel só
      // aceita advanced matching no `init`, e o init acontece no index.html.
      // Recarregar a página faz o pixel nascer já com e-mail, telefone e nome
      // do lead (champion_am). Antes o Lead do navegador saía sem nada disso.
      if (MQL_FAIXAS.includes(faixa)) {
        // ≥ R$ 10 mil → Assessoria
        window.location.assign("/obrigadomql");
      } else if (SPRINT_FAIXAS.includes(faixa)) {
        // "Não vendo ainda", até R$ 5 mil ou R$ 5-10 mil → Sprint
        window.location.assign("/obrigadosprint");
      } else {
        // Faixa não reconhecida (dado legado/inesperado) — fallback de segurança.
        // Já apontou para sprint.championadstudio.com, que NÃO EXISTE (NXDOMAIN):
        // o lead era gravado e depois via uma tela de erro de DNS. A página
        // interna faz o mesmo trabalho e não depende de domínio nenhum.
        window.location.assign("/obrigadosprint");
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
        case 12: fieldData.compromisso_whatsapp = formData.compromisso_whatsapp; break;
        case 13: fieldData.trafego_faixa = formData.trafego_faixa; break;
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
    if (step > primeiroPasso && step < totalSteps) {
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
            {variante.provaNoMercado && (
              // A prova entra ACIMA da pergunta: 90% do tráfego é celular e
              // abaixo do seletor ninguém rola para ver.
              <img
                src="/prova-mercado.jpg"
                alt="Cliente da Champion com R$ 27.540 investidos e 81 compras no mês"
                width={600}
                height={785}
                loading="eager"
                className="w-full rounded-xl border border-border/60"
              />
            )}
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              {variante.perguntaMercado}
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
              Quanto de faturamento total em todas as suas operações hoje?
            </label>

            {/* Número digitado, não faixa escolhida. A lista de faixas ensinava
                a resposta: quem faturava 9 mil via "De R$ 10 mil a R$ 20 mil"
                logo abaixo e arredondava para cima — em cima da régua de MQL.
                A faixa continua existindo, derivada do número. */}
            <div>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="R$ 0"
                value={formData.faturamento_valor}
                onChange={(e) => {
                  const valor = digitosParaValor(e.target.value);
                  updateField("faturamento_valor", valor === null ? "" : formatarReais(valor));
                  updateField("investimento_faixa", faixaDoFaturamento(valor));
                  // Trocar o valor invalida a confirmação anterior: quem
                  // corrigiu de 50 mil para 500 mil precisa dizer de novo se é
                  // caixa ou expectativa.
                  updateField("faturamento_confirmado", "");
                }}
                className="h-12 sm:h-14 text-lg sm:text-xl font-semibold bg-input border-2 border-border/60 rounded-xl focus:border-primary tabular-nums"
              />
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                Some todas as operações e informe o valor real do mês. É por este
                número que a Champion define se consegue ajudar sua operação.
              </p>
            </div>

            {/* Conferência de ordem de grandeza. Digitar "50" querendo dizer
                "50 mil" é o erro mais comum de campo livre de dinheiro, e ele
                derruba um MQL para fora da régua sem ninguém perceber. */}
            {suspeitaFaturamento === "baixo_demais" && (
              <p className="flex gap-2 text-xs sm:text-sm text-amber-400 border border-amber-500/25 bg-amber-500/5 rounded-xl p-3 animate-fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Confirma que é <strong>{formData.faturamento_valor}</strong> por mês? Se
                  quis dizer mil, escreva o número inteiro (50 mil = 50000).
                </span>
              </p>
            )}
            {suspeitaFaturamento === "alto_demais" && (
              <p className="flex gap-2 text-xs sm:text-sm text-amber-400 border border-amber-500/25 bg-amber-500/5 rounded-xl p-3 animate-fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Confirma que é <strong>{formData.faturamento_valor}</strong> por mês?
                  Parece ter um dígito a mais.
                </span>
              </p>
            )}

            {/* Confirmação do faturamento — só para faixa alta. Separa quem
                tem o caixa de quem tem a expectativa. */}
            {FAIXAS_CONFIRMACAO.has(formData.investimento_faixa) && (
              <div className="space-y-3 animate-fade-in pt-1">
                <label className="block text-sm sm:text-base font-medium text-foreground leading-snug">
                  Esse valor é o que você já fatura, ou o que espera faturar?
                </label>
                <div className="grid gap-2">
                  {[
                    { v: "faturei", t: "Foi o que faturei no mês passado" },
                    { v: "media", t: "É a minha média dos últimos meses" },
                    { v: "espera", t: "É o que eu espero faturar" },
                  ].map((opt) => {
                    const selected = formData.faturamento_confirmado === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => updateField("faturamento_confirmado", opt.v)}
                        className={`h-11 sm:h-12 rounded-xl border-2 text-sm sm:text-base font-medium px-3 text-left transition-colors duration-200 ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                            : "bg-input text-foreground border-border/60 hover:border-primary/60"
                        }`}>
                        {opt.t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>);

      case 1:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              {variante.perguntaEngajamento}
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
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="bg-secondary/10 border border-secondary/20 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-secondary shrink-0" />
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Última pergunta, de verdade agora.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
                Nosso time vai te chamar no WhatsApp hoje. Você se compromete a responder?
              </label>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Quem responde rápido entra na frente da fila do diagnóstico.
              </p>
            </div>

            <div className="grid gap-2.5">
              {[
                { v: "Sim", t: "Sim, respondo assim que chegar" },
                { v: "Talvez", t: "Talvez, posso demorar um pouco" },
                { v: "Não", t: "Não" },
              ].map((opt) => {
                const selected = formData.compromisso_whatsapp === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => {
                      // Sem avanco automatico: o lead precisa poder trocar um clique errado.
                      // Quem avanca e o Continuar do rodape, que ja dispara o trackStepNext
                      // com o mesmo par de STEP_IDS e o mesmo fieldData.
                      updateField("compromisso_whatsapp", opt.v);
                    }}
                    className={`h-12 sm:h-14 rounded-xl border-2 text-sm sm:text-base font-semibold px-4 text-left transition-colors duration-200 ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                        : "bg-input text-foreground border-border/60 hover:border-primary/60"
                    }`}>
                    {opt.t}
                  </button>
                );
              })}
            </div>
          </div>);

      // ── EXPERIMENTO 07/09/2026: investimento em trafego ──────────────────
      // Nao pontua, nao decide MQL, nao muda roteamento. So grava.
      case 13:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <div className="space-y-3">
              <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
                Quanto voce investe em trafego pago por mes hoje?
              </label>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                E so pra entender o tamanho da operacao. Nao muda nada no seu diagnostico.
              </p>
            </div>

            <div className="grid gap-2.5">
              {TRAFEGO_OPTIONS.map((opt) => {
                const selected = formData.trafego_faixa === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      // Sem avanco automatico: o lead precisa poder trocar um clique errado.
                      // Quem avanca e o Continuar do rodape, que ja dispara o trackStepNext
                      // com o mesmo par de STEP_IDS e o mesmo fieldData.
                      updateField("trafego_faixa", opt);
                    }}
                    className={`h-12 sm:h-14 rounded-xl border-2 text-sm sm:text-base font-semibold px-4 text-left transition-colors duration-200 ${
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

      case 14:
        return (
          <LoadingCommitStep
            onFinish={handleSubmit}
            onStart={() => { loadingStartedAtRef.current = Date.now(); }}
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
              <h2 className={`font-bold text-white leading-snug ${
                variante.introCredito
                  ? "text-lg sm:text-xl italic"
                  : "text-xl sm:text-2xl"
              }`}>
                {variante.introDestaque
                  ? (() => {
                      // O destaque é sempre o final da frase, como na landing:
                      // o texto corre normal e a última parte vem em dourado.
                      const corte = variante.introTitulo.lastIndexOf(variante.introDestaque);
                      return (
                        <>
                          {variante.introTitulo.slice(0, corte)}
                          <span className="text-secondary not-italic">{variante.introDestaque}</span>
                        </>
                      );
                    })()
                  : variante.introTitulo}
              </h2>
              {variante.introCredito && (
                <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                  {variante.introCredito}
                </p>
              )}
              <p className="text-base sm:text-lg text-white/95 leading-relaxed font-medium">
                Ao preencher esta aplicação, você concorda que{" "}
                <span className="text-secondary font-bold">trabalha com o digital</span>.
                {variante.introAviso === "completo" && (
                  <>
                    {" "}Se você não trabalha com o digital, e não quer vender mais,{" "}
                    <span className="text-secondary font-bold">saia desta aplicação imediatamente</span>.
                  </>
                )}
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
                onClick={() => fecharIntro("pulou")}
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
                <div className={`mt-6 sm:mt-8 ${step > primeiroPasso ? 'flex flex-col-reverse sm:flex-row gap-3' : ''}`}>
                  {step > primeiroPasso &&
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
