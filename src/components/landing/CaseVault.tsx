import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";

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
          <h2 className="text-foreground mb-2">
            <ShimmerText isVisible={isVisible}>RESULTADOS </ShimmerText>
            <KeywordGlow>REAIS</KeywordGlow>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Feedbacks de clientes da Champion.
          </p>
        </div>

        <div
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible md:snap-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {testimonialVideos.map((video, i) => (
            <VideoCard key={i} video={video} index={i} isVisible={isVisible} />
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoCard({ video, index, isVisible }: { video: string; index: number; isVisible: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
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

  if (hasError) return null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 16 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex-shrink-0 w-[70vw] max-w-[240px] md:w-auto snap-start gold-card group p-0 overflow-hidden hover:border-secondary/40 transition-all duration-300"
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted/10" style={{ aspectRatio: "9/14" }}>
        {inView && (
          <video
            ref={videoRef}
            src={video}
            className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
            muted
            loop
            playsInline
            preload="metadata"
            width={240}
            height={373}
            onLoadedData={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
          />
        )}
        {!isLoaded && <div className="absolute inset-0 animate-pulse bg-muted/30" />}
      </div>
    </motion.div>
  );
}
