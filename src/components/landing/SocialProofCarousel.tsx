import { useRef, useState, useEffect } from "react";

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

export function SocialProofCarousel() {
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
    </section>
  );
}
