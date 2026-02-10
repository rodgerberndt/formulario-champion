import { useState, useEffect } from "react";
import { Check, Clock, Lock, Trophy, MessageCircle, AlertCircle, Bell, Zap, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const WHATSAPP_NUMBER = "55XXXXXXXXXXX";
const SUPPORT_WHATSAPP_NUMBER = "55XXXXXXXXXXX";
const SUBMISSION_TS_KEY = "champion_submit_ts";

interface QuizResultProps {
  nome: string;
  formData?: unknown;
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
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setRemaining(`${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}m`);
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return remaining;
}

const steps = [
  {
    num: 1,
    title: "Formulário respondido",
    status: "done" as const,
    icon: Check,
    text: "Você já completou a primeira etapa.",
  },
  {
    num: 2,
    title: "Consultor te chama no WhatsApp (até 6 horas)",
    status: "active" as const,
    icon: Clock,
    text: "Estamos estudando suas informações para que nosso melhor consultor te chame. Ele vai te fazer algumas perguntas rápidas para entender sua operação e confirmar se realmente conseguimos te ajudar.",
  },
  {
    num: 3,
    title: "Call de alinhamento (somente para quem está na fase certa)",
    status: "locked" as const,
    icon: Lock,
    text: "Essa call só acontece quando entendemos claramente como podemos ajudar. Acontece apenas com clientes que estão na fase correta para entrar na CGS (nosso sistema de crescimento).",
  },
  {
    num: 4,
    title: "Entrada na CGS + plano personalizado",
    status: "locked" as const,
    icon: Trophy,
    text: "A entrega da CGS é personalizada conforme sua necessidade, com base nas conversas do WhatsApp e também da call.",
    premium: true,
  },
];

const statusColors = {
  done: {
    ring: "border-emerald-500/60",
    bg: "bg-emerald-500/10",
    icon: "text-emerald-400",
    line: "bg-emerald-500/40",
    badge: "bg-emerald-500/20 text-emerald-300",
    badgeText: "Concluído",
  },
  active: {
    ring: "border-secondary/60",
    bg: "bg-secondary/10",
    icon: "text-secondary",
    line: "bg-border/40",
    badge: "bg-secondary/20 text-secondary",
    badgeText: "Em andamento",
  },
  locked: {
    ring: "border-muted-foreground/20",
    bg: "bg-muted/20",
    icon: "text-muted-foreground/50",
    line: "bg-border/20",
    badge: "bg-muted/30 text-muted-foreground/60",
    badgeText: "Próximo",
  },
};

export function QuizResult({ nome }: QuizResultProps) {
  const firstName = nome.split(" ")[0];
  const countdown = useCountdown();
  const [progressAnimated, setProgressAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setProgressAnimated(25), 400);
    return () => clearTimeout(timer);
  }, []);

  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi! Acabei de concluir meu cadastro. ✅")}`;
  const supportLink = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi! Já se passaram 6 horas e não recebi contato.")}`;

  return (
    <div className="max-w-lg mx-auto animate-fade-in space-y-6">
      {/* ── HERO ── */}
      <div className="text-center space-y-4">
        {/* Confirmation badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto mb-2">
          <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
          Seu cadastro foi concluído com sucesso.{" "}
          <span className="champion-gradient-text">
            {countdown
              ? `Em até ${countdown} nosso time entrará em contato com você!`
              : "Em até 6h nosso time entrará em contato com você!"}
          </span>
        </h1>

        <p className="text-muted-foreground text-base">
          Parabéns, <strong className="text-foreground">{firstName}</strong>! Seu cadastro está realizado com sucesso!
        </p>
      </div>

      {/* ── PROGRESS BAR ── */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 space-y-3 cursor-default">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Progresso: {progressAnimated}%</span>
                <span className="text-muted-foreground text-xs">Etapa 1 de 4</span>
              </div>
              <Progress value={progressAnimated} className="h-3 bg-muted/40 [&>div]:bg-gradient-to-r [&>div]:from-secondary [&>div]:to-champion-gold" />
              <p className="text-xs text-muted-foreground">
                Quando chegar em 100%, você desbloqueia algo <strong className="text-secondary">muito foda</strong> pra sua operação.
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-center">
            100% = você dentro da CGS com plano de crescimento definido.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* ── STEPPER ── */}
      <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6 space-y-0">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-5">O que acontece agora</h2>
        {steps.map((step, i) => {
          const colors = statusColors[step.status];
          const Icon = step.icon;
          const isLast = i === steps.length - 1;

          return (
            <div key={step.num} className="flex gap-4">
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
            </div>
          );
        })}
      </div>

      {/* ── CTA CARD ── */}
      <div className="bg-card/70 backdrop-blur-xl border border-secondary/30 rounded-2xl p-5 md:p-6 space-y-4 shadow-[0_0_40px_-10px_hsl(43_85%_55%/0.15)]">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
          <Bell className="w-4 h-4 text-secondary" />
          Faça isso pra não perder o contato
        </h2>

        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-3">
            <div className="p-1 rounded-md bg-secondary/10 mt-0.5 shrink-0">
              <MessageCircle className="w-4 h-4 text-secondary" />
            </div>
            <span>Fique de olho no WhatsApp e mantenha as notificações ativas.</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="p-1 rounded-md bg-secondary/10 mt-0.5 shrink-0">
              <Zap className="w-4 h-4 text-secondary" />
            </div>
            <span>Responda assim que nosso consultor chamar — isso acelera o processo.</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="p-1 rounded-md bg-secondary/10 mt-0.5 shrink-0">
              <ChevronRight className="w-4 h-4 text-secondary" />
            </div>
            <span>Se tiver, já separa: investimento mensal, ticket médio e principal meta.</span>
          </li>
        </ul>

        <Button
          variant="champion"
          size="lg"
          className="w-full text-base animate-pulse-slow"
          asChild
        >
          <a href={waLink} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="w-5 h-5" />
            Abrir WhatsApp agora
          </a>
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Dica: mande essa mensagem pra garantir que você receba nosso contato sem falhas.
        </p>
      </div>

      {/* ── SUPPORT FALLBACK ── */}
      <div className="bg-card/50 border border-border/30 rounded-2xl p-4 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>Se já passaram 6 horas e ninguém te chamou, clique abaixo.</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={supportLink} target="_blank" rel="noopener noreferrer">
            Avisar suporte
          </a>
        </Button>
      </div>
    </div>
  );
}
