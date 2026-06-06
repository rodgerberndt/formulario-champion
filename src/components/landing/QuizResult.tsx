import { useState, useEffect } from "react";
import { Check, Clock, Lock, Trophy, MessageCircle, AlertCircle, Bell, Zap, ChevronRight } from "lucide-react";
import { QuizResultDara } from "./QuizResultDara";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
// SDR routing: MQL (>=10k) → Miguel | 5k-10k → Gustavo | <5k → sem SDR (redireciona externo)
const MIGUEL_WHATSAPP_NUMBER = "5511932748979";
const GUSTAVO_WHATSAPP_NUMBER = "554899161567";
const SUPPORT_WHATSAPP_NUMBER = "5548996560104";
const SUBMISSION_TS_KEY = "champion_submit_ts";
interface QuizResultProps {
  nome: string;
  estagio_negocio?: string;
  investimento_faixa?: string;
  casesSlot?: React.ReactNode;
  forceSdr?: boolean;
}
function useCountdown() {
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    const ts = localStorage.getItem(SUBMISSION_TS_KEY);
    if (!ts) {
      // Save now if not already saved
      localStorage.setItem(SUBMISSION_TS_KEY, Date.now().toString());
    }
    const tick = () => {
      const saved = Number(localStorage.getItem(SUBMISSION_TS_KEY));
      if (!saved) return;
      const deadline = saved + 6 * 60 * 60 * 1000;
      const diff = deadline - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor(diff % 3_600_000 / 60_000);
      setRemaining(`${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return remaining;
}
const steps = [{
  num: 1,
  title: "Formulário respondido",
  status: "done" as const,
  icon: Check,
  text: "Você já completou a primeira etapa."
}, {
  num: 2,
  title: "Caio te chama no WhatsApp (até 6 horas)",
  status: "active" as const,
  icon: Clock,
    text: "Estamos estudando suas informações para que o Caio te chame. Ele vai te fazer algumas perguntas rápidas para entender sua operação e confirmar se realmente conseguimos te ajudar."
}, {
  num: 3,
  title: "Call de diagnóstico gratuita (antes R$ 2.000)",
  status: "locked" as const,
  icon: Trophy,
  text: "Uma call pra entender o cenário da sua operação hoje. Você sai dela com insights práticos do que pode melhorar, várias dicas aplicáveis no dia a dia e um plano de ação claro dos próximos passos pra crescer. Essa call era vendida por R$ 2.000 e agora está gratuita pra quem preenche o formulário.",
  premium: true
}];
const statusColors = {
  done: {
    ring: "border-emerald-500/60",
    bg: "bg-emerald-500/10",
    icon: "text-emerald-400",
    line: "bg-emerald-500/40",
    badge: "bg-emerald-500/20 text-emerald-300",
    badgeText: "Concluído"
  },
  active: {
    ring: "border-secondary/60",
    bg: "bg-secondary/10",
    icon: "text-secondary",
    line: "bg-border/40",
    badge: "bg-secondary/20 text-secondary",
    badgeText: "Em andamento"
  },
  locked: {
    ring: "border-muted-foreground/20",
    bg: "bg-muted/20",
    icon: "text-muted-foreground/50",
    line: "bg-border/20",
    badge: "bg-muted/30 text-muted-foreground/60",
    badgeText: "Próximo"
  }
};
const SDR_MIN_FATURAMENTO = [
  "De R$ 5 mil a R$ 10 mil", "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];

const MIGUEL_MQL_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];
const GUSTAVO_FAIXA = "De R$ 5 mil a R$ 10 mil";

function getAssignedSdr(investimento?: string): { name: string; phone: string } {
  if (investimento && MIGUEL_MQL_FAIXAS.includes(investimento)) {
    return { name: "Miguel", phone: MIGUEL_WHATSAPP_NUMBER };
  }
  // Gustavo é o fallback para qualquer lead que chegue nesse fluxo (5k-10k).
  return { name: "Gustavo", phone: GUSTAVO_WHATSAPP_NUMBER };
}

export function QuizResult({
  nome,
  estagio_negocio,
  investimento_faixa,
  casesSlot,
  forceSdr = false
}: QuizResultProps) {
  const isDaraLead = !forceSdr && (!investimento_faixa || !SDR_MIN_FATURAMENTO.includes(investimento_faixa));
  const firstName = nome.split(" ")[0];
  const countdown = useCountdown();
  const [progressAnimated, setProgressAnimated] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setProgressAnimated(33), 400);
    return () => clearTimeout(timer);
  }, []);

  // Dara leads get a dedicated conversion-focused page
  if (isDaraLead) {
    return <QuizResultDara nome={nome} />;
  }

  const assignedSdr = getAssignedSdr(investimento_faixa);
  const sdrNumber = assignedSdr.phone;
  const waLink = `https://wa.me/${sdrNumber}?text=${encodeURIComponent("Oi! Acabei de concluir meu cadastro. ✅")}`;
  const skipLink = `https://wa.me/${sdrNumber}?text=${encodeURIComponent("Falaa, furei a fila pra falar com você, como funciona?")}`;
  const supportLink = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi! Já se passaram 6 horas e não recebi contato.")}`;
  return <div className="max-w-lg mx-auto animate-fade-in space-y-6">
      {/* ── HERO ── */}
      <div className="text-center space-y-4">
        {/* Confirmation badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto mb-2">
          <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
          Parabéns, <span className="champion-gradient-text">{firstName}</span>! Seu cadastro foi concluído com sucesso.{" "}
          <span className="champion-gradient-text">
            Você está quase garantindo sua call de diagnóstico gratuita — antes vendida por R$ 2.000.
          </span>
        </h1>

        <p className="text-muted-foreground text-base">
          Em até 6h nosso time entra em contato pelo WhatsApp. Basta responder a conversa pra liberar sua call e receber o plano de ação da sua operação.
        </p>
      </div>

      {/* ── PROGRESS BAR ── */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 space-y-3 cursor-default">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Progresso: {progressAnimated}%</span>
                <span className="text-muted-foreground text-xs">Etapa 1 de 3</span>
              </div>
              <Progress value={progressAnimated} className="h-3 bg-muted/40 [&>div]:bg-gradient-to-r [&>div]:from-secondary [&>div]:to-champion-gold" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-center">
            100% = você na call de diagnóstico gratuita (antes R$ 2.000) com plano de ação definido.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {casesSlot}

      {/* ── STEPPER ── */}
      <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6 space-y-0">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-5">O que acontece agora</h2>
        {steps.map((rawStep, i) => {
        const step = { ...rawStep };
        if (step.num === 2) {
          step.title = `${assignedSdr.name} te chama no WhatsApp (até 6 horas)`;
          step.text = `Estamos estudando suas informações para que o ${assignedSdr.name} te chame. Ele vai te fazer algumas perguntas rápidas para entender sua operação e confirmar se realmente conseguimos te ajudar.`;
        }
        const colors = statusColors[step.status];
        const Icon = step.icon;
        const isLast = i === steps.length - 1;
        return <div key={step.num} className="flex gap-4">
              {/* Left rail */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 ${colors.ring} ${colors.bg} ${step.premium ? "shadow-[0_0_20px_-4px_hsl(43_85%_55%/0.3)]" : ""}`}>
                  <Icon className={`w-5 h-5 ${colors.icon}`} />
                </div>
                {!isLast && <div className={`w-0.5 flex-1 my-1.5 rounded-full ${colors.line}`} />}
              </div>

              {/* Content */}
              <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className={`text-sm font-semibold leading-snug ${step.status === "locked" ? "text-muted-foreground/70" : "text-foreground"}`}>
                    {step.num}) {step.title}
                  </h3>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {colors.badgeText}
                  </span>
                </div>
                <p className={`text-sm leading-relaxed ${step.status === "locked" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                  {step.text}
                </p>
              </div>
            </div>;
      })}
      </div>

      {/* ── CTA CARD ── */}
      




































      {/* ── SKIP THE LINE ── */}
      <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6 space-y-4">
        <h2 className="text-lg md:text-xl font-bold text-foreground leading-tight">
          Pule a fila, caso precise
        </h2>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Somente aqui nessa seção da página quero liberar uma função inédita, somente se você <strong className="text-foreground">realmente quer ter os mesmos resultados</strong> dos clientes que implementaram a Champion na sua operação.
        </p>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Ao invés de esperar nosso time entrar em contato e marcar a call, você pode <strong className="text-secondary">pular a fila</strong> e conseguir entrar em contato com o nosso time, caso ainda não entramos em contato com você.
        </p>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Para pular a fila, basta apertar o botão abaixo desse texto.
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

      {/* ── MOTIVATIONAL HEADLINE ── */}
      


    </div>;
}