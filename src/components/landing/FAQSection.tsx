import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";

const faqs = [
  {
    q: "Meu criativo performa no teste, mas morre quando escalo. Vocês resolvem isso?",
    a: "Sim. Esse é exatamente o problema que a gente ataca todos os dias. Criativo que valida em R$50/dia e morre em R$500 não é criativo validado — é coincidência estatística. A nossa metodologia (Gancho + Corpo + Sustentação) nasceu para construir criativos que aguentam orçamento alto sem saturar em 48h. Se um criativo seu não fez no mínimo 2 vendas no teste, ele NÃO validou — e a gente te mostra o porquê.",
  },
  {
    q: "Eu já tenho um time interno / uma agência. Por que contratar a Champion?",
    a: "A maioria dos times internos e agências entrega VOLUME de criativo — não ESCALA. A gente não compete com seu time: a gente entrega o ativo que falta, o criativo de escala. Vários clientes nossos mantêm o time interno rodando o operacional e usam a Champion para o criativo principal que sustenta a conta.",
  },
  {
    q: "Em quanto tempo eu vejo resultado?",
    a: "Os primeiros criativos sobem em até 7 dias após o onboarding. A leitura real de performance acontece entre 14 e 30 dias, porque é o tempo necessário para validar com volume de spend — não com achismo. Quem promete resultado em 48h está vendendo sorte, não método.",
  },
  {
    q: "Funciona pro meu nicho? (Infoproduto, e-commerce, low ticket, high ticket, SaaS, afiliado…)",
    a: "Sim. A gente já rodou criativo de escala em infoproduto (R$97 a R$15k), e-commerce, SaaS, igaming, serviço local, agência B2B e afiliado. O método é agnóstico de nicho porque ataca o que TODO criativo precisa pra escalar: gancho que para o scroll, corpo que sustenta atenção e CTA que converte sem fricção.",
  },
  {
    q: "Qual o investimento? Cabe no meu orçamento?",
    a: "A Assessoria Champion é feita para quem já fatura no mínimo R$10k/mês com tráfego pago — porque abaixo disso o problema raramente é criativo, é oferta. O valor exato é apresentado na call de diagnóstico, depois que a gente entende seu cenário. O ROI médio dos clientes paga a mensalidade nas primeiras 2 semanas.",
  },
  {
    q: "Eu não tenho equipe de filmagem nem ator. Vocês produzem o criativo?",
    a: "Sim. A gente cuida da estratégia, roteiro, direção e produção. Você não precisa montar estúdio, contratar editor nem aparecer na frente da câmera (a não ser que faça sentido pro seu posicionamento). Entregamos os criativos prontos pra subir.",
  },
  {
    q: "Como vocês garantem que o criativo vai performar?",
    a: "A gente NÃO garante performance — quem garante mente. O que garantimos é metodologia, processo e iteração rápida. Cada criativo passa por uma matriz de validação antes de ir pro ar, e refazemos rapidamente o que não bate o benchmark. Performance é consequência de método, e é assim que escalamos contas de R$30k pra R$300k/mês.",
  },
  {
    q: "Qual a diferença entre a Sprint e a Assessoria Completa?",
    a: "A Sprint é uma imersão pontual de criativos para resolver um gargalo específico (ex: lançamento, escala de uma oferta). A Assessoria é a parceria contínua, com produção semanal de criativos, leitura de performance e ajuste de rota — pra quem quer estabilidade de escala mês após mês. No diagnóstico a gente recomenda o formato certo pro seu momento.",
  },
  {
    q: "Por que eu tenho que responder um quiz antes de falar com vocês?",
    a: "Porque a gente não atende todo mundo. O diagnóstico filtra quem realmente tem fit com a Champion (faturamento, mercado, momento) e prepara a call para ser objetiva — sem perder seu tempo nem o nosso. Se você não tem fit, a gente fala na hora e indica o caminho certo.",
  },
  {
    q: "E se eu não gostar dos criativos?",
    a: "Tem ciclo de revisão estruturado em todos os formatos. Mas a verdade é que a maioria das fricções acontece quando o cliente quer 'criativo bonito' e a gente entrega 'criativo que vende'. No onboarding alinhamos expectativa: a régua aqui é performance, não estética.",
  },
];

export function FAQSection() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section className="py-12 md:py-20 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-5 max-w-3xl relative z-10">
        <div className={`text-center mb-8 md:mb-12 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3">
            <ShimmerText isVisible={isVisible}>PERGUNTAS </ShimmerText>
            <KeywordGlow>FREQUENTES</KeywordGlow>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            As dúvidas que mais aparecem antes de marcar o diagnóstico. Respondidas sem rodeio.
          </p>
        </div>

        <div className={`reveal-up ${isVisible ? "visible" : ""}`}>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="gold-card !border-b !p-0 overflow-hidden"
              >
                <AccordionTrigger className="px-5 py-4 md:px-6 md:py-5 text-left hover:no-underline group">
                  <span className="font-montserrat font-bold uppercase tracking-wide text-sm md:text-base text-foreground pr-4 group-hover:text-primary transition-colors">
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
