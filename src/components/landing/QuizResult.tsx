import { Button } from "@/components/ui/button";
import { MessageCircle, ArrowRight, User, Phone, Instagram, Briefcase, Target, FileText } from "lucide-react";

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  dor_desejo: string;
}

interface QuizResultProps {
  whatsappLink: string;
  nome: string;
  formData: QuizFormData;
}

export function QuizResult({ whatsappLink, nome, formData }: QuizResultProps) {
  const firstName = nome.split(" ")[0];

  return (
    <div className="max-w-md mx-auto text-center animate-slide-up">
      <div className="champion-card py-6">
        {/* Simple Thank You */}
        <h2 className="font-display text-xl md:text-2xl font-bold mb-2 champion-gradient-text tracking-wider">
          OBRIGADO, {firstName.toUpperCase()}!
        </h2>

        <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
          Em minutos um de nossos consultores irá lhe chamar.
        </p>

        {/* Summary */}
        <div className="glass-card p-4 mb-6 text-left">
          <h3 className="font-display text-sm text-foreground mb-3 tracking-wide">
            RESUMO DO DIAGNÓSTICO:
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Nome:</strong> {formData.nome_completo}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">WhatsApp:</strong> {formData.whatsapp}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Instagram className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Instagram:</strong> {formData.instagram}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Mercado:</strong> {formData.mercado}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Estágio:</strong> {formData.estagio_negocio}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-secondary shrink-0 mt-0.5" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">Dor principal:</strong> {formData.dor_desejo}
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
      </div>
    </div>
  );
}
