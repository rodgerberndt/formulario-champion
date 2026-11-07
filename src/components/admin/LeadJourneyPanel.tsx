import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Eye, MousePointerClick, Repeat } from "lucide-react";
import { HEADLINE_VARIANTS } from "@/config/headlineVariants";
import { SUBHEADLINE_VARIANTS, entryPageMeaning } from "@/config/subheadlineVariants";
import { LANDING_SECTIONS, sectionLabel } from "@/config/landingSections";

// ─────────────────────────────────────────────────────────────────────────────
// Jornada do lead — o comportamento que antecede o formulário.
//
// Responde quatro perguntas que as respostas do quiz não respondem: de qual
// headline a pessoa veio, quanto tempo leu antes de clicar, quanto tempo levou
// no quiz e quantas vezes já tinha visitado o site antes.
//
// A estrutura da página vem de LANDING_SECTIONS, a mesma lista do funil por
// seção em Métricas Funil — ordem da página, todas as seções, sem duplicata.
//
// O casamento entre lead e sessão é feito no backend (lead_journey.ts) por
// cookie de navegador, IP e proximidade de tempo, nessa ordem. Quando o
// casamento é fraco — IP de operadora, por exemplo — a tela diz isso em vez de
// apresentar o número como se fosse certo.
// ─────────────────────────────────────────────────────────────────────────────

interface Journey {
  matched: boolean;
  match_method: "submit" | "fbp" | "ip" | "nenhum";
  ip_shared_risk: boolean;
  reason?: string;
  session?: {
    id: string;
    started_at: string;
    device: string | null;
    headline_path: string | null;
    utm_content: string | null;
    entered_quiz: boolean;
    completed: boolean;
  };
  landing?: {
    first_view_at: string | null;
    click_at: string | null;
    seconds_to_click: number | null;
    time_on_landing_ms: number | null;
    raw_time_ms: number | null;
    returned_after_click: boolean;
    sections: Array<{ section_id: string; order: number; time_ms: number; raw_ms: number; after_click: boolean }>;
  };
  quiz?: {
    entered_at: string | null;
    submitted_at: string | null;
    seconds_in_quiz: number | null;
    completed: boolean;
    last_step: string | null;
    steps: Array<{ step_id: string; seconds: number | null }>;
  };
  history?: {
    total_sessions: number;
    previous_sessions: number;
    first_seen_at: string | null;
    days_since_first_visit: number | null;
    previous: Array<{ created_at: string; page: string | null; entered_quiz: boolean; completed: boolean }>;
  };
}

