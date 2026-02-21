import { useState, useEffect, useCallback, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
import { ChevronRight, ChevronLeft, Check, Loader2, ArrowLeft, Target, MessageCircle } from "lucide-react";
import {
  calculateLeadScore,
  MERCADO_OPTIONS,
  INVESTIMENTO_OPTIONS } from
"@/lib/leadScoring";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture, getUtmForDb } from "@/hooks/useUtmCapture";

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  email: string;
  mercado: string;
  investimento_faixa: string;
  dor_desejo: string;
  lgpd: boolean;
  compromisso_whatsapp: boolean;
}

const STORAGE_KEY = "champion_quiz_progress";
const RESULT_STORAGE_KEY = "champion_quiz_result";

// Step IDs for tracking
const STEP_IDS = [
"q1_nome",
"q2_whats",
"q3_insta",
"q4_email",
"q5_mercado",
"q6_faturamento",
"q7_dor",
"q8_loading"];


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

// Loading commitment step component
function LoadingCommitStep({ onFinish, onCommit }: {onFinish: () => void; onCommit: (v: boolean) => void;}) {
  const [progress, setProgress] = useState(0);
  const [committed, setCommitted] = useState(false);
  const hasSubmitted = useRef(false);
  const hasFinished = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // ~15 seconds total: 100 / 0.27 ≈ 370 ticks * 40ms ≈ 14800ms
        return prev + 0.27;
      });
    }, 40);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100 && !hasSubmitted.current && !hasFinished.current) {
      hasSubmitted.current = true;
      // Small delay after bar fills for UX
      setTimeout(() => {
        if (!hasFinished.current) {
          hasFinished.current = true;
          onFinish();
        }
      }, 600);
    }
  }, [progress, onFinish]);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in text-center">
      {/* Loading indicator */}
      <div className="space-y-3">
        <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm sm:text-base">
          Processando suas informações...
        </p>
        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden max-w-[240px] mx-auto">
          <div
            className="h-full bg-primary rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${Math.min(progress, 100)}%` }} />

        </div>
      </div>

      {/* Commitment question */}
      <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 text-secondary shrink-0 mt-0.5" />
          <p className="text-secondary font-bold text-base sm:text-lg leading-snug text-left">
            Quando um de nossos consultores lhe chamar no WhatsApp em até 6 horas, você se compromete a responder o mais rápido possível?
          </p>
        </div>
      <button
          onClick={() => { 
            setCommitted(true); 
            onCommit(true); 
            // Advance immediately on click - but only once
            if (!hasFinished.current) {
              hasFinished.current = true;
              setTimeout(() => onFinish(), 400);
            }
          }}
          disabled={committed}
          className={`mt-2 w-full py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 ${
          committed ?
          "bg-green-500/20 border-2 border-green-500/50 text-green-400" :
          "bg-secondary/20 border-2 border-secondary/40 text-secondary hover:bg-secondary/30"}`
          }>

          {committed ?
          <span className="flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              Compromisso firmado!
            </span> :

          "Sim, me comprometo! 🤝"
          }
        </button>
      </div>
    </div>);

}

