import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useTracking } from "@/hooks/useTracking";
import { ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import {
  calculateLeadScore,
  MERCADO_OPTIONS,
  ESTAGIO_OPTIONS,
} from "@/lib/leadScoring";
import { QuizResult } from "./QuizResult";

const WHATSAPP_NUMBER = "[INSERIR_NUMERO]"; // Ex: 5511999999999

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  dor_desejo: string;
  lgpd: boolean;
}

const STORAGE_KEY = "champion_quiz_progress";

export interface QuizSectionHandle {
  scrollIntoView: () => void;
}

export const QuizSection = forwardRef<QuizSectionHandle>((_, ref) => {
  const { trackStepView, trackStepNext, trackStepBack, trackSubmit, updateSession } = useTracking();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ score: number; tier: string } | null>(null);
  const [formData, setFormData] = useState<QuizFormData>({
    nome_completo: "",
    whatsapp: "",
    instagram: "",
    mercado: "",
    estagio_negocio: "",
    dor_desejo: "",
    lgpd: false,
  });

  const totalSteps = 6;
  
  const STEP_IDS = ['q1_nome', 'q2_whats', 'q3_insta', 'q4_mercado', 'q5_estagio', 'q6_dor'];

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

  // Track step view when step changes
  useEffect(() => {
    if (!submitted) {
      const stepId = STEP_IDS[step - 1];
      trackStepView(stepId);
    }
  }, [step, submitted, trackStepView]);

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
      case 1:
        return formData.nome_completo.trim().length >= 3;
      case 2:
        return formData.whatsapp.replace(/\D/g, '').length >= 10 && formData.lgpd;
      case 3:
        return formData.instagram.trim().length >= 1;
      case 4:
        return formData.mercado !== "";
      case 5:
        return formData.estagio_negocio !== "";
      case 6:
        return formData.dor_desejo.trim().length >= 10;
      default:
        return false;
    }
  };

  // Kommo sync is now handled automatically via DB trigger on leads INSERT

  const handleSubmit = async () => {
    if (!canProceed()) return;

    setIsSubmitting(true);
    try {
      // Calculate score silently
      const result = calculateLeadScore({
        mercado: formData.mercado,
        estagio_negocio: formData.estagio_negocio,
      });

      // Prepare data for database
      const dbData = {
        nome_completo: formData.nome_completo,
        whatsapp: formData.whatsapp,
        instagram: formData.instagram,
        mercado: formData.mercado,
        estagio_negocio: formData.estagio_negocio,
        dor_desejo: formData.dor_desejo,
        score: result.score,
        tier: result.tier,
        raw_answers_json: JSON.parse(JSON.stringify(formData)),
      };

      const { data: insertedLead, error } = await supabase
        .from("leads")
        .insert([dbData])
        .select('id')
        .single();

      if (error) throw error;

      // Check for duplicate IP and mark lead accordingly
      try {
        const ipResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-client-ip`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ 
              action: 'check_lead_duplicate',
              lead_id: insertedLead?.id 
            }),
          }
        );
        if (ipResponse.ok) {
          const ipData = await ipResponse.json();
          console.log("Lead IP check:", ipData);
        }
      } catch (ipError) {
        console.error("Error checking lead IP:", ipError);
      }

      // Track the submit event
      await trackSubmit({
        name: formData.nome_completo,
        whatsapp: formData.whatsapp,
        instagram: formData.instagram,
        market: formData.mercado,
        stage: formData.estagio_negocio,
      });

      // Send to Kommo in background
      // Kommo sync handled automatically by DB trigger

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

  // Get field data based on current step
  const getFieldDataForStep = (stepNum: number): Record<string, string> => {
    switch (stepNum) {
      case 1: return { nome: formData.nome_completo };
      case 2: return { whatsapp: formData.whatsapp };
      case 3: return { instagram: formData.instagram };
      case 4: return { mercado: formData.mercado };
      case 5: return { estagio: formData.estagio_negocio };
      case 6: return { dor_desejo: formData.dor_desejo };
      default: return {};
    }
  };

  const nextStep = async () => {
    if (canProceed() && step < totalSteps) {
      const fromStepId = STEP_IDS[step - 1];
      const toStepId = STEP_IDS[step];
      
      // Track step advancement with field data
      await trackStepNext(fromStepId, toStepId, getFieldDataForStep(step));
      
      // Update session with partial lead data
      const updateData: Record<string, string> = {};
      if (step === 1) updateData.lead_name = formData.nome_completo;
      if (step === 2) updateData.lead_whatsapp = formData.whatsapp;
      if (step === 3) updateData.lead_instagram = formData.instagram;
      if (step === 4) updateData.lead_market = formData.mercado;
      if (step === 5) updateData.lead_stage = formData.estagio_negocio;
      
      if (Object.keys(updateData).length > 0) {
        await updateSession(updateData);
      }
      
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

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceed() && step < totalSteps) {
      e.preventDefault();
      nextStep();
    }
  };

  // Generate WhatsApp message
  const generateWhatsAppLink = () => {
    const message = `Oi, aqui é o ${formData.nome_completo}.
Acabei de preencher o Diagnóstico Champion.

Instagram: ${formData.instagram}
Mercado: ${formData.mercado}
Estágio: ${formData.estagio_negocio}
Principal dor/desejo: ${formData.dor_desejo}

Fico no aguardo.`;

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  };

  if (submitted && scoreResult) {
    return (
      <section id="quiz-section" className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          <QuizResult
            nome={formData.nome_completo}
            formData={formData}
          />
        </div>
      </section>
    );
  }

  const inputClasses = "champion-input w-full text-sm h-12 md:h-14";
  const selectClasses = "champion-input w-full text-sm h-12 md:h-14";

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 animate-slide-up" onKeyDown={handleKeyDown}>
            <label className="block text-base md:text-lg font-medium text-foreground mb-4">
              Qual é o seu nome completo?
            </label>
            <Input
              className={inputClasses}
              placeholder="Digite seu nome"
              value={formData.nome_completo}
              onChange={(e) => updateField("nome_completo", e.target.value)}
              autoFocus
            />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4 animate-slide-up" onKeyDown={handleKeyDown}>
            <label className="block text-base md:text-lg font-medium text-foreground mb-4">
              Qual é o seu WhatsApp?
            </label>
            <Input
              className={inputClasses}
              placeholder="(00) 00000-0000"
              value={formData.whatsapp}
              onChange={(e) => updateField("whatsapp", formatWhatsApp(e.target.value))}
              maxLength={16}
              autoFocus
            />
            <div className="flex items-center gap-2 pt-3">
              <Checkbox
                id="lgpd"
                checked={formData.lgpd}
                onCheckedChange={(checked) => updateField("lgpd", checked === true)}
                className="border-secondary/50 data-[state=checked]:bg-secondary data-[state=checked]:border-secondary h-5 w-5"
              />
              <label htmlFor="lgpd" className="text-xs text-muted-foreground cursor-pointer leading-relaxed">
                Concordo em receber contato sobre o diagnóstico. Seus dados estão seguros.
              </label>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 animate-slide-up" onKeyDown={handleKeyDown}>
            <label className="block text-base md:text-lg font-medium text-foreground mb-4">
              Qual é o seu Instagram?
            </label>
            <Input
              className={inputClasses}
              placeholder="@seuinstagram"
              value={formData.instagram}
              onChange={(e) => updateField("instagram", e.target.value)}
              autoFocus
            />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-base md:text-lg font-medium text-foreground mb-4">
              Em que mercado você trabalha?
            </label>
            <Select
              value={formData.mercado}
              onValueChange={(value) => updateField("mercado", value)}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o mercado" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {MERCADO_OPTIONS.map((option) => (
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
        );
      case 5:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-base md:text-lg font-medium text-foreground mb-4">
              Em que estágio está o seu negócio hoje?
            </label>
            <Select
              value={formData.estagio_negocio}
              onValueChange={(value) => updateField("estagio_negocio", value)}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o estágio" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {ESTAGIO_OPTIONS.map((option) => (
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
        );
      case 6:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-base md:text-lg font-medium text-foreground mb-2">
              O que você mais está buscando resolver hoje?
            </label>
            <p className="text-xs text-muted-foreground mb-4">
              Descreva muito bem a sua dor ou desejo.
            </p>
            <Textarea
              className="champion-input w-full text-sm min-h-[120px] resize-none"
              placeholder="Conte-nos o que você quer resolver..."
              value={formData.dor_desejo}
              onChange={(e) => updateField("dor_desejo", e.target.value)}
              autoFocus
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section id="quiz-section" className="py-6 md:py-10">
      {/* Headline acima do quiz */}
      <div className="container mx-auto px-4 mb-6 md:mb-8">
        <p className="text-center text-base md:text-lg text-muted-foreground max-w-md mx-auto">
          Responda o formulário rápido para que o próximo feedback seja você!
        </p>
      </div>
      
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto">
          {/* Quiz Card - Typeform style */}
          <div className="champion-card min-h-[280px] flex flex-col justify-between">
            <div>
              {renderStep()}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-8 gap-3">
              {step > 1 && (
                <Button
                  variant="championOutline"
                  size="default"
                  onClick={prevStep}
                  className="flex-1 text-sm h-12"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Voltar
                </Button>
              )}
              <Button
                variant="champion"
                size="default"
                onClick={nextStep}
                disabled={!canProceed() || isSubmitting}
                className={`text-sm h-12 ${step === 1 ? 'w-full' : 'flex-1'}`}
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
                    Continuar
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

QuizSection.displayName = "QuizSection";
