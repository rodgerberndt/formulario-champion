import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardCheck, BarChart3, PhoneCall, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTracking } from "@/hooks/useTracking";

const steps = [
  { icon: ClipboardCheck, label: "Você preenche o quiz", sub: "1–2 minutos" },
  { icon: BarChart3, label: "A Champion analisa seu cenário", sub: "Ainda hoje" },
  { icon: PhoneCall, label: "Um especialista te chama", sub: "Em poucas horas" },
  { icon: Rocket, label: "Você recebe o plano de criativos", sub: "Próximos passos claros" },
];

const chips = ["Meta Ads", "Criativos semanais", "Otimização por dados"];

export function HeroSection() {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();

  const handleCTA = async () => {
    try { await trackStartClick("hero_cta"); } catch {}
    await new Promise(r => setTimeout(r, 50));
    navigate("/quiz");
  };

  return (
    <section className="min-h-screen flex items-center justify-center pt-20 pb-16 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] bg-[hsl(42_90%_58%/0.06)]" />
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="container mx-auto px-5 relative z-10 max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left – Content */}
          <motion.div
            initial={{ opacity: 0, y: 30, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center lg:text-left"
          >
            {/* Chips */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-6">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="text-xs font-semibold px-3 py-1 rounded-full border border-[hsl(42_60%_35%/0.4)] text-secondary bg-[hsl(42_90%_58%/0.06)]"
                >
                  {chip}
                </span>
              ))}
            </div>

            <h1 className="text-foreground mb-4">
              CRIATIVOS QUE SAEM DA{" "}
              <span className="gold-text">PRÉ-ESCALA</span>{" "}
              E VIRAM{" "}
              <span className="gold-text">ESCALA.</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto lg:mx-0 mb-8 font-medium">
              Diagnóstico + plano de ação + esteira semanal de testes.
            </p>

            {/* Mobile CTA */}
            <div className="lg:hidden mb-8">
              <Button
                size="lg"
                onClick={handleCTA}
                className="btn-shine glow-breathe h-14 px-10 text-base font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-2xl shadow-2xl transition-all active:scale-[0.98]"
              >
                QUERO PREENCHER O QUIZ
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </motion.div>

          {/* Right – Glass CTA Card */}
          <motion.div
            initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="glass-card p-6 md:p-8 relative">
              {/* Subtle gold border glow */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-[hsl(42_90%_58%/0.15)] via-transparent to-[hsl(42_90%_58%/0.08)] pointer-events-none" />
              
              <div className="relative z-10">
                {/* Desktop CTA */}
                <div className="hidden lg:block mb-8">
                  <Button
                    size="lg"
                    onClick={handleCTA}
                    className="btn-shine glow-breathe w-full h-14 text-base font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-2xl shadow-2xl transition-all active:scale-[0.98]"
                  >
                    QUERO PREENCHER O QUIZ
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>

                {/* Steps */}
                <div className="space-y-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Como funciona
                  </p>
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.12, duration: 0.5 }}
                      className="flex items-start gap-4"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[hsl(42_90%_58%/0.1)] border border-[hsl(42_60%_35%/0.3)] flex items-center justify-center">
                        <step.icon className="w-4 h-4 text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.sub}</p>
                      </div>
                      {/* Progress line */}
                      {i < steps.length - 1 && (
                        <div className="absolute left-[2.05rem] mt-10 w-px h-5 bg-gradient-to-b from-[hsl(42_60%_35%/0.3)] to-transparent hidden" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
