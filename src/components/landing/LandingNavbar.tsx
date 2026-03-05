import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "Portfólio", href: "#portfolio" },
  { label: "Método", href: "#metodo" },
  { label: "Como funciona", href: "#como-funciona" },
  
];

export function LandingNavbar() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleAnchor = (href: string) => {
    setMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/90 backdrop-blur-xl border-b border-border/40 py-2"
          : "bg-transparent py-4"
      }`}
    >
      <div className="container mx-auto px-5 flex items-center justify-between max-w-6xl">
        <img
          src="/champion-logo.png"
          alt="Champion"
          width={120}
          height={40}
          className="h-8 md:h-10 w-auto"
          loading="eager"
        />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => handleAnchor(item.href)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className="md:hidden text-foreground"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-xl border-t border-border/30 px-5 py-4 space-y-3">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => handleAnchor(item.href)}
              className="block w-full text-left text-sm text-muted-foreground hover:text-foreground py-2"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
