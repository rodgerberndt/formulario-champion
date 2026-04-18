import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function Header() {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-2xl">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img 
            src="/champion-logo.webp" 
            alt="Champion" 
            className="h-8 md:h-10 w-auto"
            loading="eager"
            key="champion-logo"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => navigate("/quiz")}
            className="text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 transition-all duration-200"
          >
            FAZER DIAGNÓSTICO
          </Button>
        </div>
      </div>
    </header>
  );
}