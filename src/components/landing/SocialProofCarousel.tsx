import { useEffect, useRef, useState, memo, useCallback } from "react";

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

// Memoized video card - hides if video fails to load
const VideoCard = memo(function VideoCard({ video }: { video: string }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Force play on mobile when video loads
  useEffect(() => {
    if (isLoaded && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, that's okay
      });
    }
  }, [isLoaded]);

  if (hasError) return null;

  return (
    <div
      className={`flex-shrink-0 w-[130px] md:w-[160px] aspect-[9/16] rounded-xl overflow-hidden bg-muted/30 border border-border/40 shadow-lg transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
    >
      <video
        ref={videoRef}
        src={video}
        className="w-full h-full object-cover"
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        onLoadedData={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
});

export function SocialProofCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const scrollPositionRef = useRef(0);
  
  const scroll = useCallback(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || isPaused) return;
    
    scrollPositionRef.current += 0.4;
    
    // Reset when reaching half (the duplicated content)
    const maxScroll = scrollContainer.scrollWidth / 2;
    if (scrollPositionRef.current >= maxScroll) {
      scrollPositionRef.current = 0;
    }
    
    scrollContainer.scrollLeft = scrollPositionRef.current;
  }, [isPaused]);

  useEffect(() => {
    let animationId: number;
    
    const animate = () => {
      scroll();
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [scroll]);

  // Sync scroll position when resuming
  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollPositionRef.current = scrollRef.current.scrollLeft;
    }
  }, [isPaused]);

  // Only pause on touch (mobile)
  const handleTouchStart = () => setIsPaused(true);
  const handleTouchEnd = () => {
    // Small delay to allow touch scroll to settle
    setTimeout(() => setIsPaused(false), 100);
  };

  return (
    <section className="py-6 md:py-10 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-hidden cursor-grab px-5 md:px-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ scrollBehavior: "auto" }}
      >
        {[...testimonialVideos, ...testimonialVideos].map((video, index) => (
          <VideoCard key={`${video}-${index}`} video={video} />
        ))}
      </div>
    </section>
  );
}