export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-6 border-t border-border/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            © {currentYear} Champion Advertising Studio
          </p>
        </div>
      </div>
    </footer>
  );
}