export default function Quiz() {
  const navigate = useNavigate();
  const { trackQuizPageView, trackStepView, trackStepNext, trackStepBack, trackSubmit } = useTracking();
  const { getUtmPayload } = useUtmCapture();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formDataRef = useRef<QuizFormData | null>(null);
  const [formData, setFormData] = useState<QuizFormData>({
    nome_completo: "",
    whatsapp: "",
    instagram: "",
    email: "",
    mercado: "",
    investimento_faixa: "",
    dor_desejo: "",
    lgpd: false,
    compromisso_whatsapp: false
  });

  const totalSteps = 8;
  const hasTrackedQuizView = useRef(false);
  const lastTrackedStep = useRef<number | null>(null);

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
      trackStepView(stepId);
      lastTrackedStep.current = step;
    }
  }, [step, trackStepView]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({ ...prev, ...parsed.formData }));
        if (parsed.step && parsed.step <= totalSteps) {
          setStep(parsed.step);
        }
      } catch {

        // Invalid saved data
      }}
  }, []);

  // Keep ref in sync so handleSubmit always reads latest formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, step }));
  }, [formData, step]);

  const updateField = useCallback((field: keyof QuizFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const formatWhatsApp = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const canProceed = useCallback(() => {
    switch (step) {
      case 1:
        return formData.nome_completo.trim().length >= 3;
      case 2: {
        const digits = formData.whatsapp.replace(/\D/g, '');
        // Must be 10-11 digits, DDD 11-99, and mobile must start with 9
        const validDDD = digits.length >= 2 && parseInt(digits.slice(0, 2)) >= 11 && parseInt(digits.slice(0, 2)) <= 99;
        const validMobile = digits.length === 11 && digits[2] === '9';
        const validLandline = digits.length === 10;
        return (validDDD && (validMobile || validLandline)) && formData.lgpd;
      }
      case 3:
        return formData.instagram.trim().length >= 1;
      case 4: {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(formData.email.trim());
      }
      case 5:
        return formData.mercado !== "";
      case 6:
        return formData.investimento_faixa !== "";
      case 7:
        return formData.dor_desejo.trim().length >= 10;
      case 8:
        return true;
      default:
        return false;
    }
  }, [step, formData]);

  const handleSubmit = async () => {
    if (!canProceed() || isSubmitting) return;

    // Use ref to always get the latest formData (avoids stale closure with compromisso_whatsapp)
    const currentData = formDataRef.current || formData;

    setIsSubmitting(true);
    try {
      const result = calculateLeadScore({
        mercado: currentData.mercado,
        investimento_faixa: currentData.investimento_faixa,
        dor_desejo: currentData.dor_desejo
      });

      const dbData = {
        nome_completo: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        email: currentData.email,
        mercado: currentData.mercado,
        investimento_faixa: currentData.investimento_faixa,
        dor_desejo: currentData.dor_desejo,
        score: result.score,
        tier: result.tier,
        raw_answers_json: JSON.parse(JSON.stringify(currentData)),
        ...getUtmPayload()
      };

      const { error } = await supabase.from("leads").insert([dbData]);

      if (error) throw error;

      // Send to Kommo in background (trigger doesn't work in Lovable Cloud)
      supabase.functions.invoke('kommo-webhook', {
        body: dbData
      }).then((res) => {
        console.log('Kommo sync triggered:', res);
      }).catch((err) => {
        console.error('Kommo sync error:', err);
      });

      // Track submit with lead data
      await trackSubmit({
        name: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        market: currentData.mercado,
        stage: currentData.mercado
      });

      localStorage.removeItem(STORAGE_KEY);

      // Save result data for the thank you page
      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({
        nome_completo: currentData.nome_completo,
        whatsapp: currentData.whatsapp,
        instagram: currentData.instagram,
        email: currentData.email,
        mercado: currentData.mercado,
        investimento_faixa: currentData.investimento_faixa,
        dor_desejo: currentData.dor_desejo
      }));

      toast({
        title: "Diagnóstico enviado!",
        description: "Em breve entraremos em contato."
      });

      // Redirect to thank you page
      navigate("/obrigado");
    } catch (error) {
      console.error("Error submitting lead:", error);
      toast({
        title: "Erro ao enviar",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = async () => {
    if (canProceed() && step < totalSteps) {
      const fromStepId = STEP_IDS[step - 1];
      const toStepId = STEP_IDS[step];

      // Get the field value for the current step
      const fieldData: Record<string, string> = {};
      switch (step) {
        case 1:
          fieldData.nome = formData.nome_completo;
          break;
        case 2:
          fieldData.whatsapp = formData.whatsapp;
          break;
        case 3:
          fieldData.instagram = formData.instagram;
          break;
        case 4:
          fieldData.email = formData.email;
          break;
        case 5:
          fieldData.mercado = formData.mercado;
          break;
        case 6:
          fieldData.investimento = formData.investimento_faixa;
          break;
        case 7:
          fieldData.dor_desejo = formData.dor_desejo;
          break;
      }

      await trackStepNext(fromStepId, toStepId, fieldData);
      setStep(step + 1);
    } else if (step === totalSteps && canProceed()) {
      handleSubmit();
    }
  };

  const prevStep = async () => {
    if (step > 1) {
      const fromStepId = STEP_IDS[step - 1];
      const toStepId = STEP_IDS[step - 2];
      await trackStepBack(fromStepId, toStepId);
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

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu nome completo?
            </label>
            <Input
              className={inputClasses}
              placeholder="Digite seu nome"
              value={formData.nome_completo}
              onChange={(e) => updateField("nome_completo", e.target.value)}
              autoFocus />

          </div>);

      case 2:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu WhatsApp?
            </label>
            <Input
              className={inputClasses}
              placeholder="(00) 00000-0000"
              value={formData.whatsapp}
              onChange={(e) => updateField("whatsapp", formatWhatsApp(e.target.value))}
              inputMode="tel"
              maxLength={16}
              autoFocus />
            {(() => {
              const digits = formData.whatsapp.replace(/\D/g, '');
              if (digits.length > 0 && digits.length < 10) {
                return <p className="text-xs text-destructive">Digite um número completo com DDD</p>;
              }
              if (digits.length >= 10) {
                const ddd = parseInt(digits.slice(0, 2));
                if (ddd < 11 || ddd > 99) {
                  return <p className="text-xs text-destructive">DDD inválido</p>;
                }
                if (digits.length === 11 && digits[2] !== '9') {
                  return <p className="text-xs text-destructive">Celular deve começar com 9 após o DDD</p>;
                }
                if (digits.length === 10 && digits[2] === '9') {
                  return <p className="text-xs text-destructive">Número incompleto — falta um dígito</p>;
                }
              }
              return null;
            })()}

            <div className="flex items-start gap-2.5 pt-1">
              <Checkbox
                id="lgpd"
                checked={formData.lgpd}
                onCheckedChange={(checked) => updateField("lgpd", checked === true)}
                className="border-2 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5 mt-0.5 rounded-md shrink-0" />

              <label htmlFor="lgpd" className="text-xs sm:text-sm text-muted-foreground cursor-pointer leading-relaxed">Concordo em receber contato sobre o diagnóstico, e responder o mais rápido possível.

              </label>
            </div>
          </div>);

      case 3:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu Instagram?
            </label>
            <Input
              className={inputClasses}
              placeholder="@seuinstagram"
              value={formData.instagram}
              onChange={(e) => updateField("instagram", e.target.value)}
              autoFocus />

          </div>);

      case 4:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu e-mail?
            </label>
            <Input
              className={inputClasses}
              placeholder="seu@email.com"
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              autoFocus />
          </div>);

      case 5:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Em que mercado você trabalha?
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

      case 6:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            <label className="block text-[17px] sm:text-lg md:text-xl font-semibold text-foreground leading-snug">
              Qual é o seu faturamento mensal?
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

      case 7:
        return (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            {/* Highlight block */}
            <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 sm:p-5">
              <div className="flex items-start gap-3 mb-2.5">
                <Target className="w-6 h-6 sm:w-7 sm:h-7 text-secondary shrink-0 mt-0.5" />
                <h2 className="text-secondary font-bold text-lg sm:text-xl md:text-2xl leading-tight">
                  Essa é a pergunta mais importante de todo o diagnóstico.
                </h2>
              </div>
              <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed pl-9 sm:pl-10">
                Quanto mais <span className="text-secondary font-semibold">detalhada</span> for sua resposta, mais <span className="text-secondary font-semibold">preciso</span> será o nosso diagnóstico. Seja <span className="text-secondary font-semibold">honesto e específico</span>.
              </p>
            </div>

            <Textarea
              className="w-full text-sm sm:text-base min-h-[100px] sm:min-h-[120px] resize-none bg-input border-2 border-border/60 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200"
              placeholder="Conte-nos o que você quer resolver..."
              value={formData.dor_desejo}
              onChange={(e) => updateField("dor_desejo", e.target.value)}
              autoFocus />

          </div>);

      case 8:
        return <LoadingCommitStep onFinish={handleSubmit} onCommit={(v) => updateField("compromisso_whatsapp", v)} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100svh] relative w-full max-w-full overflow-x-hidden">
      <QuizBackground />
      
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

      {/* Quiz Content - Mobile optimized */}
      <main className="pt-16 pb-6 px-4 min-h-[100svh] flex items-center justify-center w-full max-w-full overflow-x-hidden" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <div className="w-full max-w-[92vw] sm:max-w-md mx-auto">
          {/* Quiz Card - Compact and elegant */}
          <div
            className="backdrop-blur-xl border border-border/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl w-full overflow-hidden"
            style={{
              background: 'hsl(235 45% 7% / 0.94)',
              boxShadow: '0 8px 40px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset'
            }}>

            {/* Header text - smaller on mobile */}
            <div className="mb-4 sm:mb-6">
              <p className="text-center text-muted-foreground text-xs sm:text-sm leading-relaxed opacity-80">
                Responda o formulário rápido para que o próximo feedback seja você!
              </p>
            </div>

            {/* Form content area */}
            <div className="min-h-[180px] sm:min-h-[200px] flex flex-col">
              <div className="flex-1">
                {renderStep()}
              </div>

            {/* Navigation Buttons - Hidden on loading step */}
            {step !== 8 &&
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
                  step === totalSteps - 1 ?
                  <>
                      Enviar
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 ml-1.5 sm:ml-2 shrink-0" />
                    </> :

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