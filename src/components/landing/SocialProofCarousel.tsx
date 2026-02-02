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

// Memoized video card to prevent re-renders
const VideoCard = memo(function VideoCard({ video }: { video: string }) {
  return (
    <div
      className="flex-shrink-0 w-[130px] md:w-[160px] aspect-[9/16] rounded-xl overflow-hidden bg-muted/30 border border-border/40 shadow-lg"
    >
      <video
        src={video}
        className="w-full h-full object-cover"
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
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

  const handleInteractionStart = () => setIsPaused(true);
  const handleInteractionEnd = () => setIsPaused(false);

  return (
    <section className="py-6 md:py-10 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-hidden cursor-grab px-5 md:px-8"
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        style={{ scrollBehavior: "auto" }}
      >
        {[...testimonialVideos, ...testimonialVideos].map((video, index) => (
          <VideoCard key={index} video={video} />
        ))}
      </div>
    </section>
  );
}
