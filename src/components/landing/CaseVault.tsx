import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
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

const caseCategories = ["Todos", "Ecom", "Infoprod", "Nutra", "Serviços"] as const;

interface CaseItem {
  video: string;
  category: string;
  context: string;
  actions: string[];
  result: string;
}

const cases: CaseItem[] = [
  { video: testimonialVideos[0], category: "ecom", context: "E-commerce de cosméticos", actions: ["Novos hooks semanais", "VSL curto", "UGC combinado"], result: "3.2x ROAS em 30 dias" },
  { video: testimonialVideos[1], category: "nutra", context: "Marca de suplementos", actions: ["Testes de ângulo", "Estática + vídeo", "Prova social"], result: "CPA reduzido em 40%" },
  { video: testimonialVideos[2], category: "ecom", context: "Loja de beleza", actions: ["Criativos de transformação", "Antes/depois", "Reels nativos"], result: "Escala de R$ 5k para R$ 30k/mês" },
  { video: testimonialVideos[3], category: "servicos", context: "Agência de marketing", actions: ["Brand authority", "Depoimentos", "Case studies visuais"], result: "Pipeline 4x maior" },
  { video: testimonialVideos[4], category: "infoprod", context: "Curso de copywriting", actions: ["VSL de 3 min", "Hook emocional", "Urgência real"], result: "Validação em 7 dias" },
  { video: testimonialVideos[5], category: "nutra", context: "Produto natural", actions: ["Estáticos informativos", "Comparação", "Oferta direta"], result: "2.8x ROAS" },
  { video: testimonialVideos[6], category: "infoprod", context: "Mentoria digital", actions: ["Prova social", "Storytelling", "Lead magnet"], result: "CPL reduzido 55%" },
  { video: testimonialVideos[7], category: "ecom", context: "Dropshipping internacional", actions: ["Product showcase", "UGC real", "High-conversion hooks"], result: "R$ 150k em vendas/mês" },
];

export function CaseVault() {
  const { ref, isVisible } = useReveal(0.1);
  const [activeTab, setActiveTab] = useState("Todos");
  const filtered = activeTab === "Todos" ? cases : cases.filter((c) => c.category === activeTab.toLowerCase().replace("ç", "c"));

  return (
    <section id="cases" className="py-16 md:py-24 relative" ref={ref}>
      {/* Golden haze background */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`}
        style={{
          background: "radial-gradient(ellipse at center bottom, hsl(42 90% 58% / 0.04) 0%, transparent 60%)",
        }}
      />

      <div className="container mx-auto px-5 max-w-6xl relative z-10">
        <div className={`text-center mb-10 reveal-up ${isVisible ? "visible" : ""}`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-3">Case Vault</p>
          <h2 className="text-foreground mb-3">
            RESULTADOS <span className="gold-text">REAIS</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Conheça alguns dos cases produzidos pela Champion.
          </p>
        </div>

        {/* Tabs */}
        <div className={`flex justify-center gap-2 mb-10 reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>
          {caseCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`text-xs px-4 py-2 rounded-xl transition-all font-semibold ${
                activeTab === cat
                  ? "bg-secondary/15 text-secondary border border-secondary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filtered.map((caseItem, i) => (
            <CaseCard key={`${caseItem.video}-${i}`} item={caseItem} index={i} isVisible={isVisible} />
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
      initial={{ opacity: 0, y: 20 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: 0.15 + index * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="gold-card group p-0 overflow-hidden hover:border-secondary/40 transition-all duration-300"
    >
      {/* Video */}
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
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
        <div className="absolute bottom-3 left-3 right-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary border border-secondary/20 capitalize">
            {item.category}
          </span>
        </div>
      </div>

      {/* Info */}
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
