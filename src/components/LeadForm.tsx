import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";

const MERCADOS = [
  "Infoproduto",
  "Nutra / encapsulado (Brasil)",
  "Afiliado gringa",
  "Dropshipping",
  "Ainda não vendo",
  "Outro",
];

const ESTAGIOS = ["Iniciando", "Validação", "Pré escala", "Escala"];

interface FormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  dor_desejo: string;
}

export function LeadForm() {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    nome_completo: "",
    whatsapp: "",
    instagram: "",
    mercado: "",
    estagio_negocio: "",
    dor_desejo: "",
  });

  const totalSteps = 6;

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.nome_completo.trim().length >= 3;
      case 2: {
        const digits = formData.whatsapp.replace(/\D/g, '');
        const validDDD = digits.length >= 2 && parseInt(digits.slice(0, 2)) >= 11 && parseInt(digits.slice(0, 2)) <= 99;
        const validMobile = digits.length === 11 && digits[2] === '9';
        const validLandline = digits.length === 10;
        return validDDD && (validMobile || validLandline);
      }
      case 3:
        return formData.instagram.trim().length >= 2;
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

  const sendToKommo = async (leadData: FormData) => {
    try {
      const response = await supabase.functions.invoke('kommo-webhook', {
        body: leadData
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
      const { error } = await supabase.from("leads").insert([formData]);

      if (error) throw error;

      // Send to Kommo in background
      sendToKommo(formData);

      setSubmitted(true);
      toast({
        title: "Enviado com sucesso!",
        description: "Entraremos em contato em breve.",
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

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="champion-card max-w-lg w-full text-center animate-slide-up">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-secondary/20 flex items-center justify-center animate-glow">
            <Check className="w-10 h-10 text-secondary" />
          </div>
          <h2 className="font-display text-5xl font-bold mb-4 champion-gradient-text tracking-wider">
            OBRIGADO!
          </h2>
          <p className="text-muted-foreground text-lg">
            Recebemos suas informações e entraremos em contato em breve para
            continuar sua jornada rumo ao próximo nível.
          </p>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    const inputClasses = "champion-input w-full text-lg h-14";

    switch (step) {
      case 1:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-lg font-medium text-foreground">
              Qual é o seu nome completo?
            </label>
            <Input
              className={inputClasses}
              placeholder="Digite seu nome completo"
              value={formData.nome_completo}
              onChange={(e) => updateField("nome_completo", e.target.value)}
              autoFocus
            />
          </div>
        );
      case 2:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-lg font-medium text-foreground">
              Qual é o seu WhatsApp?
            </label>
            <Input
              className={inputClasses}
              placeholder="(00) 00000-0000"
              value={formData.whatsapp}
              onChange={(e) => updateField("whatsapp", e.target.value)}
              autoFocus
            />
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-lg font-medium text-foreground">
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
            <label className="block text-lg font-medium text-foreground">
              Em que mercado você está inserido?
            </label>
            <Select
              value={formData.mercado}
              onValueChange={(value) => updateField("mercado", value)}
            >
              <SelectTrigger className={inputClasses}>
                <SelectValue placeholder="Selecione seu mercado" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {MERCADOS.map((mercado) => (
                  <SelectItem
                    key={mercado}
                    value={mercado}
                    className="text-foreground hover:bg-muted focus:bg-muted"
                  >
                    {mercado}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-lg font-medium text-foreground">
              Em que fase está a sua operação hoje?
            </label>
            <Select
              value={formData.estagio_negocio}
              onValueChange={(value) => updateField("estagio_negocio", value)}
            >
              <SelectTrigger className={inputClasses}>
                <SelectValue placeholder="Selecione o estágio" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {ESTAGIOS.map((estagio) => (
                  <SelectItem
                    key={estagio}
                    value={estagio}
                    className="text-foreground hover:bg-muted focus:bg-muted"
                  >
                    {estagio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 6:
        return (
          <div className="space-y-4 animate-slide-up">
            <label className="block text-lg font-medium text-foreground">
              Qual a maior dor / desejo você busca solucionar com a gente?
            </label>
            <Textarea
              className="champion-input w-full text-lg min-h-[150px] resize-none"
              placeholder="Conte-nos sobre seus objetivos e desafios..."
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
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl">
        {/* Logo/Header */}
        <div className="text-center mb-10">
          <h1 className="font-display text-6xl md:text-7xl font-bold champion-gradient-text mb-2 tracking-wider">
            CHAMPION
          </h1>
          <p className="text-muted-foreground text-base">
            Preencha o formulário para iniciar sua jornada
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Etapa {step} de {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-secondary transition-all duration-500 ease-out rounded-full"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Form Card */}
        <div className="champion-card">
          {renderStep()}

          {/* Navigation */}
          <div className="flex justify-between mt-8 gap-4">
            <Button
              variant="championOutline"
              size="lg"
              onClick={prevStep}
              disabled={step === 1}
              className="flex-1"
            >
              <ChevronLeft className="w-5 h-5" />
              Voltar
            </Button>
            <Button
              variant="champion"
              size="lg"
              onClick={nextStep}
              disabled={!canProceed() || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : step === totalSteps ? (
                <>
                  Enviar
                  <Check className="w-5 h-5" />
                </>
              ) : (
                <>
                  Próximo
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
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
    </div>
  );
}
