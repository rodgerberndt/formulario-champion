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
    <div className="max-w-md mx-auto text-center animate-fade-in">
      <div className="bg-card/90 dark:bg-card/70 backdrop-blur-xl border border-border/50 rounded-3xl p-6 md:p-8 shadow-premium-lg">
        {/* Simple Thank You */}
        <h2 className="text-2xl md:text-3xl font-bold mb-3 text-foreground">
          OBRIGADO, <span className="champion-gradient-text">{firstName.toUpperCase()}</span>!
        </h2>

        <p className="text-muted-foreground text-base mb-8 max-w-sm mx-auto">
          Em minutos um de nossos consultores irá lhe chamar.
        </p>

        {/* Summary */}
        <div className="bg-muted/30 dark:bg-muted/20 rounded-2xl p-5 mb-8 text-left border border-border/50">
          <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
            Resumo do Diagnóstico:
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-secondary/10">
                <User className="w-4 h-4 text-primary dark:text-secondary" />
              </div>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-medium">Nome:</strong> {formData.nome_completo}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-secondary/10">
                <Phone className="w-4 h-4 text-primary dark:text-secondary" />
              </div>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-medium">WhatsApp:</strong> {formData.whatsapp}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-secondary/10">
                <Instagram className="w-4 h-4 text-primary dark:text-secondary" />
              </div>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-medium">Instagram:</strong> {formData.instagram}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-secondary/10">
                <Briefcase className="w-4 h-4 text-primary dark:text-secondary" />
              </div>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-medium">Mercado:</strong> {formData.mercado}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-secondary/10">
                <Target className="w-4 h-4 text-primary dark:text-secondary" />
              </div>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-medium">Estágio:</strong> {formData.estagio_negocio}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 dark:bg-secondary/10 mt-0.5">
                <FileText className="w-4 h-4 text-primary dark:text-secondary" />
              </div>
              <span className="text-muted-foreground">
                <strong className="text-foreground font-medium">Dor principal:</strong> {formData.dor_desejo}
              </span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <Button
          size="lg"
          onClick={() => window.open(whatsappLink, "_blank")}
          className="w-full h-14 group text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-300 active:scale-[0.98]"
        >
          <MessageCircle className="w-5 h-5" />
          FALAR NO WHATSAPP AGORA
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
