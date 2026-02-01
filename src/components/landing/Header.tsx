import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

interface HeaderProps {
  onScrollToQuiz: () => void;
}

export function Header({ onScrollToQuiz }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
      setShowMobileCta(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* Desktop Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-background/90 backdrop-blur-xl border-b border-border/50"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-5xl">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img 
              src="/champion-logo.png" 
              alt="Champion" 
              className="h-8 md:h-10 w-auto"
            />
          </div>

          {/* Desktop CTA */}
          <Button
            variant="champion"
            size="default"
            onClick={onScrollToQuiz}
            className="hidden md:flex text-sm"
          >
            Fazer Diagnóstico
          </Button>
        </div>
      </header>

      {/* Mobile Bottom Bar CTA - appears after scroll */}
      <div 
        className={`md:hidden mobile-bottom-cta transition-all duration-300 ${
          showMobileCta ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <Button
          variant="champion"
          size="lg"
          onClick={onScrollToQuiz}
          className="w-full text-sm font-semibold"
        >
          COMEÇAR DIAGNÓSTICO
        </Button>
      </div>
    </>
  );
}
