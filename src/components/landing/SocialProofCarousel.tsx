import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

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

/** Thumbnail card — shows paused video frame, plays on click via modal */
function VideoCard({ video, index, onPlay }: { video: string; index: number; onPlay: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  // Lazy observe
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "200px" }
    );
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Seek to 1s to show a real frame as thumbnail
  useEffect(() => {
    if (!inView || !videoRef.current) return;
    const vid = videoRef.current;
    const onLoaded = () => { vid.currentTime = 1; };
    vid.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => vid.removeEventListener("loadedmetadata", onLoaded);
  }, [inView]);

  return (
    <div
      ref={containerRef}
      onClick={onPlay}
      className="relative flex-shrink-0 w-[180px] md:w-[200px] rounded-2xl overflow-hidden bg-muted/20 border border-border/30 cursor-pointer group snap-center"
      style={{ aspectRatio: "9/16", contain: "layout style paint" }}
    >
      {inView ? (
        <video
          ref={videoRef}
          src={video}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <div className="w-full h-full animate-pulse bg-muted/20" />
      )}

      {/* Play overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/20 group-hover:bg-background/30 transition-colors">
        <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <Play className="w-6 h-6 text-primary-foreground ml-0.5" />
        </div>
      </div>
    </div>
  );
}

/** Full-screen video modal — only plays when opened */
function VideoModal({ video, onClose }: { video: string; onClose: () => void }) {
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
        <video
          src={video}
          className="w-full h-full object-cover"
          autoPlay
          controls
          playsInline
          loop
        />
      </motion.div>
    </motion.div>
  );
}

export function SocialProofCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
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
    <section className="py-8 md:py-12 overflow-hidden">
      <div className="container mx-auto px-5 max-w-6xl">
        <div className="text-center mb-6">
          <h2 className="text-foreground mb-1">
            RESULTADOS <span className="gold-text">REAIS</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Feedbacks de clientes da Champion.
          </p>
        </div>

        <div className="relative group/carousel">
          {/* Desktop arrows */}
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

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {testimonialVideos.map((video, i) => (
              <VideoCard
                key={video}
                video={video}
                index={i}
                onPlay={() => setSelectedVideo(video)}
              />
            ))}
          </div>

          {/* Mobile dots */}
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
        {selectedVideo && (
          <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
