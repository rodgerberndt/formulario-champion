import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X } from "lucide-react";

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

/** Thumbnail card — shows paused video frame (no click) */
function VideoCard({ video }: { video: string; index: number }) {
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
      className="relative w-full rounded-2xl overflow-hidden bg-muted/20 border border-border/30"
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
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  return (
    <section className="py-8 md:py-12 overflow-hidden">
      <div className="container mx-auto px-5 max-w-6xl">
        <div className="text-center mb-6">
          <h2 className="text-foreground mb-1">
            CASES <span className="gold-text">REAIS</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Feedbacks de clientes da Champion.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {testimonialVideos.map((video, i) => (
            <VideoCard
              key={video}
              video={video}
              index={i}
            />
          ))}
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
