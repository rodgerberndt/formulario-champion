import { AlertTriangle, XCircle } from "lucide-react";

export function ProblemSection() {
  const problems = [
    "Criativos que não passam da pré-escala",
    "Funil que não converte como deveria",
    "WhatsApp sem processo definido",
    "Reuniões que não fecham",
    "Leads perdidos por falta de follow-up",
  ];

  return (
    <section className="py-20 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 mb-6">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive font-medium">O Problema</span>
            </div>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-4 tracking-wider">
              EMPRESAS NÃO TRAVAM POR FALTA DE VONTADE
            </h2>
            <p className="font-display text-2xl md:text-4xl champion-gradient-text tracking-wider">
              — TRAVAM POR FALTA DE SISTEMA.
            </p>
          </div>

          {/* Problems Grid */}
          <div className="grid gap-4">
            {problems.map((problem, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 bg-background/50 border border-border rounded-lg animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <XCircle className="w-5 h-5 text-destructive shrink-0" />
                <span className="text-muted-foreground">{problem}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
