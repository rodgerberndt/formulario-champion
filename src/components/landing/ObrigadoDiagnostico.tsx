import { CasesSucesso } from "@/components/landing/CasesSucesso";
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Check,
  ClipboardList,
  Clock,
  Lightbulb,
  MessageCircle,
  Target,
  Trophy,
  Video,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { rotuloReuniao, type ReuniaoConfirmada } from "@/lib/agendamento";

/**
 * Conteúdo de /obrigadomql (redesenho de 17/09/2026).
 *
 * Todo lead do formulário cai aqui, sempre com a narrativa da call de
 * diagnóstico. Duas variações:
 *   - sem reunião: etapa 2 = nosso time chama no WhatsApp em até 6 h;
 *   - com reunião (lead >= R$ 100 mil que escolheu horário em /agendar):
 *     etapa 2 concluída, com dia e hora.
 *
 * Tudo aqui é estático de propósito: nada depende de animação de "aparecer ao
 * rolar", que era o que deixava a página com um vão vazio embaixo do progresso.
 * A prova reaproveita os números do Hero e os cases de SuccessCasesCompact.
 */

type Status = "done" | "active" | "next";

const ESTILO: Record<Status, { ring: string; bg: string; icon: string; line: string; badge: string; rotulo: string }> = {
  done: {
    ring: "border-emerald-500/60",
    bg: "bg-emerald-500/10",
    icon: "text-emerald-400",
    line: "bg-emerald-500/40",
    badge: "bg-emerald-500/20 text-emerald-300",
    rotulo: "Concluído",
  },
  active: {
    ring: "border-secondary/60",
    bg: "bg-secondary/10",
    icon: "text-secondary",
    line: "bg-border/40",
    badge: "bg-secondary/20 text-secondary",
    rotulo: "Em andamento",
  },
  next: {
    ring: "border-secondary/30",
    bg: "bg-secondary/5",
    icon: "text-secondary/80",
    line: "bg-border/30",
    badge: "bg-muted/40 text-muted-foreground",
    rotulo: "Próximo",
  },
};

const GANHOS = [
  { icon: Target, titulo: "Leitura da sua operação", texto: "Um olhar de fora sobre o cenário atual dos seus anúncios e criativos." },
  { icon: Lightbulb, titulo: "Insights práticos", texto: "O que pode melhorar já, com dicas aplicáveis no dia a dia." },
  { icon: ClipboardList, titulo: "Plano de ação", texto: "Os próximos passos claros pra sua operação crescer." },
  { icon: Trophy, titulo: "Sem custo", texto: "Essa call era vendida por R$ 2.000 e sai gratuita pra quem preencheu a aplicação." },
];

interface Props {
  nome: string;
  reuniao: ReuniaoConfirmada | null;
}

