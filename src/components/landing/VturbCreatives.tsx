import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { KeywordGlow } from "./TextEffects";

const VIDEO_IDS = [
  "69f7bc652c68b8e06e0b5d3d",
  "69f7bc5c2cdb6c72eb25d070",
  "69f7bc54ac9b67e415cfb9c4",
  "69f7bc48429b5d0eef53891b",
  "69f7bc42858bd31866f50afd",
  "69f7bc31c234cac35bc5b20a",
];

const ACCOUNT_ID = "3b4a85ca-8939-45e7-ae40-d0be1d6af49b";

function VturbPlayer({ id, index }: { id: string; index: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(index < 2); // first row eager
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const src = `https://scripts.converteai.net/${ACCOUNT_ID}/players/${id}/v4/player.js`;
    if (document.querySelector(`script[src="${src}"]`)) {
      setScriptLoaded(true);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => setScriptLoaded(true);
    document.head.appendChild(s);
  }, [inView, id]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.06, 0.25), ease: [0.16, 1, 0.3, 1] }}
      className="group relative rounded-2xl overflow-hidden border border-secondary/15 bg-gradient-to-b from-card/60 to-background/40 backdrop-blur-sm shadow-lg shadow-black/30 hover:border-secondary/40 hover:shadow-secondary/10 transition-all duration-300"
    >
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-secondary/5 via-transparent to-primary/10" />
      <div className="relative p-2 sm:p-3">
        <div
          className="relative w-full overflow-hidden rounded-xl bg-black/40"
          style={{ aspectRatio: "9 / 16" }}
        >
          {inView && (
            // @ts-expect-error custom element
            <vturb-smartplayer
              id={`vid-${id}`}
              style={{ display: "block", width: "100%", height: "100%" }}
            />
          )}
          {!scriptLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-secondary/30 border-t-secondary animate-spin" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function VturbCreatives() {
  const { ref, isVisible } = useReveal(0.05);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateNav = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    const children = Array.from(el.children) as HTMLElement[];
    const center = el.scrollLeft + el.clientWidth / 2;
    let closest = 0, min = Infinity;
    children.forEach((c, i) => {
      const cc = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(center - cc);
      if (d < min) { min = d; closest = i; }
    });
    setActiveIndex(closest);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateNav, { passive: true });
    updateNav();
    return () => el.removeEventListener("scroll", updateNav);
  }, [updateNav]);

  const scrollDir = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(":scope > div");
    const w = card?.offsetWidth ?? 320;
    el.scrollBy({ left: dir === "left" ? -w - 24 : w + 24, behavior: "smooth" });
  };

  return (
    <section id="portfolio" className="py-14 md:py-24 relative" ref={ref}>
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(42 90% 58% / 0.04) 0%, transparent 65%)",
        }}
      />

      <div className="container mx-auto px-5 max-w-6xl relative z-10">
        <div className={`text-center mb-10 md:mb-14 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3 leading-tight">
            <KeywordGlow>PORTFOLIO</KeywordGlow>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            Alguns exemplos reais de criativos em vídeo desenvolvidos pela Champion para campanhas de performance.
          </p>
        </div>

        <div className="relative group/carousel">
          {canLeft && (
            <button
              type="button"
              onClick={() => scrollDir("left")}
              aria-label="Anterior"
              className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-card/80 backdrop-blur border border-secondary/30 items-center justify-center text-foreground hover:bg-card hover:border-secondary/60 transition-all shadow-lg opacity-0 group-hover/carousel:opacity-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {canRight && (
            <button
              type="button"
              onClick={() => scrollDir("right")}
              aria-label="Próximo"
              className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-card/80 backdrop-blur border border-secondary/30 items-center justify-center text-foreground hover:bg-card hover:border-secondary/60 transition-all shadow-lg opacity-0 group-hover/carousel:opacity-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          <div
            ref={scrollRef}
            className="flex gap-5 md:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
          >
            {VIDEO_IDS.map((id, i) => (
              <div
                key={id}
                className="flex-shrink-0 snap-center w-[78vw] sm:w-[46vw] md:w-[320px] lg:w-[340px]"
              >
                <VturbPlayer id={id} index={i} />
              </div>
            ))}
          </div>

          <div className="flex justify-center items-center gap-1.5 mt-4">
            {VIDEO_IDS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para vídeo ${i + 1}`}
                onClick={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  const child = el.children[i] as HTMLElement | undefined;
                  if (child) el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
                }}
                className="p-0.5"
              >
                <div
                  className={`rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? "w-2.5 h-2.5 bg-secondary"
                      : "w-2 h-2 bg-transparent border border-muted-foreground/40"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
