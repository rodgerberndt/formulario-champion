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
import { ChevronRight, ChevronLeft, Check, Loader2, Clock, Shield, MessageCircle } from "lucide-react";
import {
  calculateLeadScore,
  FATURAMENTO_OPTIONS,
  TRAFEGO_OPTIONS,
  TIMING_OPTIONS,
  ORCAMENTO_OPTIONS,
  SEGMENTO_OPTIONS,
  GARGALO_OPTIONS,
  MERCADOS,
  ESTAGIOS,
} from "@/lib/leadScoring";
import { QuizResult } from "./QuizResult";

const WHATSAPP_NUMBER = "[INSERIR_NUMERO]"; // Ex: 5511999999999

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  email: string;
  empresa: string;
  instagram: string;
  segmento: string;
  mercado: string;
  estagio_negocio: string;
  decisor: boolean;
  faturamento_faixa: string;
  trafego_faixa: string;
  gargalo: string;
  dor_desejo: string;
  timing: string;
  orcamento_faixa: string;
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
    instagram: "",
    segmento: "",
    mercado: "",
    estagio_negocio: "",
    decisor: false,
    faturamento_faixa: "",
    trafego_faixa: "",
    gargalo: "",
    dor_desejo: "",
    timing: "",
    orcamento_faixa: "",
  });

  const totalSteps = 8;

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

  const canProceed = () => {
    switch (step) {
      case 1: // Nome e WhatsApp
        return formData.nome_completo.trim().length >= 3 && formData.whatsapp.trim().length >= 10;
      case 2: // Email e Empresa
        return formData.email.includes("@") && formData.empresa.trim().length >= 2;
      case 3: // Instagram e Segmento
        return formData.instagram.trim().length >= 2 && formData.segmento !== "";
      case 4: // Mercado e Estágio (perguntas originais)
        return formData.mercado !== "" && formData.estagio_negocio !== "";
      case 5: // Decisor e Faturamento
        return formData.faturamento_faixa !== "";
      case 6: // Tráfego e Gargalo
        return formData.trafego_faixa !== "" && formData.gargalo !== "";
      case 7: // Dor/Desejo (pergunta original)
        return formData.dor_desejo.trim().length >= 10;
      case 8: // Timing e Orçamento
        return formData.timing !== "" && formData.orcamento_faixa !== "";
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
        orcamento_faixa: formData.orcamento_faixa,
      });

      // Prepare data for database
      const dbData = {
        nome_completo: formData.nome_completo,
        whatsapp: formData.whatsapp,
        email: formData.email,
        empresa: formData.empresa,
        instagram: formData.instagram,
        segmento: formData.segmento,
        mercado: formData.mercado,
        estagio_negocio: formData.estagio_negocio,
        decisor: formData.decisor,
        faturamento_faixa: formData.faturamento_faixa,
        trafego_faixa: formData.trafego_faixa,
        gargalo: formData.gargalo,
        dor_desejo: formData.dor_desejo,
        timing: formData.timing,
        orcamento_faixa: formData.orcamento_faixa,
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
    const message = `*Novo Lead Champion*
━━━━━━━━━━━━━━━━━
👤 *Nome:* ${formData.nome_completo}
🏢 *Empresa:* ${formData.empresa}
📱 *WhatsApp:* ${formData.whatsapp}
📧 *Email:* ${formData.email}
📸 *Instagram:* ${formData.instagram}
━━━━━━━━━━━━━━━━━
📊 *Segmento:* ${formData.segmento}
🎯 *Mercado:* ${formData.mercado}
📈 *Estágio:* ${formData.estagio_negocio}
👑 *Decisor:* ${formData.decisor ? "Sim" : "Não"}
━━━━━━━━━━━━━━━━━
💰 *Faturamento:* ${formData.faturamento_faixa}
📢 *Investimento em Tráfego:* ${formData.trafego_faixa}
🚧 *Maior Gargalo:* ${formData.gargalo}
⏰ *Timing:* ${formData.timing}
💵 *Orçamento Disponível:* ${formData.orcamento_faixa}
━━━━━━━━━━━━━━━━━
📝 *Dor/Desejo:*
${formData.dor_desejo}
━━━━━━━━━━━━━━━━━
🏆 *Score:* ${scoreResult?.score || 0} pontos
🎖️ *Tier:* ${scoreResult?.tier || "N/A"}`;

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  };

  if (submitted && scoreResult) {
    return (
      <section id="quiz-section" className="py-20">
        <div className="container mx-auto px-4">
          <QuizResult
            tier={scoreResult.tier}
            score={scoreResult.score}
            whatsappLink={generateWhatsAppLink()}
            nome={formData.nome_completo}
          />
        </div>
      </section>
    );
  }

  const inputClasses = "champion-input w-full text-lg h-14";

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
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
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Qual é o seu WhatsApp?
              </label>
              <Input
                className={inputClasses}
                placeholder="(00) 00000-0000"
                value={formData.whatsapp}
                onChange={(e) => updateField("whatsapp", e.target.value)}
              />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Qual é o seu e-mail?
              </label>
              <Input
                className={inputClasses}
                placeholder="seu@email.com"
                type="email"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Nome da sua empresa
              </label>
              <Input
                className={inputClasses}
                placeholder="Nome da empresa"
                value={formData.empresa}
                onChange={(e) => updateField("empresa", e.target.value)}
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
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
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Qual é o segmento do seu negócio?
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
                      className="text-foreground hover:bg-muted focus:bg-muted"
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
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
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
            <div className="space-y-4">
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
          </div>
        );
      case 5:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Você é o decisor do investimento?
              </label>
              <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-lg">
                <Checkbox
                  id="decisor"
                  checked={formData.decisor}
                  onCheckedChange={(checked) => updateField("decisor", checked === true)}
                  className="border-secondary data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
                />
                <label htmlFor="decisor" className="text-foreground cursor-pointer">
                  Sim, sou o decisor ou tenho autonomia para decidir
                </label>
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Qual é o faturamento mensal da sua empresa?
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
                      className="text-foreground hover:bg-muted focus:bg-muted"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Quanto você investe em tráfego pago por mês?
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
                      className="text-foreground hover:bg-muted focus:bg-muted"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
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
                      className="text-foreground hover:bg-muted focus:bg-muted"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 7:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
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
          </div>
        );
      case 8:
        return (
          <div className="space-y-6 animate-slide-up">
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Quando você pretende começar a implementar melhorias?
              </label>
              <Select
                value={formData.timing}
                onValueChange={(value) => updateField("timing", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione o timing" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {TIMING_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <label className="block text-lg font-medium text-foreground">
                Qual orçamento mensal você tem disponível para investir em consultoria/serviço?
              </label>
              <Select
                value={formData.orcamento_faixa}
                onValueChange={(value) => updateField("orcamento_faixa", value)}
              >
                <SelectTrigger className={inputClasses}>
                  <SelectValue placeholder="Selecione a faixa" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {ORCAMENTO_OPTIONS.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-foreground hover:bg-muted focus:bg-muted"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section id="quiz-section" className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider mb-4 block">
              Diagnóstico Gratuito
            </span>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-4 tracking-wider">
              FAÇA SEU DIAGNÓSTICO
            </h2>
            <p className="font-display text-2xl md:text-4xl champion-gradient-text tracking-wider">
              E DESCUBRA COMO ESCALAR
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-5 gap-8">
            {/* Left Column - Value Reinforcement */}
            <div className="lg:col-span-2 space-y-6">
              <div className="champion-card">
                <h3 className="font-display text-xl text-foreground mb-4 tracking-wide">
                  O QUE ACONTECE APÓS RESPONDER:
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-secondary" />
                    </div>
                    <span className="text-muted-foreground">
                      Análise personalizada do seu momento
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-secondary" />
                    </div>
                    <span className="text-muted-foreground">
                      Contato de um SDR especializado via WhatsApp
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-secondary" />
                    </div>
                    <span className="text-muted-foreground">
                      Plano de ação claro para destravar suas vendas
                    </span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Clock className="w-4 h-4 text-secondary" />
                  <span>2-4 minutos</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Shield className="w-4 h-4 text-secondary" />
                  <span>Dados protegidos</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <MessageCircle className="w-4 h-4 text-secondary" />
                  <span>Sem spam</span>
                </div>
              </div>
            </div>

            {/* Right Column - Quiz */}
            <div className="lg:col-span-3">
              {/* Progress bar */}
              <div className="mb-6">
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
                        Enviar Diagnóstico
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
              <div className="flex justify-center gap-2 mt-6">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
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
        </div>
      </div>
    </section>
  );
});

QuizSection.displayName = "QuizSection";
