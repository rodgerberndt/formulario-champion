import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Hero } from "@/components/landing/Hero";
import { useIsMobile } from "@/hooks/use-mobile";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { SuccessCases } from "@/components/landing/SuccessCases";
import { PainSection } from "@/components/landing/PainSection";
import { PortfolioSection } from "@/components/landing/PortfolioSection";
import { VturbCreatives } from "@/components/landing/VturbCreatives";
import { MetodoChampion } from "@/components/landing/MetodoChampion";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FAQSection } from "@/components/landing/FAQSection";
import { DiagnosticoSection } from "@/components/landing/DiagnosticoSection";

import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture } from "@/hooks/useUtmCapture";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";
import { useSectionThemes } from "@/hooks/useSectionThemes";
import { useLandingTracking } from "@/hooks/useLandingTracking";
import { useLandingHit, generateClickId } from "@/hooks/useLandingHit";
import { Loader2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  const isMobile = useIsMobile();
  useUtmCapture();
  useSmoothScroll();
  useSectionThemes();
  useLandingTracking("/");
  useLandingHit();

  // Prefetch the Quiz chunk so navigation to /quiz is instant.
  useEffect(() => {
    const prefetch = () => {
      import("./Quiz").catch(() => { /* ignore */ });
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(prefetch);
    } else {
      setTimeout(prefetch, 800);
    }
  }, []);

  const [loadingBtn, setLoadingBtn] = useState<string | null>(null);
  const lastClickRef = useRef<number>(0);
  const DEBOUNCE_MS = 1500;

  // Show mobile sticky CTA only after user scrolls past SuccessCases section
  const [showStickyCta, setShowStickyCta] = useState(false);
  const successCasesRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isMobile) return;
    const el = successCasesRef.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      // Show once the bottom of the cases section has scrolled above the viewport top
      if (rect.bottom <= 0) setShowStickyCta(true);
      else setShowStickyCta(false);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isMobile]);

  const handleStartClick = async (buttonId: string) => {
    const now = Date.now();
    if (loadingBtn) return;
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    lastClickRef.current = now;
    setLoadingBtn(buttonId);
    try { generateClickId(); } catch { /* ignore */ }
    try { await trackStartClick(buttonId); } catch (error) {
      console.error("Error tracking start click:", error);
    }
    await new Promise((r) => setTimeout(r, 50));
    navigate("/quiz");
  };

  return (
    <div className="min-h-screen relative bg-background">
      {/* Cinematic background layers */}
      <div className="cinematic-bg" />
      <div className="cinematic-glow" />
      <div className="cinematic-vignette" />
      <div className="cinematic-grid" />

      <LandingNavbar />

      <main>
        <section data-theme="cave" data-track-id="hero" data-track-order="1">
          <Hero onStartClick={() => handleStartClick("start_btn_1")} />
        </section>

        <section data-theme="void" data-track-id="social_proof" data-track-order="2">
          <SocialProofCarousel />
        </section>

        <section data-theme="ember" data-track-id="dor" data-track-order="3">
          <PainSection />
        </section>

        <section data-theme="cave" data-track-id="metodo" data-track-order="5">
          <MetodoChampion />
        </section>

        <section ref={successCasesRef} data-theme="void" data-track-id="success_cases" data-track-order="5.3">
          <SuccessCases />
        </section>

        <section data-theme="blue-temple" data-track-id="criativos" data-track-order="5.6">
          <VturbCreatives />
        </section>

        <section data-theme="cave" data-track-id="cta_intermediario" data-track-order="6" className="py-10 md:py-16">
          <div className="container mx-auto px-5 text-center max-w-md">
            <p className="text-sm md:text-base text-muted-foreground mb-6">
              Faça o diagnóstico rápido para que o próximo feedback seja você!
            </p>
            <Button
              size="lg"
              onClick={() => handleStartClick("start_btn_2")}
              disabled={loadingBtn === "start_btn_2"}
              data-track-click="cta_primary"
              data-track-id="cta_intermediario_btn"
              className="group h-12 md:h-14 px-6 md:px-10 text-sm md:text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-200 active:scale-[0.98]"
            >
              {loadingBtn === "start_btn_2" ? (
                <>
                  <Loader2 className="w-4 h-4 md:w-5 md:h-5 mr-2 animate-spin" />
                  CARREGANDO...
                </>
              ) : (
                <>
                  FAZER DIAGNÓSTICO (2 MIN)
                  <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </div>
        </section>

        <section data-theme="blue-temple" data-track-id="como_funciona" data-track-order="8">
          <HowItWorks />
        </section>

        <section data-theme="cave" data-track-id="diagnostico_explicado" data-track-order="8.5">
          <DiagnosticoSection />
        </section>

        <section data-theme="cave" data-track-id="faq" data-track-order="9">
          <FAQSection />
        </section>

        <section data-theme="gold-haze" data-track-id="cta_final" data-track-order="10">
          <FinalCTA />
        </section>
      </main>

      <Footer />

      {/* Mobile sticky CTA - appears only after user scrolls past success cases */}
      {isMobile && showStickyCta && (
        <div className="fixed bottom-3 left-3 right-3 z-50 md:hidden animate-fade-in">
          <Button
            size="sm"
            onClick={() => handleStartClick("mobile_sticky_cta")}
            disabled={loadingBtn === "mobile_sticky_cta"}
            className="w-full h-11 text-xs font-semibold bg-primary/95 hover:bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 backdrop-blur-sm transition-all active:scale-[0.98]"
          >
            {loadingBtn === "mobile_sticky_cta" ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                CARREGANDO...
              </>
            ) : (
              <>
                FAZER DIAGNÓSTICO
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Index;
