import { Button } from "@/components/ui/button";
import { MessageCircle, Trophy, ArrowRight, Building2, Target, DollarSign, Clock, AlertCircle } from "lucide-react";

interface QuizFormData {
  empresa: string;
  segmento: string;
  faturamento_faixa: string;
  trafego_faixa: string;
  gargalo: string;
  timing: string;
}

interface QuizResultProps {
  tier: string;
  score: number;
  whatsappLink: string;
  nome: string;
  formData: QuizFormData;
}

export function QuizResult({ tier, score, whatsappLink, nome, formData }: QuizResultProps) {
  const firstName = nome.split(" ")[0];

  const getTierMessage = () => {
    switch (tier) {
      case "A":
        return {
          title: "VOCÊ TEM PERFIL FORTE",
          subtitle: "Seu score indica que você está pronto para escalar com a estratégia certa.",
          color: "text-green-400",
        };
      case "B":
        return {
          title: "VAMOS ALINHAR 2 PONTOS",
          subtitle: "Seu perfil tem potencial. Vamos entender melhor seu momento.",
          color: "text-yellow-400",
        };
      case "C":
        return {
          title: "RECEBEMOS SEU DIAGNÓSTICO",
          subtitle: "No seu momento, vamos te direcionar para o melhor caminho.",
          color: "text-muted-foreground",
        };
      default:
        return {
          title: "OBRIGADO PELO SEU TEMPO",
          subtitle: "Em breve um consultor entrará em contato.",
          color: "text-secondary",
        };
    }
  };

  const tierMessage = getTierMessage();

  return (
    <div className="max-w-lg mx-auto text-center animate-slide-up">
      <div className="champion-card py-8">
        {/* Success Icon */}
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-secondary/20 flex items-center justify-center animate-glow">
          <Trophy className="w-8 h-8 text-secondary" />
        </div>

        {/* Title */}
        <h2 className="font-display text-2xl md:text-3xl font-bold mb-2 champion-gradient-text tracking-wider">
          OBRIGADO, {firstName.toUpperCase()}!
        </h2>

        {/* Tier Message */}
        <p className={`font-display text-lg md:text-xl mb-1 ${tierMessage.color}`}>
          {tierMessage.title}
        </p>
        <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
          {tierMessage.subtitle}
        </p>

        {/* Score Display */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
          <Trophy className="w-3.5 h-3.5 text-secondary" />
          <span className="text-xs text-secondary font-medium">
            Score: {score} pontos · Tier {tier}
          </span>
        </div>

        {/* Summary */}
        <div className="glass-card p-4 mb-6 text-left">
          <h3 className="font-display text-sm text-foreground mb-3 tracking-wide">
            RESUMO DO DIAGNÓSTICO:
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Empresa:</strong> {formData.empresa}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Segmento:</strong> {formData.segmento}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Faturamento:</strong> {formData.faturamento_faixa}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Tráfego:</strong> {formData.trafego_faixa}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Gargalo:</strong> {formData.gargalo}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Timing:</strong> {formData.timing}
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <Button
          variant="champion"
          size="lg"
          onClick={() => window.open(whatsappLink, "_blank")}
          className="w-full group cta-glow text-sm"
        >
          <MessageCircle className="w-4 h-4" />
          FALAR NO WHATSAPP AGORA
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Button>

        <p className="text-muted-foreground text-xs mt-4">
          Acelere o processo clicando no botão acima.
        </p>
      </div>
    </div>
  );
}
