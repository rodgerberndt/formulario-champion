import { useEffect, useRef, useState } from "react";

const testimonialVideos = [
  "/testimonials/video-1.mp4",
  "/testimonials/video-2.mp4",
  "/testimonials/video-3.mp4",
  "/testimonials/video-4.mp4",
  "/testimonials/video-5.mp4",
  "/testimonials/video-6.mp4",
  "/testimonials/video-7.mp4",
  "/testimonials/video-8.mp4"
];

// Lazy video card - only loads video when visible
function VideoCard({ video, index }: { video: string; index: number }) {
  const [hasError, setHasError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px", threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Play video when loaded and visible
  useEffect(() => {
    if (isLoaded && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [isLoaded]);

  if (hasError) return null;

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 w-[130px] md:w-[160px] rounded-xl overflow-hidden bg-muted/20 border border-border/30"
      style={{ 
        contain: "layout style paint",
        contentVisibility: "auto",
        aspectRatio: "9/16",
      }}
    >
      {isVisible && (
        <video
          ref={videoRef}
          src={video}
          className={`w-full h-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          width={160}
          height={284}
          onLoadedData={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}

export function SocialProofCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  
  // Use CSS animation instead of JS for smoother scroll
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    const scroll = (timestamp: number) => {
      // Throttle to ~30fps for performance
      if (timestamp - lastTimeRef.current < 33) {
        rafRef.current = requestAnimationFrame(scroll);
        return;
      }
      lastTimeRef.current = timestamp;
      
      scrollPositionRef.current += 0.5;
      
      const maxScroll = scrollContainer.scrollWidth / 2;
      if (scrollPositionRef.current >= maxScroll) {
        scrollPositionRef.current = 0;
      }
      
      scrollContainer.scrollLeft = scrollPositionRef.current;
      rafRef.current = requestAnimationFrame(scroll);
    };
    
    rafRef.current = requestAnimationFrame(scroll);
    
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <section className="py-6 md:py-10 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-hidden px-5 md:px-8"
        style={{ 
          scrollBehavior: "auto",
          willChange: "scroll-position"
        }}
      >
        {[...testimonialVideos, ...testimonialVideos].map((video, index) => (
          <VideoCard key={`${video}-${index}`} video={video} index={index} />
        ))}
      </div>
    </section>
  );
}