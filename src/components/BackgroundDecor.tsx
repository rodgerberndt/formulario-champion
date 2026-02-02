import { useEffect, useState } from "react";

export function BackgroundDecor() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                            linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      
      {/* Noise Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Gradient Blobs with Parallax */}
      <div 
        className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 dark:bg-primary/10 blur-[120px] transition-transform duration-100"
        style={{
          transform: `translate3d(0, ${scrollY * 0.1}px, 0)`,
        }}
      />
      <div 
        className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-secondary/5 dark:bg-secondary/8 blur-[100px] transition-transform duration-100"
        style={{
          transform: `translate3d(0, ${scrollY * 0.05}px, 0)`,
        }}
      />
      <div 
        className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/3 dark:bg-primary/5 blur-[80px] transition-transform duration-100"
        style={{
          transform: `translate3d(0, ${-scrollY * 0.08}px, 0)`,
        }}
      />

      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/50" />
    </div>
  );
}
