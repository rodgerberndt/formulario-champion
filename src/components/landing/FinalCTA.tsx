import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardCheck, BarChart3, PhoneCall, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTracking } from "@/hooks/useTracking";
import { useReveal } from "@/hooks/useReveal";

const steps = [
  { icon: ClipboardCheck, text: "Preencha o quiz (1–2 min)" },
  { icon: BarChart3, text: "Análise do seu cenário (hoje)" },
  { icon: PhoneCall, text: "Especialista te chama" },
  { icon: Rocket, text: "Plano de criativos + próximos passos" },
];

export function FinalCTA() {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  const { ref, isVisible } = useReveal(0.15);

  const handleCTA = async () => {
    try { await trackStartClick("final_cta"); } catch {}
    await new Promise(r => setTimeout(r, 50));
    navigate("/quiz");
  };

  return (
    <section id="cta-final" className="py-20 md:py-32 relative overflow-hidden" ref={ref}>
      {/* Convergence glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[100px] bg-[hsl(42_90%_58%/0.08)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full blur-[60px] bg-[hsl(238_90%_55%/0.06)]" />
      </div>

      <div className="container mx-auto px-5 max-w-3xl relative z-10">
        <div className={`text-center reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-4">
            SEU CRIATIVO PODE{" "}
            <span className="gold-text">ESCALAR. AGORA.</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Preencha o diagnóstico gratuito e descubra como a Champion pode transformar seus resultados.
          </p>

          {/* Steps mini */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-10">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                  <step.icon className="w-3.5 h-3.5 text-secondary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{step.text}</span>
              </motion.div>
            ))}
          </div>

          <Button
            size="lg"
            onClick={handleCTA}
            className="btn-shine glow-breathe h-16 px-12 text-lg font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-2xl shadow-2xl transition-all active:scale-[0.98]"
          >
            QUERO O DIAGNÓSTICO GRATUITO
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
}
