import { useReveal } from "@/hooks/useReveal";
import { useCountUp } from "@/hooks/useCountUp";

const marqueeItems = [
  "Criativos validados",
  "Testes semanais",
  "Otimização por métricas",
  "Escala previsível",
  "ROI comprovado",
  "Meta Ads",
  "Criativos validados",
  "Testes semanais",
  "Otimização por métricas",
  "Escala previsível",
  "ROI comprovado",
  "Meta Ads",
];

const metrics = [
  { value: 8000, suffix: "+", label: "Criativos produzidos" },
  { value: 1100, suffix: "+", label: "Contas atendidas" },
  { value: 3.7, suffix: "", label: "ROI médio", decimal: true },
  { value: 52, suffix: "+", label: "Nichos diferentes" },
];

export function ProofMarquee() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section className="py-8 md:py-12 overflow-hidden" ref={ref}>
      {/* Marquee */}
      <div className="relative mb-8 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />
        <div className="marquee-track">
          {marqueeItems.map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-3 px-5 text-xs md:text-sm font-semibold text-muted-foreground/60 whitespace-nowrap uppercase tracking-widest"
            >
              {item}
              <span className="w-1 h-1 rounded-full bg-secondary/40" />
            </span>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="container mx-auto px-5 max-w-4xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {metrics.map((m, i) => (
            <MetricCard key={i} {...m} started={isVisible} delay={i * 100} />
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ value, suffix, label, decimal, started, delay }: { value: number; suffix: string; label: string; decimal?: boolean; started: boolean; delay: number }) {
  const count = useCountUp(decimal ? value * 10 : value, 1500 + delay, started);
  const display = decimal ? (count / 10).toFixed(1) : count;

  return (
    <div className={`text-center reveal-up ${started ? "visible" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      <p className="text-2xl md:text-3xl font-bold gold-text font-display">
        {display}{suffix}
      </p>
      <p className="text-[11px] md:text-xs text-muted-foreground mt-1 font-medium">{label}</p>
    </div>
  );
}
