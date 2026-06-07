import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Clock, MessageCircle, Rocket, Users, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SuccessCasesCompact } from "@/components/landing/SuccessCasesCompact";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { supabase } from "@/integrations/supabase/client";

const GUSTAVO_WHATSAPP_NUMBER = "5548996378499";
const SUPPORT_WHATSAPP_NUMBER = "5548996560104";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const RESULT_STORAGE_KEY = "champion_quiz_result";

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  investimento_faixa: string;
  dor_desejo: string;
}

// Texto específico por dor selecionada no quiz (sem travessões nem estilo IA)
const DOR_COPY: Record<string, string> = {
  "Delegar para ganhar mais tempo":
    "ele vai te mostrar como tirar essa rotina das suas costas pra você voltar a focar no que realmente cresce a operação.",
  "Criativos que não vendem":
    "ele vai te mostrar por que seus criativos não estão convertendo e o que ajustar pra começar a vender de verdade.",
  "Criativos que aguentam escala":
    "ele vai te mostrar a estrutura de criativos que segura escala sem o CPA explodir.",
  "Lead qualificado":
    "ele vai te mostrar como filtrar o público certo pra parar de queimar verba com lead frio.",
  "Reprovação de criativos":
    "ele vai te mostrar como driblar as reprovações da Meta e manter sua conta saudável no ar.",
  "Otimizações com base em métricas":
    "ele vai te mostrar como ler as métricas certas e otimizar a campanha sem achismo.",
  "Falta de conhecimento":
    "ele vai te explicar, do zero, o que tá faltando na sua operação pra ela começar a girar de forma previsível.",
};

function dorTextoFor(dor?: string): string {
  if (!dor) return "ele vai entender exatamente o cenário da sua operação e montar o caminho pra resolver isso.";
  const trimmed = dor.trim();
  if (DOR_COPY[trimmed]) return DOR_COPY[trimmed];
  // Dor livre digitada pelo lead
  return "ele vai olhar de perto o que você descreveu e montar o caminho certo pra destravar isso.";
}

function PageBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            145deg, 
            hsl(235 50% 4%) 0%, 
            hsl(238 65% 10%) 35%,
            hsl(250 55% 12%) 60%,
            hsl(235 50% 5%) 100%
          )`,
        }}
      />
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div 
        className="absolute -top-20 left-1/4 w-[350px] h-[350px] rounded-full blur-[70px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.1) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute top-1/2 -right-20 w-[300px] h-[300px] rounded-full blur-[60px]"
        style={{
          background: 'radial-gradient(circle, hsl(43 85% 55% / 0.07) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute -bottom-16 left-1/3 w-[280px] h-[280px] rounded-full blur-[50px]"
        style={{
          background: 'radial-gradient(circle, hsl(260 80% 50% / 0.06) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

// Faixas that qualify as MQL for Pixel/CAPI (>= R$ 10k)
const MQL_PIXEL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil",
  "De R$ 20 mil a R$ 30 mil",
  "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil",
  "De R$ 75 mil a R$ 100 mil",
  "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil",
  "De R$ 200 mil a R$ 300 mil",
  "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil",
  "De R$ 750 mil a R$ 1 milhão",
  "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões",
  "De R$ 3 milhões a R$ 5 milhões",
  "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 20k – 50k",
  "R$ 50k – 100k",
];

export default function ObrigadoSprint() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<QuizFormData | null>(null);
  const conversionEventFired = useRef(false);
  const [progress, setProgress] = useState(0);

  // Fire PageView so Meta sees conversions from this URL
  useEffect(() => {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');
      console.log('Facebook Pixel: PageView fired on /obrigadosprint');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setProgress(33), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (formData && !conversionEventFired.current) {
      if (typeof window.fbq === 'function') {
        // Read shared event_ids for CAPI deduplication
        let crEventID: string | undefined;
        let mqlEventID: string | undefined;
        try {
          const stored = localStorage.getItem('champion_event_ids');
          if (stored) {
            const parsed = JSON.parse(stored);
            crEventID = parsed.event_ids?.CompleteRegistration;
            mqlEventID = parsed.event_ids?.MQL;
          }
        } catch { /* ignore */ }

        // Fire CompleteRegistration with matching event_id
        window.fbq('track', 'CompleteRegistration', {}, { eventID: crEventID });
        console.log('Facebook Pixel: CompleteRegistration fired with eventID:', crEventID);

        // Only fire MQL for leads with faturamento >= R$ 10k
        const isMqlEligible = formData.investimento_faixa && MQL_PIXEL_FAIXAS.includes(formData.investimento_faixa);
        if (isMqlEligible) {
          window.fbq('trackCustom', 'MQL', {
            content_name: 'MQL Lead',
            investimento_faixa: formData.investimento_faixa || 'unknown',
          }, { eventID: mqlEventID });
          console.log('Facebook Pixel: MQL fired with eventID:', mqlEventID);
        } else {
          console.log('Facebook Pixel: MQL NOT fired - faixa not eligible:', formData.investimento_faixa);
        }

        conversionEventFired.current = true;
      }
    }
  }, [formData]);

  useEffect(() => {
    const saved = localStorage.getItem(RESULT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(parsed);
      } catch {
        navigate("/quiz");
      }
    } else {
      navigate("/quiz");
    }
  }, [navigate]);

  if (!formData) {
    return null;
  }

  const firstName = formData.nome_completo.split(" ")[0];
  const dorTexto = dorTextoFor(formData.dor_desejo);
  const waLink = `https://wa.me/${GUSTAVO_WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi Gustavo! Acabei de concluir minha aplicação pro Sprint. ✅")}`;
  const skipLink = `https://wa.me/${GUSTAVO_WHATSAPP_NUMBER}?text=${encodeURIComponent("Fala Gustavo! Furei a fila, quero entender como funciona o Sprint.")}`;

  const steps = [
    {
      title: "Aplicação preenchida",
      text: "Você concluiu o formulário. A partir de agora seu cadastro entra na fila do Gustavo.",
      status: "done" as const,
      Icon: Check,
    },
    {
      title: "Gustavo vai te chamar no WhatsApp",
      text: `Em até 6 horas o Gustavo, sócio da Champion, vai te chamar pra entender como sua operação tá rodando hoje.`,
      status: "active" as const,
      Icon: Clock,
    },
    {
      title: "Ele vai te explicar como funciona o Sprint",
      text: `O Gustavo vai te mostrar o ecossistema do Sprint, tirar todas as suas dúvidas e, a partir do que você falou no quiz, ${dorTexto}`,
      status: "locked" as const,
      Icon: Rocket,
    },
  ];

  const statusStyles = {
    done:   { ring: "border-emerald-500/60", bg: "bg-emerald-500/10",  icon: "text-emerald-400",  line: "bg-emerald-500/40", badge: "bg-emerald-500/20 text-emerald-300", label: "Concluído" },
    active: { ring: "border-secondary/60",   bg: "bg-secondary/10",    icon: "text-secondary",     line: "bg-border/40",      badge: "bg-secondary/20 text-secondary",      label: "Em andamento" },
    locked: { ring: "border-muted-foreground/20", bg: "bg-muted/20",   icon: "text-muted-foreground/50", line: "bg-border/20", badge: "bg-muted/30 text-muted-foreground/60", label: "Próximo" },
  } as const;

  return (
    <div className="min-h-[100svh] relative w-full max-w-full overflow-x-hidden">
      <PageBackground />
      
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>
      </header>

      <main className="pt-20 pb-12 px-4 min-h-[100svh]" style={{ paddingBottom: 'calc(48px + env(safe-area-inset-bottom))' }}>
        <div className="container mx-auto max-w-lg space-y-6">
          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto mb-2">
              <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
              Boa, <span className="champion-gradient-text">{firstName}</span>! Sua aplicação caiu aqui.{" "}
              <span className="champion-gradient-text">
                O próximo passo é uma conversa direta com o Gustavo, sócio da Champion, pra te apresentar o Sprint.
              </span>
            </h1>
            <p className="text-muted-foreground text-base">
              Em até 6 horas ele te chama no WhatsApp pra entender sua operação e te mostrar como o Sprint pode resolver o que você marcou no quiz.
            </p>
          </div>

          {/* Progress */}
          <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">Progresso: {progress}%</span>
              <span className="text-muted-foreground text-xs">Etapa 1 de 3</span>
            </div>
            <Progress value={progress} className="h-3 bg-muted/40 [&>div]:bg-gradient-to-r [&>div]:from-secondary [&>div]:to-champion-gold" />
          </div>

          {/* Cases + feedbacks */}
          <div className="-mx-4 space-y-2 obrigadomql-cases">
            <SuccessCasesCompact />
            <SocialProofCarousel />
          </div>

          {/* Stepper */}
          <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-5">O que acontece agora</h2>
            {steps.map((step, i) => {
              const s = statusStyles[step.status];
              const Icon = step.Icon;
              const isLast = i === steps.length - 1;
              return (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 ${s.ring} ${s.bg}`}>
                      <Icon className={`w-5 h-5 ${s.icon}`} />
                    </div>
                    {!isLast && <div className={`w-0.5 flex-1 my-1.5 rounded-full ${s.line}`} />}
                  </div>
                  <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className={`text-sm font-semibold leading-snug ${step.status === "locked" ? "text-muted-foreground/70" : "text-foreground"}`}>
                        {i + 1}) {step.title}
                      </h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                    </div>
                    <p className={`text-sm leading-relaxed ${step.status === "locked" ? "text-muted-foreground/70" : "text-muted-foreground"}`}>
                      {step.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sprint explainer */}
          <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-secondary" />
              </div>
              <h2 className="text-lg md:text-xl font-bold text-foreground leading-tight">
                O que é o Sprint
              </h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              O Sprint é uma demanda de teste que a Champion executa pra novos clientes. A gente entra na sua conta e testa diversos formatos, ângulos e personas em ads pra encontrar o que realmente performa pra sua operação.
            </p>

            <div className="grid gap-3">
              <div className="flex gap-3 p-3 rounded-xl bg-primary/[0.04] border border-border/40">
                <Rocket className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">16 criativos testados</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Diferentes formatos, ângulos e personas batendo em várias fatias de público pra descobrir o que melhor converte na sua operação.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3 rounded-xl bg-primary/[0.04] border border-border/40">
                <Users className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Call de alinhamento com o time</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Você senta junto com o copy, o editor de múltiplos 7 dígitos e o head da Champion pra alinhar estratégia desde o dia 1.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-3 rounded-xl bg-primary/[0.04] border border-border/40">
                <BarChart3 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Call de diagnóstico dos criativos</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Depois dos testes a gente analisa as métricas de cada criativo com você e define o que escalar e o que otimizar.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Quando o Gustavo te chamar, ele vai te explicar tudo isso na prática e como o Sprint resolve <strong className="text-foreground">o que você marcou no quiz</strong>.
            </p>
          </div>

          {/* Pular a fila */}
          <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6 space-y-4">
            <h2 className="text-lg md:text-xl font-bold text-foreground leading-tight">
              Pule a fila, caso queira adiantar
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Se você quer mesmo entender como o Sprint pode rodar na sua operação, pode pular a fila e chamar o Gustavo agora no WhatsApp em vez de esperar o contato dele.
            </p>
            <Button variant="championOutline" size="lg" className="w-full text-base" asChild>
              <a
                href={skipLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  try {
                    const leadId = localStorage.getItem('champion_lead_id');
                    if (leadId) {
                      const now = new Date().toISOString();
                      supabase
                        .from('leads')
                        .update({
                          skipped_queue: true,
                          skipped_queue_at: now,
                          clicked_whatsapp: true,
                          clicked_whatsapp_at: now,
                        })
                        .eq('id', leadId)
                        .then(({ error }) => {
                          if (error) console.warn('[skip-queue] update failed:', error);
                        });
                    }
                  } catch (e) {
                    console.warn('[skip-queue] error:', e);
                  }
                }}
              >
                <MessageCircle className="w-5 h-5" />
                Pular a fila agora
              </a>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
