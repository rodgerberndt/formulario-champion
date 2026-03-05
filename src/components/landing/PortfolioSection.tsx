import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { portfolioItems, type PortfolioItem } from "@/data/portfolioItems";
import { useIsMobile } from "@/hooks/use-mobile";

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
      className="group cursor-pointer gold-card overflow-hidden p-0 rounded-2xl flex-shrink-0 snap-center"
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
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-secondary/90 flex items-center justify-center shadow-lg opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200">
            <Play className="w-5 h-5 md:w-6 md:h-6 text-secondary-foreground ml-0.5" />
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    updateScrollButtons();
    return () => el.removeEventListener("scroll", updateScrollButtons);
  }, [updateScrollButtons]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector<HTMLElement>(":scope > div")?.offsetWidth ?? 200;
    el.scrollBy({ left: dir === "left" ? -cardWidth * 2 : cardWidth * 2, behavior: "smooth" });
  };

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

        {/* Carousel wrapper */}
        <div className="relative group/carousel">
          {/* Navigation arrows - desktop only */}
          {!isMobile && canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-card/80 backdrop-blur border border-border/40 flex items-center justify-center text-foreground hover:bg-card transition-colors shadow-lg opacity-0 group-hover/carousel:opacity-100"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {!isMobile && canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-card/80 backdrop-blur border border-border/40 flex items-center justify-center text-foreground hover:bg-card transition-colors shadow-lg opacity-0 group-hover/carousel:opacity-100"
              aria-label="Próximo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Scrollable carousel */}
          <div
            ref={scrollRef}
            className="flex gap-3 md:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {portfolioItems.map((item, i) => (
              <div
                key={item.id}
                className={`w-[42vw] max-w-[200px] md:w-[180px] lg:w-[200px] flex-shrink-0 reveal-up ${isVisible ? "visible" : ""}`}
                style={{ transitionDelay: `${50 + i * 40}ms` }}
              >
                <YouTubeThumb item={item} onClick={() => setSelectedItem(item)} />
              </motion.div>
            ))}
          </div>

          {/* Scroll indicator dots - mobile */}
          {isMobile && (
            <div className="flex justify-center gap-1 mt-2">
              <div className="w-8 h-0.5 rounded-full bg-secondary/40" />
              <div className="w-2 h-0.5 rounded-full bg-muted-foreground/20" />
              <div className="w-2 h-0.5 rounded-full bg-muted-foreground/20" />
            </div>
          )}
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
