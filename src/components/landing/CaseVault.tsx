import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";

const testimonialVideos = [
  "/testimonials/video-1.mp4",
  "/testimonials/video-2.mp4",
  "/testimonials/video-3.mp4",
  "/testimonials/video-4.mp4",
  "/testimonials/video-5.mp4",
  "/testimonials/video-6.mp4",
  "/testimonials/video-7.mp4",
  "/testimonials/video-8.mp4",
];

interface CaseItem {
  video: string;
  context: string;
  actions: string[];
  result: string;
}

const cases: CaseItem[] = [
  { video: testimonialVideos[0], context: "E-commerce de cosméticos", actions: ["Novos hooks semanais", "VSL curto", "UGC combinado"], result: "3.2x ROAS em 30 dias" },
  { video: testimonialVideos[1], context: "Marca de suplementos", actions: ["Testes de ângulo", "Estática + vídeo", "Prova social"], result: "CPA reduzido em 40%" },
  { video: testimonialVideos[2], context: "Loja de beleza", actions: ["Criativos de transformação", "Antes/depois", "Reels nativos"], result: "Escala de R$ 5k para R$ 30k/mês" },
  { video: testimonialVideos[3], context: "Agência de marketing", actions: ["Brand authority", "Depoimentos", "Case studies visuais"], result: "Pipeline 4x maior" },
  { video: testimonialVideos[4], context: "Curso de copywriting", actions: ["VSL de 3 min", "Hook emocional", "Urgência real"], result: "Validação em 7 dias" },
  { video: testimonialVideos[5], context: "Produto natural", actions: ["Estáticos informativos", "Comparação", "Oferta direta"], result: "2.8x ROAS" },
  { video: testimonialVideos[6], context: "Mentoria digital", actions: ["Prova social", "Storytelling", "Lead magnet"], result: "CPL reduzido 55%" },
  { video: testimonialVideos[7], context: "Dropshipping internacional", actions: ["Product showcase", "UGC real", "High-conversion hooks"], result: "R$ 150k em vendas/mês" },
];

export function CaseVault() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section id="cases" className="py-12 md:py-20 relative" ref={ref}>
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
        style={{
          background: "radial-gradient(ellipse at center bottom, hsl(42 90% 58% / 0.03) 0%, transparent 60%)",
        }}
      />

      <div className="container mx-auto px-5 max-w-6xl relative z-10">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2">Case Vault</p>
          <h2 className="text-foreground mb-2">
            RESULTADOS <span className="gold-text">REAIS</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Conheça alguns dos cases produzidos pela Champion.
          </p>
        </div>

        {/* Horizontal snap carousel */}
        <div
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible md:snap-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {cases.map((caseItem, i) => (
            <CaseCard key={i} item={caseItem} index={i} isVisible={isVisible} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CaseCard({ item, index, isVisible }: { item: CaseItem; index: number; isVisible: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { rootMargin: "100px" });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (inView && isLoaded && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [inView, isLoaded]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 16 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex-shrink-0 w-[80vw] max-w-[280px] md:w-auto snap-start gold-card group p-0 overflow-hidden hover:border-secondary/40 transition-all duration-300"
    >
      <div className="aspect-[9/14] relative overflow-hidden rounded-t-2xl bg-muted/10">
        {inView && (
          <video
            ref={videoRef}
            src={item.video}
            className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => setIsLoaded(true)}
          />
        )}
        {!isLoaded && <div className="absolute inset-0 animate-pulse bg-muted/30" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
      </div>

      <div className="p-4">
        <p className="text-xs font-semibold text-foreground mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          {item.context}
        </p>
        <ul className="space-y-1 mb-3">
          {item.actions.map((a, j) => (
            <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-secondary/50 mt-1.5 flex-shrink-0" />
              {a}
            </li>
          ))}
        </ul>
        <div className="px-2 py-1.5 rounded-lg bg-secondary/8 border border-secondary/15">
          <p className="text-xs font-bold text-secondary text-center">{item.result}</p>
        </div>
      </div>
    </motion.div>
  );
}
