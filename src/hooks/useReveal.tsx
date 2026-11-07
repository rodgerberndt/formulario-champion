import { useEffect, useRef, useState } from "react";

export function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Sem IntersectionObserver o bloco ficaria em opacity 0 para sempre (o
    // `.reveal-up` nasce escondido). Melhor aparecer sem animação do que a
    // seção não existir.
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.disconnect(); } },
      { threshold: Math.min(threshold, 0.1), rootMargin: "0px 0px -18% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}
