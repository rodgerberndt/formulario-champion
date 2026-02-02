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
            whatsappLink={generateWhatsAppLink()}
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
    <section id="quiz-section" className="py-8 md:py-12">
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
