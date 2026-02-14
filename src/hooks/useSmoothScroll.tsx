import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Cinematic smooth scroll for desktop only.
 * On mobile (pointer: coarse), we leave native scroll intact.
 */
export function useSmoothScroll() {
  useEffect(() => {
    // Skip on mobile / touch devices
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || prefersReduced) return;

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.7,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Disable smooth-scroll CSS to let Lenis handle it
    document.documentElement.style.scrollBehavior = "auto";

    return () => {
      lenis.destroy();
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);
}
