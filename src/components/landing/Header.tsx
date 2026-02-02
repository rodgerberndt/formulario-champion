import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNavigate } from "react-router-dom";

export function Header() {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-5xl">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img 
            src="/champion-logo.png" 
            alt="Champion" 
            className="h-7 md:h-9 w-auto"
          />
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          
          {/* Desktop CTA */}
          <Button
            size="sm"
            onClick={() => navigate("/quiz")}
            className="hidden md:flex text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
          >
            FAZER DIAGNÓSTICO (2 MIN)
          </Button>
        </div>
      </div>
    </header>
  );
}
