import { useState, useEffect, useCallback, memo } from "react";
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
          )`,
        }}
      />

      {/* Subtle Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      
      {/* Noise texture */}
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Glow blobs - Static for performance */}
      <div 
        className="absolute -top-20 left-1/4 w-[350px] h-[350px] rounded-full blur-[70px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.1) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute top-1/2 -right-20 w-[300px] h-[300px] rounded-full blur-[60px]"
        style={{
          background: 'radial-gradient(circle, hsl(43 85% 55% / 0.07) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute -bottom-16 left-1/3 w-[280px] h-[280px] rounded-full blur-[50px]"
        style={{
          background: 'radial-gradient(circle, hsl(260 80% 50% / 0.06) 0%, transparent 70%)',
        }}
      />
    </div>
  );
});

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
  }, [step, formData]);

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
        <QuizBackground />
        
        {/* Top Bar */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border/50">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-xl">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </div>
        </header>

        <main className="pt-20 pb-12 px-5">
          <div className="container mx-auto max-w-md">
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

  const inputClasses = "w-full text-base h-12 md:h-14 bg-input border-2 border-border/60 rounded-xl px-4 text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200";
  const selectClasses = "w-full text-base h-12 md:h-14 bg-input border-2 border-border/60 rounded-xl px-4 text-foreground focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200";

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-base md:text-lg font-semibold text-foreground">
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
          <div className="space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-base md:text-lg font-semibold text-foreground">
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
            <div className="flex items-start gap-3 pt-1">
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
          <div className="space-y-5 animate-fade-in" onKeyDown={handleKeyDown}>
            <label className="block text-base md:text-lg font-semibold text-foreground">
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
          <div className="space-y-5 animate-fade-in">
            <label className="block text-base md:text-lg font-semibold text-foreground">
              Em que mercado você trabalha?
            </label>
            <Select
              value={formData.mercado}
              onValueChange={(value) => updateField("mercado", value)}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o mercado" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-xl">
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
          <div className="space-y-5 animate-fade-in">
            <label className="block text-base md:text-lg font-semibold text-foreground">
              Em que estágio está o seu negócio hoje?
            </label>
            <Select
              value={formData.estagio_negocio}
              onValueChange={(value) => updateField("estagio_negocio", value)}
            >
              <SelectTrigger className={selectClasses}>
                <SelectValue placeholder="Selecione o estágio" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-xl">
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
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="block text-base md:text-lg font-semibold text-foreground mb-1.5">
                O que você mais está buscando resolver hoje?
              </label>
              <p className="text-sm text-muted-foreground">
                Descreva muito bem a sua dor ou desejo.
              </p>
            </div>
            <Textarea
              className="w-full text-base min-h-[120px] resize-none bg-input border-2 border-border/60 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors duration-200"
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
      <QuizBackground />
      
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>
      </header>

      {/* Quiz Content */}
      <main className="pt-20 pb-12 px-5 min-h-screen flex items-center">
        <div className="container mx-auto max-w-md w-full">
          {/* Quiz Card - Solid background for legibility */}
          <div 
            className="backdrop-blur-xl border border-border/60 rounded-3xl p-5 md:p-8 shadow-2xl"
            style={{
              background: 'hsl(235 45% 7% / 0.94)',
              boxShadow: '0 8px 40px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset',
            }}
          >
            <div className="mb-6">
              <p className="text-center text-muted-foreground text-sm">
                Responda o formulário rápido para que o próximo feedback seja você!
              </p>
            </div>

            <div className="min-h-[200px] flex flex-col justify-between">
              <div>
                {renderStep()}
              </div>

              {/* Navigation */}
              <div className="flex justify-between mt-8 gap-3">
                {step > 1 && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={prevStep}
                    className="flex-1 h-12 md:h-14 text-base rounded-xl border-2 border-border/60 hover:bg-muted hover:border-border transition-colors duration-200"
                  >
                    <ChevronLeft className="w-5 h-5 mr-2" />
                    Voltar
                  </Button>
                )}
                <Button
                  size="lg"
                  onClick={nextStep}
                  disabled={!canProceed() || isSubmitting}
                  className={`h-12 md:h-14 text-base rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none ${step === 1 ? 'w-full' : 'flex-1'}`}
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
