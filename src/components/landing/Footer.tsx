export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-6 border-t border-border/30">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center">
            <p className="text-xs text-muted-foreground">
              © {currentYear} Champion. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
