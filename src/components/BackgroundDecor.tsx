// Optimized background - minimal blur, no noise on mobile
export function BackgroundDecor() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none -z-10"
      style={{ contain: "strict" }}
    >
      {/* Simple gradient background */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            135deg, 
            hsl(235 50% 4%) 0%, 
            hsl(238 60% 8%) 50%,
            hsl(235 50% 4%) 100%
          )`,
        }}
      />

      {/* Subtle Grid Pattern - Desktop only */}
      <div 
        className="hidden md:block absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Gradient Blobs - Desktop only, reduced blur */}
      <div 
        className="hidden md:block absolute -top-32 -right-32 w-[350px] h-[350px] rounded-full blur-[60px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.06) 0%, transparent 70%)',
        }}
      />
      <div 
        className="hidden md:block absolute top-1/2 -left-32 w-[300px] h-[300px] rounded-full blur-[50px]"
        style={{
          background: 'radial-gradient(circle, hsl(43 85% 55% / 0.04) 0%, transparent 70%)',
        }}
      />

      {/* Bottom gradient fade */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
