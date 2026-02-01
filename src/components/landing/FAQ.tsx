import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Shield } from "lucide-react";

const faqs = [
  {
    question: "Quanto tempo leva o diagnóstico?",
    answer: "O quiz leva de 2 a 4 minutos para responder. Após o envio, nossa equipe analisa suas respostas e um SDR entra em contato em até 24 horas úteis para agendar uma reunião estratégica de 30-45 minutos.",
  },
  {
    question: "Para quem é esse diagnóstico?",
    answer: "Para empresários e gestores de marketing que já investem ou querem investir em tráfego pago e buscam escalar com previsibilidade. Ideal para infoprodutores, e-commerces, SaaS e prestadores de serviço.",
  },
  {
    question: "Preciso já investir em tráfego?",
    answer: "Não necessariamente. Trabalhamos com empresas em validação (testando primeiros anúncios) até operações em escala. O diagnóstico identifica seu momento e sugere os próximos passos adequados.",
  },
  {
    question: "Como é a reunião estratégica?",
    answer: "Uma call de 30-45 minutos onde apresentamos o diagnóstico completo do seu funil, identificamos os gargalos e mostramos o plano de ação personalizado. Sem enrolação, direto ao ponto.",
  },
  {
    question: "O que eu recebo exatamente?",
    answer: "Dependendo da sua qualificação: Mapa do Funil, Matriz Criativa, Playbook de WhatsApp, Roteiro de Reunião e um Plano de Ação de 7-14 dias com os primeiros passos executáveis.",
  },
  {
    question: "Tem contrato ou compromisso?",
    answer: "O diagnóstico e a reunião são gratuitos e sem compromisso. Caso decida seguir com a execução, discutimos termos e valores na própria reunião.",
  },
  {
    question: "E se eu não for qualificado agora?",
    answer: "Sem problemas! Você receberá conteúdos e materiais para evoluir seu negócio. Quando estiver no momento certo, pode refazer o diagnóstico ou entrar em contato diretamente.",
  },
  {
    question: "Meus dados estão seguros?",
    answer: "Sim. Seguimos as diretrizes da LGPD. Seus dados são usados exclusivamente para o diagnóstico e contato comercial. Não compartilhamos com terceiros e você pode solicitar exclusão a qualquer momento.",
  },
];

export function FAQ() {
  return (
    <section className="py-20 bg-card/50">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 mb-6">
              <HelpCircle className="w-4 h-4 text-secondary" />
              <span className="text-sm text-secondary font-medium">Dúvidas Frequentes</span>
            </div>
            <h2 className="font-display text-3xl md:text-5xl text-foreground mb-4 tracking-wider">
              PERGUNTAS FREQUENTES
            </h2>
          </div>

          {/* Accordion */}
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="champion-card border-none"
              >
                <AccordionTrigger className="text-left font-semibold text-foreground hover:text-secondary hover:no-underline px-0">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-muted-foreground">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-secondary" />
              <span>Dados protegidos (LGPD)</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-secondary" />
              <span>Sem spam</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-secondary" />
              <span>Reunião objetiva</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
