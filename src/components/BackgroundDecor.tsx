import { memo } from "react";

// Memoized to prevent re-renders
export const BackgroundDecor = memo(function BackgroundDecor() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Rich gradient background */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            135deg, 
            hsl(235 50% 4%) 0%, 
            hsl(238 60% 8%) 40%,
            hsl(235 55% 6%) 70%,
            hsl(235 50% 4%) 100%
          )`,
        }}
      />

      {/* Subtle Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />
      
      {/* Noise Overlay - Very subtle */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Gradient Blobs - Static, no parallax for performance on mobile */}
      <div 
        className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full blur-[80px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.08) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute top-1/2 -left-32 w-[350px] h-[350px] rounded-full blur-[70px]"
        style={{
          background: 'radial-gradient(circle, hsl(43 85% 55% / 0.06) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute -bottom-20 right-1/4 w-[300px] h-[300px] rounded-full blur-[60px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.05) 0%, transparent 70%)',
        }}
      />

      {/* Bottom gradient fade */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
});
