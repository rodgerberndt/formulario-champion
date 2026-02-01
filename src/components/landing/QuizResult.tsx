import { Button } from "@/components/ui/button";
import { Check, MessageCircle, Calendar, Trophy, ArrowRight } from "lucide-react";

interface QuizResultProps {
  tier: string;
  score: number;
  whatsappLink: string;
  nome: string;
}

export function QuizResult({ tier, score, whatsappLink, nome }: QuizResultProps) {
  const firstName = nome.split(" ")[0];

  return (
    <div className="max-w-2xl mx-auto text-center animate-slide-up">
      <div className="champion-card py-12">
        {/* Success Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-secondary/20 flex items-center justify-center animate-glow">
          <Trophy className="w-10 h-10 text-secondary" />
        </div>

        {/* Title */}
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 champion-gradient-text tracking-wider">
          OBRIGADO, {firstName.toUpperCase()}!
        </h2>

        {/* Score Display */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
          <Trophy className="w-4 h-4 text-secondary" />
          <span className="text-sm text-secondary font-medium">
            Score: {score} pontos · Tier {tier}
          </span>
        </div>

        {/* Message */}
        <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
          Recebemos suas informações! Em breve um de nossos consultores entrará em contato pelo WhatsApp para continuar sua jornada Champion.
        </p>

        {/* What happens next */}
        <div className="bg-muted/30 rounded-lg p-6 mb-8 text-left">
          <h3 className="font-display text-lg text-foreground mb-4 tracking-wide flex items-center gap-2">
            <Check className="w-5 h-5 text-secondary" />
            O QUE ACONTECE AGORA:
          </h3>
          <ul className="space-y-3 text-muted-foreground">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-secondary">
                1
              </div>
              <span>
                Nossa equipe analisará suas respostas
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-secondary">
                2
              </div>
              <span>
                Um SDR especializado entrará em contato via WhatsApp
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-secondary">
                3
              </div>
              <span>
                Você receberá seu diagnóstico personalizado na reunião estratégica
              </span>
            </li>
          </ul>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="champion"
            size="xl"
            onClick={() => window.open(whatsappLink, "_blank")}
            className="group"
          >
            <MessageCircle className="w-5 h-5" />
            Falar no WhatsApp Agora
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button
            variant="championOutline"
            size="lg"
            onClick={() => window.open("[LINK_AGENDA]", "_blank")}
            className="group"
          >
            <Calendar className="w-5 h-5" />
            Agendar Reunião
          </Button>
        </div>

        <p className="text-muted-foreground text-sm mt-6">
          Enquanto isso, você pode acelerar o processo clicando nos botões acima.
        </p>
      </div>
    </div>
  );
}
