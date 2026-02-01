import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "[NOME DO CLIENTE]",
    company: "[EMPRESA]",
    result: "[RESULTADO ALCANÇADO - ex: 3x mais reuniões em 30 dias]",
    quote: "[DEPOIMENTO DO CLIENTE - 2-3 frases sobre a experiência e resultados]",
  },
  {
    name: "[NOME DO CLIENTE]",
    company: "[EMPRESA]",
    result: "[RESULTADO ALCANÇADO - ex: ROI de 5x no primeiro mês]",
    quote: "[DEPOIMENTO DO CLIENTE - 2-3 frases sobre a experiência e resultados]",
  },
  {
    name: "[NOME DO CLIENTE]",
    company: "[EMPRESA]",
    result: "[RESULTADO ALCANÇADO - ex: 40% mais conversão no WhatsApp]",
    quote: "[DEPOIMENTO DO CLIENTE - 2-3 frases sobre a experiência e resultados]",
  },
];

const logos = [
  "[LOGO 1]",
  "[LOGO 2]",
  "[LOGO 3]",
  "[LOGO 4]",
  "[LOGO 5]",
  "[LOGO 6]",
];

export function SocialProof() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider mb-4 block">
              Prova Social
            </span>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-4 tracking-wider">
              QUEM JÁ PASSOU PELO
            </h2>
            <p className="font-display text-2xl md:text-4xl champion-gradient-text tracking-wider">
              DIAGNÓSTICO CHAMPION
            </p>
          </div>

          {/* Testimonials */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="champion-card relative animate-slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Quote Icon */}
                <Quote className="w-8 h-8 text-secondary/20 absolute top-6 right-6" />

                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-secondary text-secondary" />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-muted-foreground text-sm mb-6 italic">
                  "{testimonial.quote}"
                </p>

                {/* Result Badge */}
                <div className="inline-block px-3 py-1 bg-secondary/10 rounded-full text-secondary text-xs font-semibold mb-4">
                  {testimonial.result}
                </div>

                {/* Author */}
                <div className="border-t border-border pt-4">
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-muted-foreground text-sm">{testimonial.company}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Cases/Prints Placeholder */}
          <div className="champion-card mb-16 text-center py-12">
            <p className="text-muted-foreground">
              [INSERIR PRINTS DE CASES / RESULTADOS AQUI]
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Recomendado: 2-4 imagens de dashboards, conversas ou resultados
            </p>
          </div>

          {/* Logos */}
          <div className="text-center">
            <p className="text-muted-foreground text-sm mb-6">
              Empresas que confiam no método Champion:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {logos.map((logo, index) => (
                <div
                  key={index}
                  className="w-24 h-12 bg-muted/50 rounded flex items-center justify-center text-muted-foreground text-xs"
                >
                  {logo}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