export function ObrigadoDiagnostico({ nome, reuniao }: Props) {
  const primeiroNome = (nome || "").trim().split(" ")[0];
  const quando = reuniao ? rotuloReuniao(reuniao.inicio) : null;
  const alvo = reuniao ? 66 : 33;
  const [progresso, setProgresso] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setProgresso(alvo), 300);
    return () => clearTimeout(t);
  }, [alvo]);

  const etapas: { titulo: string; texto: string; status: Status; Icon: typeof Check }[] = [
    {
      titulo: "Formulário enviado",
      texto: "Recebemos suas informações. Essa etapa já está feita.",
      status: "done",
      Icon: Check,
    },
    reuniao
      ? {
        titulo: "Call agendada",
        texto: `Sua call ficou para ${quando} (horário de Brasília), pelo Google Meet.`,
        status: "done",
        Icon: CalendarCheck,
      }
      : {
        titulo: "Nosso time te chama no WhatsApp",
        texto: "Em até 6 horas a gente te chama pra entender rapidinho sua operação e liberar o horário da sua call.",
        status: "active",
        Icon: MessageCircle,
      },
    {
      titulo: "Call de diagnóstico com plano de ação",
      texto: "Você sai da call sabendo o que ajustar e quais são os próximos passos pra crescer.",
      status: reuniao ? "active" : "next",
      Icon: Trophy,
    },
  ];

  return (
    <div className="animate-fade-in space-y-6 md:space-y-8">
      {/* ── Topo ── */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30">
          <Check className="w-7 h-7 md:w-8 md:h-8 text-emerald-400" strokeWidth={3} />
        </div>
        <h1 className="text-2xl md:text-4xl font-bold text-foreground leading-tight">
          {reuniao ? (
            <>
              Pronto{primeiroNome ? <>, <span className="champion-gradient-text">{primeiroNome}</span></> : null}.{" "}
              <span className="champion-gradient-text">Sua call de diagnóstico está confirmada.</span>
            </>
          ) : (
            <>
              Parabéns{primeiroNome ? <>, <span className="champion-gradient-text">{primeiroNome}</span></> : null}! Seu cadastro foi concluído.{" "}
              <span className="champion-gradient-text">Sua call de diagnóstico gratuita está a um passo.</span>
            </>
          )}
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          {reuniao
            ? "O convite com o link da chamada foi enviado para o seu e-mail. Confira também a caixa de spam."
            : "Em até 6 horas nosso time te chama no WhatsApp. É só responder a conversa pra liberar sua call e receber o plano de ação da sua operação."}
        </p>
      </div>

      {/* ── Reunião confirmada ── */}
      {reuniao && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-secondary/40 bg-secondary/[0.07] p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4 shadow-[0_0_30px_-10px_hsl(43_85%_55%/0.35)]">
          <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0 mx-auto sm:mx-0">
            <CalendarCheck className="w-6 h-6 text-secondary" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs uppercase tracking-wider text-secondary font-semibold">Sua call</p>
            <p className="text-lg md:text-xl font-bold text-foreground first-letter:uppercase">{quando}</p>
            <p className="text-sm text-muted-foreground">Horário de Brasília · {reuniao.duracao_minutos} minutos · Google Meet</p>
            {reuniao.previa && (
              <p className="text-xs text-amber-400 mt-1">Prévia local: nenhuma reunião foi criada e nenhum convite foi enviado.</p>
            )}
          </div>
          {reuniao.meet_link && (
            <Button asChild className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold rounded-xl">
              <a href={reuniao.meet_link} target="_blank" rel="noopener noreferrer">
                <Video className="w-4 h-4 mr-2" />
                Link da call
              </a>
            </Button>
          )}
        </div>
      )}

      {/* ── Progresso ── */}
      <div className="max-w-2xl mx-auto bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">Progresso: {progresso}%</span>
          <span className="text-muted-foreground text-xs">Etapa {reuniao ? 2 : 1} de 3</span>
        </div>
        <Progress value={progresso} className="h-3 bg-muted/40 [&>div]:bg-gradient-to-r [&>div]:from-secondary [&>div]:to-champion-gold" />
        <p className="text-xs text-muted-foreground">100% = você na call de diagnóstico com o plano de ação definido.</p>
      </div>

      {/* ── Etapas + o que você leva ── */}
      <div className="grid gap-4 md:gap-6 md:grid-cols-5">
        <section className="md:col-span-3 bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-5">O que acontece agora</h2>
          {etapas.map((e, i) => {
            const s = ESTILO[e.status];
            const ultimo = i === etapas.length - 1;
            return (
              <div key={e.titulo} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 ${s.ring} ${s.bg}`}>
                    <e.Icon className={`w-5 h-5 ${s.icon}`} />
                  </div>
                  {!ultimo && <div className={`w-0.5 flex-1 my-1.5 rounded-full ${s.line}`} />}
                </div>
                <div className={ultimo ? "pb-0" : "pb-6"}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold leading-snug text-foreground">
                      {i + 1}) {e.titulo}
                    </h3>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${s.badge}`}>{s.rotulo}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{e.texto}</p>
                </div>
              </div>
            );
          })}
          <div className="mt-5 flex gap-2 items-start rounded-xl border border-secondary/25 bg-secondary/[0.06] p-3 text-xs sm:text-sm text-muted-foreground">
            <Clock className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
            <span>
              {reuniao
                ? "Entre pelo link do convite uns minutos antes. Se precisar remarcar, é só falar com o nosso time no WhatsApp."
                : "Deixe o WhatsApp por perto: responder rápido garante o seu horário."}
            </span>
          </div>
        </section>

        <section className="md:col-span-2 bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-5">O que você leva da call</h2>
          <ul className="space-y-4">
            {GANHOS.map((g) => (
              <li key={g.titulo} className="flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary/10 border border-secondary/25 flex items-center justify-center shrink-0">
                  <g.icon className="w-4 h-4 text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{g.titulo}</p>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{g.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── Prova ── */}
      {/* Mesma seção de cases da página principal (CasesSucesso). Um componente
          só: o que mudar nos cases (src/config/casesSucesso.ts) muda nas duas. */}
      <section className="-mx-4 md:-mx-8">
        <CasesSucesso />
      </section>
    </div>
  );
}
