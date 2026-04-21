import { useState } from "react";
import { Menu, X } from "lucide-react";

const navItems = ["Portfólio", "Método", "Como funciona"];

export function LandingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-transparent py-4 transition-all duration-500"
    >
      <div className="container mx-auto px-5 flex items-center justify-between max-w-6xl">
        <img
          src="/champion-logo.webp"
          alt="Champion"
          width={120}
          height={40}
          className="h-8 md:h-10 w-auto"
          loading="eager"
        />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <span key={item} className="text-sm font-medium text-muted-foreground">
              {item}
            </span>
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
            <span key={item} className="block w-full text-left text-sm text-muted-foreground py-2">
              {item}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
