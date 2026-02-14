import { useEffect, useRef } from "react";

interface ThemeConfig {
  bgA: string;
  bgB: string;
  glow: string;
  glowOpacity: number;
  noiseOpacity: number;
}

const themes: Record<string, ThemeConfig> = {
  void: {
    bgA: "hsl(235 80% 3%)",
    bgB: "hsl(238 70% 6%)",
    glow: "hsl(42 90% 58%)",
    glowOpacity: 0.03,
    noiseOpacity: 0.025,
  },
  cave: {
    bgA: "hsl(235 80% 2%)",
    bgB: "hsl(240 60% 4%)",
    glow: "hsl(42 90% 58%)",
    glowOpacity: 0.04,
    noiseOpacity: 0.03,
  },
  ember: {
    bgA: "hsl(235 70% 4%)",
    bgB: "hsl(20 30% 5%)",
    glow: "hsl(30 80% 50%)",
    glowOpacity: 0.05,
    noiseOpacity: 0.02,
  },
  "blue-temple": {
    bgA: "hsl(238 80% 4%)",
    bgB: "hsl(238 90% 8%)",
    glow: "hsl(238 90% 55%)",
    glowOpacity: 0.06,
    noiseOpacity: 0.02,
  },
  "gold-haze": {
    bgA: "hsl(235 60% 5%)",
    bgB: "hsl(42 30% 6%)",
    glow: "hsl(42 90% 58%)",
    glowOpacity: 0.07,
    noiseOpacity: 0.02,
  },
};

/**
 * Observes sections with data-theme and smoothly transitions
 * CSS custom properties on the root element.
 */
export function useSectionThemes() {
  const currentTheme = useRef("void");

  useEffect(() => {
    const root = document.documentElement;
    const sections = document.querySelectorAll<HTMLElement>("[data-theme]");
    if (sections.length === 0) return;

    const applyTheme = (name: string) => {
      if (name === currentTheme.current) return;
      currentTheme.current = name;
      const t = themes[name] || themes.void;
      root.style.setProperty("--theme-bgA", t.bgA);
      root.style.setProperty("--theme-bgB", t.bgB);
      root.style.setProperty("--theme-glow", t.glow);
      root.style.setProperty("--theme-glow-opacity", String(t.glowOpacity));
      root.style.setProperty("--theme-noise-opacity", String(t.noiseOpacity));
    };

    // Default
    applyTheme("void");

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most visible section
        let best: IntersectionObserverEntry | null = null;
        entries.forEach((e) => {
          if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) {
            best = e;
          }
        });
        if (best) {
          const theme = (best as IntersectionObserverEntry).target.getAttribute("data-theme") || "void";
          applyTheme(theme);
        }
      },
      { threshold: [0.2, 0.5], rootMargin: "-10% 0px -10% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);
}
