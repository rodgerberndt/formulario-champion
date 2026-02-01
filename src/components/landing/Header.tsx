import { Button } from "@/components/ui/button";
import { Trophy, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

interface HeaderProps {
  onScrollToQuiz: () => void;
}

export function Header({ onScrollToQuiz }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
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
            ? "bg-background/95 backdrop-blur-md border-b border-border shadow-lg"
            : "bg-transparent"
        }`}
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-secondary" />
            </div>
            <span className="font-display text-2xl md:text-3xl champion-gradient-text tracking-wider">
              CHAMPION
            </span>
          </div>

          {/* Desktop CTA */}
          <Button
            variant="champion"
            size="lg"
            onClick={onScrollToQuiz}
            className="hidden md:flex"
          >
            Fazer Diagnóstico Agora
          </Button>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden text-foreground p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-card border-t border-border p-4 animate-slide-up">
            <Button
              variant="champion"
              size="lg"
              onClick={() => {
                onScrollToQuiz();
                setMobileMenuOpen(false);
              }}
              className="w-full"
            >
              Fazer Diagnóstico Agora
            </Button>
          </div>
        )}
      </header>

      {/* Mobile Bottom Bar CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur-md border-t border-border">
        <Button
          variant="champion"
          size="lg"
          onClick={onScrollToQuiz}
          className="w-full"
        >
          Começar Diagnóstico
        </Button>
      </div>
    </>
  );
}
