import { Button } from "@/components/ui/button";
import { ArrowRight, ClipboardList, Search, MessageCircle, Video, Zap } from "lucide-react";

interface HowItWorksProps {
  onScrollToQuiz: () => void;
}

const steps = [
  {
    number: "01",
    icon: ClipboardList,
    title: "Responda o Diagnóstico",
    description: "Quiz rápido de 2-4 minutos para entendermos seu momento.",
  },
  {
    number: "02",
    icon: Search,
    title: "Converse com nosso time",
    description: "Nossa equipe analisa suas respostas e identifica oportunidades.",
  },
  {
    number: "03",
    icon: MessageCircle,
    title: "Conversa com SDR",
    description: "Um especialista entra em contato via WhatsApp para alinhar expectativas.",
  },
  {
    number: "04",
    icon: Video,
    title: "Reunião Estratégica",
    description: "Apresentamos o diagnóstico completo e o plano de ação personalizado.",
  },
  {
    number: "05",
    icon: Zap,
    title: "Execução do Plano",
    description: "Implementamos funil, criativos e playbook de WhatsApp.",
  },
];

export function HowItWorks({ onScrollToQuiz }: HowItWorksProps) {
  return (
    <section id="how-it-works" className="py-20 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider mb-4 block">
              Como Funciona
            </span>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-4 tracking-wider">
              5 PASSOS PARA DESTRAVAR
            </h2>
            <p className="font-display text-2xl md:text-4xl champion-gradient-text tracking-wider">
              SUAS VENDAS
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical Line */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />

            <div className="space-y-8 md:space-y-0">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`relative flex flex-col md:flex-row items-center gap-6 md:gap-12 ${
                    index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  } animate-slide-up`}
                  style={{ animationDelay: `${index * 0.15}s` }}
                >
                  {/* Content */}
                  <div className={`flex-1 ${index % 2 === 0 ? "md:text-right" : "md:text-left"}`}>
                    <div className={`champion-card ${index % 2 === 0 ? "md:ml-auto" : "md:mr-auto"} max-w-md`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                          <step.icon className="w-5 h-5 text-secondary" />
                        </div>
                        <span className="font-display text-secondary text-lg">{step.number}</span>
                      </div>
                      <h3 className="font-display text-xl text-foreground mb-2 tracking-wide">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Center Dot */}
                  <div className="hidden md:flex w-4 h-4 rounded-full bg-secondary border-4 border-background absolute left-1/2 -translate-x-1/2" />

                  {/* Spacer */}
                  <div className="flex-1 hidden md:block" />
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-16">
            <Button
              variant="champion"
              size="xl"
              onClick={onScrollToQuiz}
              className="group"
            >
              Começar Diagnóstico
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
