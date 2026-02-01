import { Trophy } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-secondary" />
              </div>
              <span className="font-display text-xl champion-gradient-text tracking-wider">
                CHAMPION
              </span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-secondary transition-colors">
                [Política de Privacidade]
              </a>
              <a href="#" className="hover:text-secondary transition-colors">
                [Termos de Uso]
              </a>
              <a href="#" className="hover:text-secondary transition-colors">
                [Contato]
              </a>
            </div>

            {/* Copyright */}
            <p className="text-sm text-muted-foreground">
              © {currentYear} Champion. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
