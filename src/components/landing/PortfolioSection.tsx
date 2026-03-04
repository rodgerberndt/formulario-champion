import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { portfolioItems, type PortfolioItem } from "@/data/portfolioItems";

function YouTubeThumb({ item, onClick }: { item: PortfolioItem; onClick: () => void }) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "200px" }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="group cursor-pointer gold-card overflow-hidden p-0 rounded-2xl"
    >
      <div className="relative bg-muted/20" style={{ aspectRatio: "9/16" }}>
        {inView ? (
          <img
            src={`https://img.youtube.com/vi/${item.youtubeId}/0.jpg`}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full animate-pulse bg-muted/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-14 h-14 rounded-full bg-secondary/90 flex items-center justify-center shadow-lg">
            <Play className="w-6 h-6 text-secondary-foreground ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary border border-secondary/20 capitalize">
            {item.format}
          </span>
        </div>
      </div>
    </div>
  );
}

function VideoModal({ item, onClose }: { item: PortfolioItem; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-[360px] rounded-2xl overflow-hidden shadow-2xl border border-border/40"
        style={{ aspectRatio: "9/16" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-muted/60 hover:bg-muted text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
        <iframe
          src={`https://www.youtube.com/embed/${item.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={item.title}
        />
      </motion.div>
    </motion.div>
  );
}

export function PortfolioSection() {
  const { ref, isVisible } = useReveal(0.08);
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);

  return (
    <section id="portfolio" className="py-12 md:py-20 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-5xl">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            PORTFÓLIO <span className="gold-text">DE ADS</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Alguns dos ads que a Champion já fez para seus clientes.
          </p>
        </div>

        {/* Responsive Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          {portfolioItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <YouTubeThumb item={item} onClick={() => setSelectedItem(item)} />
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedItem && (
          <VideoModal item={selectedItem} onClose={() => setSelectedItem(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
