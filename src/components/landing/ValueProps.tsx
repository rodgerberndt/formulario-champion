import { Button } from "@/components/ui/button";
import { 
  Map, 
  Grid3X3, 
  ClipboardCheck, 
  MessageSquare, 
  FileText, 
  Rocket,
  ArrowRight
} from "lucide-react";

interface ValuePropsProps {
  onScrollToQuiz: () => void;
}

const deliverables = [
  {
    icon: Map,
    title: "Mapa do Funil",
    description: "Identificamos exatamente onde está o vazamento no seu funil de vendas.",
  },
  {
    icon: Grid3X3,
    title: "Matriz Criativa",
    description: "Ganchos, ângulos e esteira de testes para suas campanhas.",
  },
  {
    icon: ClipboardCheck,
    title: "Quiz de Qualificação",
    description: "Filtramos curiosos e captamos leads com real intenção de compra.",
  },
  {
    icon: MessageSquare,
    title: "Playbook WhatsApp",
    description: "Follow-up estruturado, objeções mapeadas e cadência que converte.",
  },
  {
    icon: FileText,
    title: "Roteiro de Reunião",
    description: "Estrutura completa para seu closer fechar mais vendas.",
  },
  {
    icon: Rocket,
    title: "Plano de Ação 7–14 dias",
    description: "Primeiros passos executáveis para ver resultados rápidos.",
  },
];

export function ValueProps({ onScrollToQuiz }: ValuePropsProps) {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider mb-4 block">
              O Que Você Recebe
            </span>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-4 tracking-wider">
              TUDO QUE VOCÊ PRECISA PARA
            </h2>
            <p className="font-display text-2xl md:text-4xl champion-gradient-text tracking-wider">
              DESTRAVAR SUAS VENDAS
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {deliverables.map((item, index) => (
              <div
                key={index}
                className="champion-card group hover:border-secondary/30 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4 group-hover:bg-secondary/20 transition-colors">
                  <item.icon className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="font-display text-xl text-foreground mb-2 tracking-wide">
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center">
            <Button
              variant="champion"
              size="xl"
              onClick={onScrollToQuiz}
              className="group"
            >
              Quero Receber Tudo Isso
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
