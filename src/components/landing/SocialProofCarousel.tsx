import { useEffect, useRef, useState, memo } from "react";

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

  if (hasError) return null;

  return (
    <div
      className={`flex-shrink-0 w-[130px] md:w-[160px] aspect-[9/16] rounded-xl overflow-hidden bg-muted/30 border border-border/40 shadow-lg transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
    >
      <video
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
  
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    let animationId: number;
    const scrollSpeed = 0.4;

    const scroll = () => {
      if (!isPaused && scrollContainer) {
        scrollContainer.scrollLeft += scrollSpeed;

        if (scrollContainer.scrollLeft >= scrollContainer.scrollWidth / 2) {
          scrollContainer.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(scroll);
    };
    
    animationId = requestAnimationFrame(scroll);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isPaused]);

  // Only pause on touch (mobile), NOT on mouse hover
  const handleTouchStart = () => setIsPaused(true);
  const handleTouchEnd = () => setIsPaused(false);

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
          <VideoCard key={index} video={video} />
        ))}
      </div>
    </section>
  );
}
