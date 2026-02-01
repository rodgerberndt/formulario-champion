import { AlertTriangle, XCircle } from "lucide-react";

export function ProblemSection() {
  const problems = [
    "Criativos que não passam da pré-escala",
    "Funil que não converte como deveria",
    "Pessoas que não entregam como deveriam",
    "Leads desqualificados",
    "Tráfego caro",
    "Oferta sem contexto",
  ];

  return (
    <section className="py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 mb-4">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-xs text-destructive font-medium">O Problema</span>
            </div>
            <h2 className="font-display text-2xl md:text-4xl text-foreground mb-2 tracking-wider">
              OPERAÇÕES NÃO TRAVAM POR FALTA DE VONTADE
            </h2>
            <p className="font-display text-xl md:text-3xl champion-gradient-text tracking-wider">
              — TRAVAM POR FALTA DE SISTEMA.
            </p>
          </div>

          {/* Problems Grid */}
          <div className="grid gap-2 md:gap-3">
            {problems.map((problem, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 glass-card animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
                <span className="text-muted-foreground text-sm">{problem}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