interface Props {
  leadId: string;
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

const STEP_LABELS: Record<string, string> = {
  q1_quer_vender: "1. Quer vender",
  q2_mercado: "2. Mercado",
  q3_operacoes: "3. Operações ativas",
  q4_faturamento: "4. Faturamento total",
  q5_nome: "5. Nome",
  q6_whats: "6. WhatsApp",
  q7_insta: "7. Instagram",
  q8_email: "8. E-mail",
  q9_dor: "9. Dor / desejo",
  q10_nps: "10. Entendimento do site",
  q11_aceita_call: "11. Aceita call",
  // O compromisso no WhatsApp virou pergunta em 25/08/2026 e empurrou o
  // resultado para o passo 13. Sem estas duas linhas o passo 12 aparecia com o
  // rótulo errado ("Resultado") e o 13 aparecia com o id cru na tela.
  q12_compromisso_whats: "12. Compromisso no WhatsApp",
  q13_loading: "13. Resultado",
  // Rótulo do quiz anterior, quando o resultado era o passo 12.
  q12_loading: "12. Resultado (quiz anterior)",
};

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return "—";
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}min ${s}s` : `${m}min`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function headlineLabel(path: string | null | undefined): string {
  if (!path) return "Não identificada";
  // O label da variante já começa com o slug ("HD3 · 3MI em 1 mês"), então
  // prefixar o path de novo duplicaria o nome.
  return HEADLINE_VARIANTS.find((v) => v.path === path)?.label
    || SUBHEADLINE_VARIANTS.find((v) => v.path === path)?.label
    || path;
}

export default function LeadJourneyPanel({ leadId, fetchAdminData }: Props) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setJourney(null);
    (async () => {
      try {
        const data = await fetchAdminData("/lead-journey", { lead_id: leadId });
        if (alive) setJourney(data);
      } catch {
        if (alive) setJourney({ matched: false, match_method: "nenhum", ip_shared_risk: false, reason: "Erro ao carregar a jornada." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [leadId, fetchAdminData]);

  if (loading) {
    return (
      <div className="p-4 bg-muted/20 rounded-lg border border-border/50 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Reconstruindo a jornada...
      </div>
    );
  }

  if (!journey?.matched) {
    return (
      <div className="p-4 bg-muted/20 rounded-lg border border-border/50">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Comportamento no site</p>
        <p className="text-sm text-muted-foreground">{journey?.reason || "Não foi possível ligar este lead a uma sessão de navegação."}</p>
      </div>
    );
  }

  const { session, landing, quiz, history } = journey;
  const readSeconds = landing?.time_on_landing_ms ? landing.time_on_landing_ms / 1000 : null;

  // Todas as seções da página, na ordem da página — inclusive as que a pessoa
  // não chegou a ver. É o mesmo critério do funil por seção: seção sem registro
  // é informação (ele não chegou lá), não motivo para sumir da lista.
  const byId = new Map((landing?.sections || []).map((s) => [s.section_id, s]));
  const extras = (landing?.sections || []).filter((s) => !LANDING_SECTIONS.some((c) => c.id === s.section_id));
  const rows = [
    ...LANDING_SECTIONS.map((c) => ({
      section_id: c.id,
      time_ms: byId.get(c.id)?.time_ms ?? 0,
      after_click: byId.get(c.id)?.after_click ?? false,
      seen: byId.has(c.id),
    })),
    ...extras.map((s) => ({ section_id: s.section_id, time_ms: s.time_ms, after_click: s.after_click, seen: true })),
  ];
  const maxTime = Math.max(1, ...rows.map((r) => r.time_ms));

  return (
    <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 rounded-lg border border-cyan-500/30 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" /> Comportamento no site
        </p>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`text-[9px] px-1.5 py-0 ${journey.match_method === "submit" ? "border-emerald-500/40 text-emerald-300" : "border-cyan-500/40 text-cyan-300"}`}
          >
            {journey.match_method === "submit"
              ? "envio casado no mesmo segundo"
              : `casado por ${journey.match_method === "fbp" ? "navegador" : "IP"}`}
          </Badge>
          {journey.ip_shared_risk && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/40 text-amber-400">
              IP possivelmente compartilhado
            </Badge>
          )}
        </div>
      </div>

      {/* Página de origem: em /HDx o que varia é a headline; em /SHx a headline
          é fixa e o que varia é a subheadline. */}
      {(() => {
        const meaning = entryPageMeaning(session?.headline_path);
        return (
          <div className="p-3 bg-background/50 rounded-lg">
            <p className="text-muted-foreground text-[10px] uppercase mb-1">
              {meaning.role === "subheadline" ? "Subheadline de entrada" : "Headline de entrada"}
            </p>
            <p className="font-semibold text-cyan-400 text-lg">{headlineLabel(session?.headline_path)}</p>
            {meaning.fixedPart && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">{meaning.fixedPart}</p>
            )}
          </div>
        );
      })()}

      {/* Os tempos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 bg-background/40 rounded-lg">
          <p className="text-muted-foreground text-[10px] uppercase flex items-center gap-1">
            <MousePointerClick className="w-3 h-3" /> Tempo na página
          </p>
          <p className="font-bold text-lg">{fmtDuration(readSeconds)}</p>
          <p className="text-[10px] text-muted-foreground/70">lendo, até sair para o quiz</p>
        </div>
        <div className="p-3 bg-background/40 rounded-lg">
          <p className="text-muted-foreground text-[10px] uppercase">Página + quiz</p>
          <p className="font-bold text-lg">{fmtDuration((readSeconds || 0) + (quiz?.seconds_in_quiz || 0))}</p>
          <p className="text-[10px] text-muted-foreground/70">do primeiro clique ao envio</p>
        </div>
        <div className="p-3 bg-background/40 rounded-lg">
          <p className="text-muted-foreground text-[10px] uppercase flex items-center gap-1">
            <Clock className="w-3 h-3" /> Tempo no quiz
          </p>
          <p className="font-bold text-lg">{fmtDuration(quiz?.seconds_in_quiz)}</p>
          <p className="text-[10px] text-muted-foreground/70">
            {quiz?.completed ? "até enviar" : `parou em ${quiz?.last_step ? (STEP_LABELS[quiz.last_step] || quiz.last_step) : "—"}`}
          </p>
        </div>
        <div className="p-3 bg-background/40 rounded-lg">
          <p className="text-muted-foreground text-[10px] uppercase flex items-center gap-1">
            <Repeat className="w-3 h-3" /> Visitas anteriores
          </p>
          <p className="font-bold text-lg">{history?.previous_sessions ?? 0}</p>
          <p className="text-[10px] text-muted-foreground/70">
            {history?.previous_sessions
              ? `1ª vez há ${history.days_since_first_visit} dia${history.days_since_first_visit === 1 ? "" : "s"}`
              : "converteu na 1ª visita"}
          </p>
        </div>
      </div>

      {/* Estrutura da página, na ordem real */}
      <div className="p-3 bg-background/30 rounded-lg">
        <p className="text-muted-foreground text-[10px] uppercase mb-2">Leitura por seção, na ordem da página</p>
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.section_id} className="flex items-center gap-2">
              <span className={`text-[11px] w-32 shrink-0 truncate ${r.time_ms > 0 ? "" : "text-muted-foreground/50"}`}>
                {sectionLabel(r.section_id)}
              </span>
              <div className="flex-1 h-2 bg-muted/40 rounded overflow-hidden">
                {r.time_ms > 0 && (
                  <div className="h-full bg-cyan-500/60" style={{ width: `${Math.max(2, (r.time_ms / maxTime) * 100)}%` }} />
                )}
              </div>
              <span className="text-[11px] text-muted-foreground w-16 text-right">
                {r.time_ms > 0 ? fmtDuration(r.time_ms / 1000) : r.after_click ? "após o clique" : "não chegou"}
              </span>
            </div>
          ))}
        </div>
        {landing?.returned_after_click && (
          <p className="text-[10px] text-amber-300/80 mt-2">
            Ele voltou à página depois de clicar: o CTA abre o quiz em outra aba e a landing continua
            aberta atrás. As seções marcadas assim foram vistas depois, e não contam como leitura
            antes do clique.
          </p>
        )}
      </div>

      {/* Tempo por pergunta */}
      {quiz?.steps && quiz.steps.length > 0 && (
        <div className="p-3 bg-background/30 rounded-lg">
          <button
            className="text-muted-foreground text-[10px] uppercase hover:text-foreground transition-colors"
            onClick={() => setShowSteps((v) => !v)}
          >
            Tempo em cada pergunta {showSteps ? "▲" : "▼"}
          </button>
          {showSteps && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {quiz.steps.map((s, i) => (
                <div key={`${s.step_id}-${i}`} className="flex items-center justify-between text-[11px]">
                  <span className="truncate">{STEP_LABELS[s.step_id] || s.step_id}</span>
                  <span className="text-muted-foreground">{fmtDuration(s.seconds)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visitas anteriores */}
      {history?.previous && history.previous.length > 0 && (
        <div className="p-3 bg-background/30 rounded-lg">
          <p className="text-muted-foreground text-[10px] uppercase mb-2">
            Visitas anteriores ({history.previous_sessions})
          </p>
          <div className="space-y-1">
            {history.previous.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span>{fmtDateTime(v.created_at)}</span>
                <span className="text-muted-foreground">{v.page || "—"}</span>
                <span className={v.entered_quiz ? "text-cyan-400" : "text-muted-foreground/60"}>
                  {v.completed ? "concluiu" : v.entered_quiz ? "entrou no quiz" : "só leu"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/60">
        Sessão de {fmtDateTime(session?.started_at)}
        {session?.device ? ` · ${session.device}` : ""}
        {history?.total_sessions ? ` · ${history.total_sessions} ${history.total_sessions === 1 ? "sessão" : "sessões"} no total` : ""}
      </p>
    </div>
  );
}
