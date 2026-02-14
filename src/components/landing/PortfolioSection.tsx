import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { portfolioItems, type PortfolioItem } from "@/data/portfolioItems";

export function PortfolioSection() {
  const { ref, isVisible } = useReveal(0.08);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);

  const scrollToCTA = () => {
    document.querySelector("#cta-final")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollByAmount = useCallback((dir: number) => {
    isPausedRef.current = true;
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
    setTimeout(() => { isPausedRef.current = false; }, 3000);
  }, []);

  // Auto-scroll slowly to the right
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastTime = 0;
    const speed = 0.5; // pixels per frame (~30px/s)

    const tick = (time: number) => {
      if (lastTime && !isPausedRef.current) {
        const delta = time - lastTime;
        el.scrollLeft += speed * (delta / 16);

        // Loop back when reaching the end
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
          el.scrollLeft = 0;
        }
      }
      lastTime = time;
      autoScrollRef.current = requestAnimationFrame(tick);
    };

    autoScrollRef.current = requestAnimationFrame(tick);

    // Pause on touch/interaction
    const pause = () => { isPausedRef.current = true; };
    const resume = () => { setTimeout(() => { isPausedRef.current = false; }, 3000); };

    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);

    return () => {
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
  }, []);

  return (
    <section id="portfolio" className="py-12 md:py-20 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-6xl">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            PORTFÓLIO <span className="gold-text">DE ADS</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Alguns dos ads que a Champion já fez para seus clientes.
          </p>
        </div>

        {/* Carousel controls */}
        <div className="flex justify-end gap-2 mb-4 px-1">
          <button
            onClick={() => scrollByAmount(-1)}
            className="w-11 h-11 rounded-full border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-secondary/40 active:bg-muted/50 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scrollByAmount(1)}
            className="w-11 h-11 rounded-full border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-secondary/40 active:bg-muted/50 transition-colors"
            aria-label="Próximo"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Horizontal scroll carousel */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>

          {portfolioItems.map((item, i) =>
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isVisible ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            className="flex-shrink-0 w-[75vw] max-w-[260px] md:w-[240px] snap-start gold-card group cursor-pointer overflow-hidden p-0"
            onClick={() => setSelectedItem(item)}>

              <PortfolioCard item={item} />
            </motion.div>
          )}
        </div>

        <div className="text-center mt-6" />
      </div>

      {/* Modal */}
      <AnimatePresence>
        {selectedItem &&
        <AdViewerModal item={selectedItem} onClose={() => setSelectedItem(null)} onCTA={scrollToCTA} />
        }
      </AnimatePresence>
    </section>);

}

function PortfolioCard({ item }: {item: PortfolioItem;}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {if (e.isIntersecting) {setInView(true);obs.disconnect();}}, { rootMargin: "200px" });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (inView && isLoaded && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [inView, isLoaded]);

  if (hasError) return null;

  return (
    <div ref={containerRef}>
      <div className="aspect-[9/14] relative overflow-hidden rounded-t-2xl bg-muted/20">
        {inView &&
        <video
          ref={videoRef}
          src={item.thumbnail}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          style={{ willChange: "transform" }}
        />
        }
        {!isLoaded && <div className="absolute inset-0 animate-pulse bg-muted/30" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary border border-secondary/20 capitalize">
            {item.format}
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-secondary/90 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-secondary-foreground ml-0.5" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-bold text-foreground mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
      </div>
    </div>);
}

function AdViewerModal({ item, onClose, onCTA }: {item: PortfolioItem;onClose: () => void;onCTA: () => void;}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {document.body.style.overflow = "";};
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center"
      onClick={onClose}>

      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative bg-card border border-border/60 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-2 rounded-full bg-muted/50 hover:bg-muted text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
          <X className="w-5 h-5" />
        </button>

        {item.videoUrl &&
        <div className="aspect-[9/16] max-h-[50vh] bg-black rounded-t-2xl overflow-hidden">
            <video src={item.videoUrl} className="w-full h-full object-contain" controls autoPlay playsInline muted />
          </div>
        }

        <div className="p-5">
          <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary capitalize">{item.objective}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground capitalize">{item.format}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-5">{item.description}</p>
          <button
            onClick={() => {onClose();onCTA();}}
            className="w-full btn-shine bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold rounded-xl py-3 px-4 text-sm transition-colors min-h-[48px]">

            Quero algo assim no meu negócio
          </button>
        </div>
      </motion.div>
    </motion.div>);

}