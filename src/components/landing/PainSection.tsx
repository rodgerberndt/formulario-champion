import { motion } from "framer-motion";
import {
  Clock,
  XCircle,
  TrendingUp,
  Target,
  Ban,
  LineChart,
  GraduationCap,
} from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";

const pains = [
  {
    icon: Clock,
    title: "Sem tempo pra criar",
    desc: "Você é gargalo do próprio negócio. Sem delegar, não escala — e ninguém entrega no seu nível.",
  },
  {
    icon: XCircle,
    title: "Criativos que não vendem",
    desc: "Você posta, roda, espera — e o resultado é silêncio. Visualização não vira venda.",
  },
  {
    icon: TrendingUp,
    title: "Criativo não aguenta escala",
    desc: "Funciona em R$ 500/dia. Quando você dobra o orçamento, o CPA explode e a margem some.",
  },
  {
    icon: Target,
    title: "Lead vem desqualificado",
    desc: "Volume até existe, mas é gente sem dinheiro, sem urgência e que some no primeiro contato.",
  },
  {
    icon: Ban,
    title: "Criativo reprovado toda hora",
    desc: "Você produz, sobe, e a Meta derruba. Conta restrita, BM travada, anúncio em loop de revisão.",
  },
  {
    icon: LineChart,
    title: "Otimiza no achismo",
    desc: "Você olha o gerenciador e não sabe o que pausar, o que escalar nem onde está sangrando.",
  },
  {
    icon: GraduationCap,
    title: "Falta repertório técnico",
    desc: "Você aprendeu copiando guru. Falta método, falta estrutura — e isso te custa caro todo mês.",
  },
];

export function PainSection() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section className="py-12 md:py-20 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-5 max-w-6xl relative z-10">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            <ShimmerText isVisible={isVisible}>
              VOCÊ NÃO TEM UM PROBLEMA DE OFERTA.{" "}
            </ShimmerText>
            <KeywordGlow>VOCÊ TEM UM PROBLEMA DE CRIATIVO.</KeywordGlow>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            Toda semana ouvimos as mesmas dores de quem já fatura, mas trava na hora de escalar.
            Reconhece alguma delas?
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.05 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="gold-card"
            >
              <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-3">
                <pain.icon className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="text-foreground mb-1.5" style={{ fontSize: "1.15rem" }}>
                <KeywordGlow>{pain.title}</KeywordGlow>
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{pain.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
