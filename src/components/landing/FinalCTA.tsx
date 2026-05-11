import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardCheck, BarChart3, PhoneCall, Rocket, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTracking } from "@/hooks/useTracking";
import { useReveal } from "@/hooks/useReveal";
import { generateClickId } from "@/hooks/useLandingHit";
import { ShimmerText, KeywordGlow, LineReveal } from "./TextEffects";

const steps = [
  { icon: ClipboardCheck, text: "Faça o diagnóstico (1–2 min)" },
  { icon: BarChart3, text: "Análise do seu cenário (hoje)" },
  { icon: PhoneCall, text: "Especialista te chama" },
  { icon: Rocket, text: "Plano de criativos + próximos passos" },
];

export function FinalCTA() {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  const { ref, isVisible } = useReveal(0.08);
  const [loading, setLoading] = useState(false);
  const lastClickRef = useRef<number>(0);

  const handleCTA = async () => {
    const now = Date.now();
    if (loading) return;
    if (now - lastClickRef.current < 1500) return;
    lastClickRef.current = now;
    setLoading(true);
    try { generateClickId(); } catch { /* ignore */ }
    try { await trackStartClick("final_cta"); } catch {}
    await new Promise(r => setTimeout(r, 50));
    navigate("/quiz");
  };

  return (
    <section id="cta-final" className="py-16 md:py-24 relative overflow-hidden" ref={ref}>
      {/* Convergence glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[80px] transition-opacity duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`} style={{ background: "hsl(42 90% 58% / 0.06)" }} />
      </div>

      <div className="container mx-auto px-5 max-w-2xl relative z-10">
        <div className={`text-center reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3">
            <ShimmerText isVisible={isVisible}>SEUS CRIATIVOS PODEM{" "}</ShimmerText>
            <KeywordGlow>CONVERTER AGORA!!!!!</KeywordGlow>
          </h2>

          <LineReveal isVisible={isVisible} delay={200}>
            <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
              Faça o diagnóstico de 2 minutos e descubra como a Champion pode transformar seus resultados.
            </p>
          </LineReveal>

          {/* Steps mini */}
          <div className="grid grid-cols-2 gap-3 mb-8 max-w-md mx-auto">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
                className="flex items-center gap-2"
              >
                <div className="w-7 h-7 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center flex-shrink-0">
                  <step.icon className="w-3.5 h-3.5 text-secondary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium text-left">{step.text}</span>
              </motion.div>
            ))}
          </div>

          <LineReveal isVisible={isVisible} delay={600}>
            <Button
              size="lg"
              onClick={handleCTA}
              disabled={loading}
              className="btn-shine glow-breathe w-full sm:w-auto h-14 px-8 sm:px-10 text-sm sm:text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-2xl shadow-primary/30 transition-all active:scale-[0.98] min-h-[56px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  CARREGANDO...
                </>
              ) : (
                <>
                  QUERO FAZER MEU DIAGNÓSTICO
                  <ArrowRight className="w-5 h-5 ml-2 flex-shrink-0" />
                </>
              )}
            </Button>
          </LineReveal>
        </div>
      </div>
    </section>
  );
}
