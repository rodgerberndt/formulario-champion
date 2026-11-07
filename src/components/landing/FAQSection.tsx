import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useReveal } from "@/hooks/useReveal";
import { useCopyNicho } from "@/config/nichoLanding";
import { ShimmerText, KeywordGlow } from "./TextEffects";

// slug curto e estável p/ tracking (NÃO mudar a ordem — referenciado no admin)
const faqSlug = (i: number) => `faq_q${i + 1}`;

export function FAQSection() {
  const { ref, isVisible } = useReveal(0.08);
  const copyFaq = useCopyNicho().faq;
  const faqs = copyFaq.itens;

  return (
    <section className="py-12 md:py-20 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-5 max-w-3xl relative z-10">
        <div className={`text-center mb-8 md:mb-12 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            <ShimmerText isVisible={isVisible}>{copyFaq.tituloInicio}</ShimmerText>
            <span className="inline-block w-2 md:w-3" />
            <KeywordGlow>{copyFaq.tituloDestaque}</KeywordGlow>
          </h2>
          <p className="inline-flex items-center gap-2 font-semibold uppercase tracking-[0.2em] text-[11.5px] text-secondary mb-4 before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-secondary">
            FAQ
          </p>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            {copyFaq.sub}
          </p>
        </div>

        {/* A entrada é por PERGUNTA, com stagger de 60 ms (classe
            `reveal-stagger`), em vez de o bloco inteiro aparecer de uma vez. */}
        <div>
          <Accordion type="single" collapsible className="space-y-3 reveal-stagger">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className={`gold-card !border-b !p-0 overflow-hidden data-[state=open]:border-secondary/60 data-[state=open]:bg-secondary/[0.05] reveal-up ${isVisible ? "visible" : ""}`}
              >
                <AccordionTrigger
                  className="px-5 py-4 md:px-6 md:py-5 text-left hover:no-underline group [@media(hover:none)]:hover:bg-transparent [&>svg]:text-secondary"
                  data-track-click="faq_open"
                  data-track-id={faqSlug(i)}
                  aria-label={faq.q}
                >
                  <span className="font-sans font-semibold tracking-normal text-[15px] md:text-base leading-snug text-foreground pr-4 md:group-hover:text-secondary transition-colors">
                    {faq.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-5 md:px-6 pb-5 text-sm md:text-base text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
