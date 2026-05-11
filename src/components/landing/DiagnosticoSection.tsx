import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  CalendarCheck,
  Search,
  Lightbulb,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReveal } from "@/hooks/useReveal";
import { useTracking } from "@/hooks/useTracking";
import { generateClickId } from "@/hooks/useLandingHit";
import { ShimmerText, KeywordGlow, LineReveal } from "./TextEffects";

const pillars = [
  {
    icon: CalendarCheck,
    title: "Agenda em minutos",
    desc: "Você responde 8 perguntas rápidas e nosso time agenda uma call de diagnóstico no horário que funciona pra você.",
  },
  {
    icon: Search,
    title: "Análise da sua operação",
    desc: "Olhamos seus criativos, oferta, funil e estrutura de tráfego pra entender exatamente onde está travando a escala.",
  },
  {
    icon: Lightbulb,
    title: "Insights aplicáveis na hora",
    desc: "Você sai da call com pontos claros do que melhorar — ângulos, copy, edição, oferta — mesmo que não vire cliente.",
  },
  {
    icon: Gift,
    title: "100% gratuito",
    desc: "Sem custo, sem pegadinha. É a forma da Champion mostrar valor antes de qualquer proposta comercial.",
  },
];

export function DiagnosticoSection() {
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
    try { await trackStartClick("diagnostico_section_cta"); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 50));
    navigate("/quiz");
  };

  return (
    <section
      id="diagnostico"
      ref={ref}
      className="py-14 md:py-24 relative overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(42 90% 58% / 0.06) 0%, transparent 65%)",
        }}
      />

      <div className="container mx-auto px-5 max-w-4xl relative z-10">
        <div className={`text-center mb-10 md:mb-14 reveal-up ${isVisible ? "visible" : ""}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/12 border border-secondary/25 mb-5">
            <Gift className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs text-secondary font-medium">
              Diagnóstico 100% gratuito
            </span>
          </div>
          <h2 className="text-foreground mb-4 leading-tight">
            <ShimmerText isVisible={isVisible}>O QUE É O{" "}</ShimmerText>
            <KeywordGlow>DIAGNÓSTICO CHAMPION</KeywordGlow>
          </h2>
          <LineReveal isVisible={isVisible} delay={150}>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
              Mais do que um formulário: é uma análise real da sua operação feita por quem
              já escalou contas em 6, 7 e 8 dígitos. Você sai com clareza do que está
              segurando seu crescimento — sem precisar contratar nada.
            </p>
          </LineReveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 mb-10 md:mb-12">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.55,
                delay: Math.min(i * 0.08, 0.3),
                ease: [0.16, 1, 0.3, 1],
              }}
              className="group relative rounded-2xl p-5 md:p-6 border border-secondary/15 bg-gradient-to-b from-card/60 to-background/40 backdrop-blur-sm shadow-lg shadow-black/30 hover:border-secondary/40 hover:shadow-secondary/10 transition-all duration-300"
            >
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl bg-gradient-to-tr from-secondary/5 via-transparent to-primary/10" />
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center mb-3">
                  <p.icon className="w-5 h-5 text-secondary" />
                </div>
                <h3 className="text-base md:text-lg font-bold text-foreground mb-1.5 leading-snug">
                  {p.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <LineReveal isVisible={isVisible} delay={300}>
            <Button
              size="lg"
              onClick={handleCTA}
              disabled={loading}
              data-track-click="cta_primary"
              data-track-id="diagnostico_section_btn"
              className="group h-12 md:h-14 px-6 md:px-10 text-sm md:text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-200 active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 md:w-5 md:h-5 mr-2 animate-spin" />
                  CARREGANDO...
                </>
              ) : (
                <>
                  FAZER DIAGNÓSTICO GRATUITO
                  <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </LineReveal>
          <p className="text-xs text-muted-foreground mt-3">
            Sem custo · Sem compromisso · Resposta em até 24h
          </p>
        </div>
      </div>
    </section>
  );
}
