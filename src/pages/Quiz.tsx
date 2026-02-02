import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { ChevronRight, ChevronLeft, Check, Loader2, ArrowLeft } from "lucide-react";
import {
  calculateLeadScore,
  MERCADO_OPTIONS,
  ESTAGIO_OPTIONS,
} from "@/lib/leadScoring";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { QuizResult } from "@/components/landing/QuizResult";

const WHATSAPP_NUMBER = "[INSERIR_NUMERO]";

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

export default function Quiz() {
  const navigate = useNavigate();
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
        // Invalid saved data
      }
    }
  }, []);

  useEffect(() => {
    if (!submitted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ formData, step }));
    }
  }, [formData, step, submitted]);

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
      const result = calculateLeadScore({
        mercado: formData.mercado,
        estagio_negocio: formData.estagio_negocio,
      });

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

      sendToKommo(formData, result.score, result.tier);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceed() && step < totalSteps) {
      e.preventDefault();
      nextStep();
    }
  };

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
      <div className="min-h-screen relative">
        <BackgroundDecor />
        
        {/* Top Bar */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-4xl">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="pt-20 pb-12 px-4">
          <div className="container mx-auto max-w-lg">
            <QuizResult
              whatsappLink={generateWhatsAppLink()}
              nome={formData.nome_completo}
              formData={formData}
            />
          </div>
        </main>
      </div>
    );
  }

  const renderStep = () => {
    const inputClasses = "w-full text-base h-14 bg-background border-2 border-border/50 rounded-2xl px-5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300";
    const selectClasses = "w-full text-base h-14 bg-background border-2 border-border/50 rounded-2xl px-5 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300";

    switch (step) {
      case 1:
        return (
          <div className="space-y-6 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-lg md:text-xl font-semibold text-foreground">
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
          <div className="space-y-6 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-lg md:text-xl font-semibold text-foreground">
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
            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="lgpd"
                checked={formData.lgpd}
                onCheckedChange={(checked) => updateField("lgpd", checked === true)}
                className="border-2 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary h-5 w-5 mt-0.5 rounded-md"
              />
              <label htmlFor="lgpd" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
                Concordo em receber contato sobre o diagnóstico. Seus dados estão seguros.
              </label>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-lg md:text-xl font-semibold text-foreground">
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
          <div className="space-y-6 animate-fade-in">
            <label className="block text-lg md:text-xl font-semibold text-foreground">
              Em que mercado você trabalha?
            </label>
            <Select
              value={formData.mercado}
              onValueChange={(value) => updateField("mercado", value)}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o mercado" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border rounded-xl">
                {MERCADO_OPTIONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    className="text-foreground hover:bg-muted focus:bg-muted text-base py-3"
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
          <div className="space-y-6 animate-fade-in">
            <label className="block text-lg md:text-xl font-semibold text-foreground">
              Em que estágio está o seu negócio hoje?
            </label>
            <Select
              value={formData.estagio_negocio}
              onValueChange={(value) => updateField("estagio_negocio", value)}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o estágio" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border rounded-xl">
                {ESTAGIO_OPTIONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    className="text-foreground hover:bg-muted focus:bg-muted text-base py-3"
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
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="block text-lg md:text-xl font-semibold text-foreground mb-2">
                O que você mais está buscando resolver hoje?
              </label>
              <p className="text-sm text-muted-foreground">
                Descreva muito bem a sua dor ou desejo.
              </p>
            </div>
            <Textarea
              className="w-full text-base min-h-[140px] resize-none bg-background border-2 border-border/50 rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300"
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
    <div className="min-h-screen relative">
      <BackgroundDecor />
      
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-4xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Quiz Content */}
      <main className="pt-24 pb-12 px-4 min-h-screen flex items-center">
        <div className="container mx-auto max-w-lg w-full">
          {/* Quiz Card */}
          <div className="bg-card/80 dark:bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl p-6 md:p-10 shadow-2xl shadow-black/5 dark:shadow-black/20">
            <div className="mb-8">
              <p className="text-center text-muted-foreground text-sm mb-6">
                Responda o formulário rápido para que o próximo feedback seja você!
              </p>
            </div>

            <div className="min-h-[220px] flex flex-col justify-between">
              <div>
                {renderStep()}
              </div>

              {/* Navigation */}
              <div className="flex justify-between mt-10 gap-4">
                {step > 1 && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={prevStep}
                    className="flex-1 h-14 text-base rounded-2xl border-2 border-border/50 hover:bg-muted hover:border-border transition-all duration-300"
                  >
                    <ChevronLeft className="w-5 h-5 mr-2" />
                    Voltar
                  </Button>
                )}
                <Button
                  size="lg"
                  onClick={nextStep}
                  disabled={!canProceed() || isSubmitting}
                  className={`h-14 text-base rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none ${step === 1 ? 'w-full' : 'flex-1'}`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : step === totalSteps ? (
                    <>
                      Enviar
                      <Check className="w-5 h-5 ml-2" />
                    </>
                  ) : (
                    <>
                      Continuar
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
