import { useEffect, useRef, useState } from "react";
const testimonialVideos = ["/testimonials/video-1.mp4", "/testimonials/video-2.mp4", "/testimonials/video-3.mp4", "/testimonials/video-4.mp4", "/testimonials/video-5.mp4", "/testimonials/video-6.mp4", "/testimonials/video-7.mp4", "/testimonials/video-8.mp4"];
export function SocialProofCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    let animationId: number;
    let scrollSpeed = 0.5; // Very slow scroll speed

    const scroll = () => {
      if (!isHovered && scrollContainer) {
        scrollContainer.scrollLeft += scrollSpeed;

        // Reset scroll when reaching the end (infinite loop)
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
  }, [isHovered]);
  return (
    <section className="py-6 md:py-10 overflow-hidden">
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-hidden cursor-grab"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ scrollBehavior: "auto" }}
      >
        {/* Duplicate videos for infinite scroll effect */}
        {[...testimonialVideos, ...testimonialVideos].map((video, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-[140px] md:w-[200px] aspect-[9/16] rounded-lg md:rounded-xl overflow-hidden glass-card"
          >
            <video
              src={video}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              autoPlay
            />
          </div>
        ))}
      </div>
    </section>
  );
}