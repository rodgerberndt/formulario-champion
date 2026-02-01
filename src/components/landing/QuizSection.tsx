import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Check, Loader2, Clock, Shield } from "lucide-react";
import {
  calculateLeadScore,
  FATURAMENTO_OPTIONS,
  TRAFEGO_OPTIONS,
  TIMING_OPTIONS,
  DECISOR_OPTIONS,
  SEGMENTO_OPTIONS,
  GARGALO_OPTIONS,
} from "@/lib/leadScoring";
import { QuizResult } from "./QuizResult";

const WHATSAPP_NUMBER = "[INSERIR_NUMERO]"; // Ex: 5511999999999

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  email: string;
  empresa: string;
  segmento: string;
  decisor: string;
  faturamento_faixa: string;
  trafego_faixa: string;
  gargalo: string;
  timing: string;
  aceita_reuniao: boolean;
  lgpd: boolean;
}

const STORAGE_KEY = "champion_quiz_progress";

export interface QuizSectionHandle {
  scrollIntoView: () => void;
}

export const QuizSection = forwardRef<QuizSectionHandle>((_, ref) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ score: number; tier: string } | null>(null);
  const [formData, setFormData] = useState<QuizFormData>({
    nome_completo: "",
    whatsapp: "",
    email: "",
    empresa: "",
    segmento: "",
    decisor: "",
    faturamento_faixa: "",
    trafego_faixa: "",
    gargalo: "",
    timing: "",
    aceita_reuniao: false,
    lgpd: false,
  });

  const totalSteps = 5;

  // Load saved progress
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(prev => ({ ...prev, ...parsed.formData }));
        if (parsed.step && parsed.step <= totalSteps) {
          setStep(parsed.step);
        }
      } catch {
        // Invalid saved data, ignore
      }
    }
  }, []);

  // Save progress
  useEffect(() => {
    if (!submitted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, step }));
    }
  }, [formData, step, submitted]);

  // Expose scrollIntoView method
  useImperativeHandle(ref, () => ({
    scrollIntoView: () => {
      const element = document.getElementById("quiz-section");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
  }));

  const updateField = (field: keyof QuizFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const formatWhatsApp = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const canProceed = () => {
    switch (step) {
      case 1: // Contato
        return (
          formData.nome_completo.trim().length >= 3 &&
          formData.whatsapp.replace(/\D/g, '').length >= 10 &&
          formData.email.includes("@") &&
          formData.lgpd
        );
      case 2: // Negócio
        return (
          formData.empresa.trim().length >= 2 &&
          formData.segmento !== "" &&
          formData.decisor !== ""
        );
      case 3: // Números
        return formData.faturamento_faixa !== "" && formData.trafego_faixa !== "";
      case 4: // Gargalo
        return formData.gargalo !== "";
      case 5: // Timing
        return formData.timing !== "";
      default:
        return false;
    }
  };

  const sendToKommo = async (leadData: QuizFormData, score: number, tier: string) => {
    try {
      const response = await supabase.functions.invoke('kommo-webhook', {
        body: { ...leadData, score, tier }
      });
      console.log('Kommo response:', response);
    } catch (error) {
      console.error('Error sending to Kommo:', error);
    }
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;

    setIsSubmitting(true);
    try {
      // Calculate score
      const result = calculateLeadScore({
        faturamento_faixa: formData.faturamento_faixa,
        trafego_faixa: formData.trafego_faixa,
        timing: formData.timing,
        decisor: formData.decisor,
      });

      // Prepare data for database
      const dbData = {
        nome_completo: formData.nome_completo,
        whatsapp: formData.whatsapp,
        email: formData.email,
        empresa: formData.empresa,
        instagram: "@placeholder", // Required field, using placeholder
        segmento: formData.segmento,
        mercado: formData.segmento, // Using segmento as mercado
        estagio_negocio: "N/A", // Simplified quiz doesn't have this
        decisor: formData.decisor === "Sim" || formData.decisor === "Sou sócio",
        faturamento_faixa: formData.faturamento_faixa,
        trafego_faixa: formData.trafego_faixa,
        gargalo: formData.gargalo,
        dor_desejo: formData.gargalo, // Using gargalo as dor_desejo
        timing: formData.timing,
        score: result.score,
        tier: result.tier,
        raw_answers_json: JSON.parse(JSON.stringify(formData)),
      };

      const { error } = await supabase.from("leads").insert([dbData]);

      if (error) throw error;

      // Send to Kommo in background
      sendToKommo(formData, result.score, result.tier);

      // Clear saved progress
      localStorage.removeItem(STORAGE_KEY);

      setScoreResult({ score: result.score, tier: result.tier });
      setSubmitted(true);
      
      toast({
        title: "Diagnóstico enviado!",
        description: "Em breve entraremos em contato.",
      });
    } catch (error) {
      console.error("Error submitting lead:", error);
      toast({
        title: "Erro ao enviar",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (canProceed() && step < totalSteps) {
      setStep(step + 1);
    } else if (step === totalSteps && canProceed()) {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // Generate WhatsApp message
  const generateWhatsAppLink = () => {
    const message = `Oi, aqui é o ${formData.nome_completo}. Preenchi o Diagnóstico Champion.

Empresa: ${formData.empresa}
Segmento: ${formData.segmento}
Faturamento: ${formData.faturamento_faixa}
Tráfego: ${formData.trafego_faixa}
Gargalo: ${formData.gargalo}
Timing: ${formData.timing}
Tier: ${scoreResult?.tier || "N/A"} | Score: ${scoreResult?.score || 0}`;

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  };

  if (submitted && scoreResult) {
    return (
      <section id="quiz-section" className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <QuizResult
            tier={scoreResult.tier}
            score={scoreResult.score}
            whatsappLink={generateWhatsAppLink()}
            nome={formData.nome_completo}
            formData={formData}
          />
        </div>
      </section>
    );
  }

  const inputClasses = "champion-input w-full text-sm md:text-base h-11 md:h-12";

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 animate-slide-up">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Seu nome completo
              </label>
              <Input
                className={inputClasses}
                placeholder="Digite seu nome"
                value={formData.nome_completo}
                onChange={(e) => updateField("nome_completo", e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                WhatsApp
              </label>
              <Input
                className={inputClasses}
                placeholder="(00) 00000-0000"
                value={formData.whatsapp}
                onChange={(e) => updateField("whatsapp", formatWhatsApp(e.target.value))}
                maxLength={16}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                E-mail
              </label>
              <Input
                className={inputClasses}
                placeholder="seu@email.com"
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>
            <div className="flex items-start space-x-3 pt-2">
              <Checkbox
                id="lgpd"
                checked={formData.lgpd}
                onCheckedChange={(checked) => updateField("lgpd", checked === true)}
                className="border-secondary data-[state=checked]:bg-secondary data-[state=checked]:border-secondary mt-0.5"
              />
              <label htmlFor="lgpd" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
                Concordo em receber contato sobre o diagnóstico. Seus dados estão seguros.
              </label>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4 animate-slide-up">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Nome da empresa
              </label>
              <Input
                className={inputClasses}
                placeholder="Nome da sua empresa"
                value={formData.empresa}
                onChange={(e) => updateField("empresa", e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Segmento
              </label>
              <Select
                value={formData.segmento}
                onValueChange={(value) => updateField("segmento", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione o segmento" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {SEGMENTO_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted text-sm"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Você é o decisor?
              </label>
              <Select
                value={formData.decisor}
                onValueChange={(value) => updateField("decisor", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {DECISOR_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted text-sm"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 animate-slide-up">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Faturamento mensal
              </label>
              <Select
                value={formData.faturamento_faixa}
                onValueChange={(value) => updateField("faturamento_faixa", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione a faixa" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {FATURAMENTO_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted text-sm"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Investimento mensal em tráfego
              </label>
              <Select
                value={formData.trafego_faixa}
                onValueChange={(value) => updateField("trafego_faixa", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione a faixa" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {TRAFEGO_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted text-sm"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 animate-slide-up">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Qual é o maior gargalo da sua operação hoje?
              </label>
              <Select
                value={formData.gargalo}
                onValueChange={(value) => updateField("gargalo", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione o gargalo" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {GARGALO_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted text-sm"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4 animate-slide-up">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Quando pretende iniciar?
              </label>
              <Select
                value={formData.timing}
                onValueChange={(value) => updateField("timing", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {TIMING_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted text-sm"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start space-x-3 pt-2 p-3 glass-card">
              <Checkbox
                id="aceita_reuniao"
                checked={formData.aceita_reuniao}
                onCheckedChange={(checked) => updateField("aceita_reuniao", checked === true)}
                className="border-secondary data-[state=checked]:bg-secondary data-[state=checked]:border-secondary mt-0.5"
              />
              <label htmlFor="aceita_reuniao" className="text-sm text-foreground cursor-pointer">
                Se fizer sentido, topa uma reunião objetiva de 30–40 min?
              </label>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section id="quiz-section" className="py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <span className="text-secondary font-semibold text-xs uppercase tracking-wider mb-2 block">
              Diagnóstico Gratuito
            </span>
            <h2 className="font-display text-2xl md:text-4xl text-foreground mb-2 tracking-wider">
              FAÇA SEU DIAGNÓSTICO
            </h2>
            <p className="font-display text-lg md:text-2xl champion-gradient-text tracking-wider">
              E DESCUBRA COMO ESCALAR
            </p>
          </div>

          {/* Quiz Card */}
          <div className="champion-card">
            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Etapa {step} de {totalSteps}</span>
                <span>{Math.round((step / totalSteps) * 100)}%</span>
              </div>
              <div className="progress-premium h-1.5">
                <div
                  className="progress-premium-fill h-full rounded-full"
                  style={{ width: `${(step / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            {renderStep()}

            {/* Navigation */}
            <div className="flex justify-between mt-6 gap-3">
              <Button
                variant="championOutline"
                size="default"
                onClick={prevStep}
                disabled={step === 1}
                className="flex-1 text-sm h-11"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </Button>
              <Button
                variant="champion"
                size="default"
                onClick={nextStep}
                disabled={!canProceed() || isSubmitting}
                className="flex-1 text-sm h-11"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : step === totalSteps ? (
                  <>
                    Enviar
                    <Check className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Próximo
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Steps indicator */}
            <div className="flex justify-center gap-1.5 mt-5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i + 1 === step
                      ? "bg-secondary scale-125"
                      : i + 1 < step
                      ? "bg-secondary/50"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Trust indicators */}
          <div className="flex justify-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Clock className="w-3.5 h-3.5 text-secondary" />
              <span>2-4 min</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Shield className="w-3.5 h-3.5 text-secondary" />
              <span>Dados seguros</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

QuizSection.displayName = "QuizSection";
