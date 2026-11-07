import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarX, Check, ChevronLeft, ChevronRight, Clock, Globe, Loader2, RefreshCw, Video } from "lucide-react";
import { dispararConversaoDoLead } from "@/lib/conversaoPixel";
import { eventIdsForLead } from "@/lib/metaTracking";
import {
  PREVIA_LEAD_PREFIX,
  buscarSlots,
  faixaPermiteAgendamento,
  reservarHorario,
  rotuloDia,
  rotuloReuniao,
  salvarReuniaoConfirmada,
  type DiaApi,
  type ReuniaoConfirmada,
} from "@/lib/agendamento";

/**
 * /agendar (17/09/2026): o lead com faturamento >= R$ 100 mil escolhe o horário
 * da call de diagnóstico antes do obrigado.
 *
 * Chega aqui com navegação completa a partir do formulário do topo
 * (HeroLeadForm), com o lead JÁ gravado. Fechar a página sem agendar não perde
 * nada: ele segue como lead normal na fila do time.
 *
 * Sem avanço automático: tocar num horário só seleciona; quem reserva é o botão.
 *
 * Prévia local (só em dev): /agendar?previa=1 cria um lead fictício neste
 * navegador e simula horários e reserva. Com lead real em dev, a prévia só
 * entra se a função `agendamento` não responder (ainda não publicada).
 */

const RESULT_STORAGE_KEY = "champion_quiz_result";
const FAIXA_PREVIA = "De R$ 100 mil a R$ 150 mil";

interface LeadLocal {
  id: string;
  nome: string;
  faixa: string;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "vazio"; previa: boolean }
  | { fase: "pronto"; dias: DiaApi[]; duracao: number; previa: boolean };

// ── Calendário (só apresentação) ────────────────────────────────────────────

const FUSO_BRASILIA = "America/Sao_Paulo";
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09-17" de hoje no horário de Brasília. */
function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_BRASILIA, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
}

/** "2026-09" */
const chaveMes = (dataIso: string) => dataIso.slice(0, 7);

function somarMes(chave: string, delta: number): string {
  const [a, m] = chave.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Células do mês começando no domingo; null = espaço antes do dia 1. */
function celulasDoMes(chave: string): (string | null)[] {
  const [a, m] = chave.split("-").map(Number);
  const primeiroDiaSemana = new Date(Date.UTC(a, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const celulas: (string | null)[] = Array(primeiroDiaSemana).fill(null);
  for (let d = 1; d <= total; d++) celulas.push(`${chave}-${String(d).padStart(2, "0")}`);
  return celulas;
}

/** As células do mês em linhas de 7 (a última pode ser mais curta). */
function semanasDoMes(chave: string): (string | null)[][] {
  const celulas = celulasDoMes(chave);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

/** { semana: "qui", dia: "18" } */
function partesDoDia(dataIso: string) {
  const [a, m, d] = dataIso.split("-").map(Number);
  return { semana: SEMANA_CURTA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()], dia: String(d) };
}

const ANIMACAO_ENTRADA = `
@keyframes agendar-entrada { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.agendar-entrada { animation: agendar-entrada 0.5s cubic-bezier(.16,1,.3,1) both; }
@media (prefers-reduced-motion: reduce) { .agendar-entrada { animation: none; } }
`;

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

/** Lead deste navegador, ou o fictício da prévia (só dev). */
function carregarLead(previaPedida: boolean): LeadLocal | null {
  if (import.meta.env.DEV && previaPedida) {
    // Reaproveita o id fictício já gravado: o StrictMode do dev executa este
    // cálculo duas vezes, e dois ids diferentes desencontrariam as chaves.
    let id = "";
    try { id = localStorage.getItem("champion_lead_id") || ""; } catch { /* ignore */ }
    if (!id.startsWith(PREVIA_LEAD_PREFIX)) id = `${PREVIA_LEAD_PREFIX}${crypto.randomUUID()}`;
    try {
      localStorage.setItem("champion_lead_id", id);
      localStorage.setItem("champion_event_ids", JSON.stringify({
        lead_id: id,
        event_ids: eventIdsForLead(id),
        timestamp: Math.floor(Date.now() / 1000),
      }));
      localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({
        nome_completo: "Lead de Teste",
        whatsapp: "",
        instagram: "",
        email: "",
        mercado: "",
        operacoes_ativas: null,
        investimento_faixa: FAIXA_PREVIA,
        dor_desejo: "",
      }));
    } catch { /* ignore */ }
    return { id, nome: "Lead de Teste", faixa: FAIXA_PREVIA };
  }
  try {
    const id = localStorage.getItem("champion_lead_id");
    const r = JSON.parse(localStorage.getItem(RESULT_STORAGE_KEY) || "null");
    if (!id || !r) return null;
    return { id, nome: String(r.nome_completo || ""), faixa: String(r.investimento_faixa || "") };
  } catch {
    return null;
  }
}

export default function Agendar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const lead = useMemo(() => carregarLead(params.get("previa") === "1"), [params]);

  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const pixelDisparado = useRef(false);

  const concluir = useCallback((reuniao: ReuniaoConfirmada | null) => {
    if (reuniao) salvarReuniaoConfirmada(reuniao);
    navigate("/obrigadomql", { replace: true });
  }, [navigate]);

  // Sem lead neste navegador: não há o que agendar. Faixa abaixo de R$ 100 mil:
  // o destino dela é o obrigado direto.
  useEffect(() => {
    if (!lead) navigate("/", { replace: true });
    else if (!faixaPermiteAgendamento(lead.faixa)) navigate("/obrigadomql", { replace: true });
  }, [lead, navigate]);

  // Conversão do pixel aqui, e não só no obrigado: quem fecha a aba sem agendar
  // não pode perder o sinal do navegador. /obrigadomql não repete.
  useEffect(() => {
    if (!lead || pixelDisparado.current) return;
    if (dispararConversaoDoLead(lead.faixa, "/agendar")) pixelDisparado.current = true;
  }, [lead]);

  const carregar = useCallback(async () => {
    if (!lead) return;
    setEstado({ fase: "carregando" });
    const r = await buscarSlots(lead.id);
    if (r.tipo === "ja_agendado") return concluir(r.reuniao);
    if (r.tipo === "erro") return setEstado({ fase: "erro", mensagem: r.mensagem });
    const dias = r.dias.filter((d) => d.slots.length > 0);
    if (!dias.length) return setEstado({ fase: "vazio", previa: r.previa });
    setEstado({ fase: "pronto", dias, duracao: r.duracao_minutos, previa: r.previa });
  }, [lead, concluir]);

  useEffect(() => {
    if (lead && faixaPermiteAgendamento(lead.faixa)) void carregar();
  }, [lead, carregar]);

  const confirmar = async () => {
    if (!lead || !selecionado || confirmando) return;
    setConfirmando(true);
    setAviso(null);
    const r = await reservarHorario(lead.id, selecionado);
    if (r.tipo === "ok") return concluir(r.reuniao);
    if (r.tipo === "ja_agendado") return concluir(r.reuniao);
    setConfirmando(false);
    if (r.tipo === "ocupado") {
      setSelecionado(null);
      setAviso("Esse horário acabou de ser reservado por outra pessoa. Escolha outro.");
      void carregar();
      return;
    }
    setAviso(`${r.mensagem} Tente de novo em instantes.`);
  };

  // Dia e mês exibidos. Ao (re)carregar, abre no primeiro dia com horário,
  // a menos que o dia já escolhido continue na lista.
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [mesVisivel, setMesVisivel] = useState<string | null>(null);
  const horariosRef = useRef<HTMLDivElement>(null);
  const dias = estado.fase === "pronto" ? estado.dias : null;

  useEffect(() => {
    if (!dias?.length) return;
    setDiaSelecionado((atual) => {
      const dia = atual && dias.some((d) => d.data === atual) ? atual : dias[0].data;
      setMesVisivel(chaveMes(dia));
      return dia;
    });
  }, [dias]);

  const escolherDia = (data: string) => {
    if (data !== diaSelecionado) setSelecionado(null);
    setDiaSelecionado(data);
    setAviso(null);
    // Celular: os horários ficam abaixo do calendário; traz para a vista.
    if (typeof window !== "undefined" && window.innerWidth < 1024 && horariosRef.current) {
      const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      horariosRef.current.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "nearest" });
    }
  };

  if (!lead || !faixaPermiteAgendamento(lead.faixa)) return null;

  const primeiroNome = lead.nome.split(" ")[0] || "";
  const previa = (estado.fase === "pronto" || estado.fase === "vazio") && estado.previa;

  const duracao = estado.fase === "pronto" ? estado.duracao : 45;
  const hoje = hojeEmBrasilia();
  const diaAtual = dias?.find((d) => d.data === diaSelecionado) ?? null;
  const comHorario = new Set(dias?.map((d) => d.data) ?? []);
  const mesMin = dias?.length ? chaveMes(dias[0].data) : null;
  const mesMax = dias?.length ? chaveMes(dias[dias.length - 1].data) : null;
  const mes = mesVisivel ?? mesMin ?? chaveMes(hoje);
  const [anoMes, numMes] = mes.split("-").map(Number);
  const botaoOuro = "rounded-md bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 transition-colors hover:bg-secondary/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground";

  const info = (
    <div className="p-5 sm:p-6 lg:p-7 flex flex-col gap-4 lg:gap-5">
      <div className="flex items-center justify-between gap-3">
        <img src="/champion-logo.webp" alt="Champion" className="h-6 lg:h-7 w-auto" loading="eager" />
        <span className={`${ROTULO} inline-flex items-center gap-1.5`}>
          <Check className="w-3 h-3 text-emerald-400" strokeWidth={3} />
          Aplicação recebida
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {primeiroNome ? `${primeiroNome}, escolha o horário da sua` : "Escolha o horário da sua"}
        </p>
        <h1 className="font-display text-[28px] lg:text-[34px] font-semibold uppercase leading-[1.05] tracking-[0.01em] text-foreground">
          Call de diagnóstico
        </h1>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-3 text-sm text-foreground/90">
        <li className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono">{duracao} min</span>
        </li>
        <li className="flex items-center gap-2">
          <Video className="w-4 h-4 text-muted-foreground" />
          Google Meet
        </li>
        <li className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          Horário de Brasília
        </li>
      </ul>
      <p className="hidden sm:block text-[13px] leading-relaxed text-muted-foreground lg:pt-5 lg:border-t lg:border-white/10">
        Gratuita, com o time da Champion. O convite chega no seu e-mail assim que você confirmar.
      </p>
    </div>
  );

  const calendario = (
    <div className="p-5 sm:p-6 lg:p-7">
      <div className="flex items-center justify-between mb-4">
        <p className="text-base font-semibold text-foreground">
          <span className="first-letter:uppercase inline-block">{MESES[numMes - 1]}</span>{" "}
          <span className="font-mono font-normal text-muted-foreground">{anoMes}</span>
        </p>
        <div className="flex gap-1">
          {[
            { delta: -1, Icone: ChevronLeft, rotulo: "Mês anterior", bloqueado: !mesMin || mes <= mesMin },
            { delta: 1, Icone: ChevronRight, rotulo: "Próximo mês", bloqueado: !mesMax || mes >= mesMax },
          ].map(({ delta, Icone, rotulo, bloqueado }) => (
            <button
              key={delta}
              type="button"
              aria-label={rotulo}
              disabled={bloqueado}
              onClick={() => setMesVisivel(somarMes(mes, delta))}
              className="w-8 h-8 grid place-items-center rounded-md border border-white/10 text-foreground transition-colors hover:border-white/30 disabled:opacity-30 disabled:hover:border-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
            >
              <Icone className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 border-b border-white/10 pb-2 mb-2">
        {SEMANA_CURTA.map((s) => (
          <span key={s} className={`${ROTULO} text-center text-[10px]`}>{s}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {semanasDoMes(mes).map((semana, s) => {
          // Celular: semana que já passou inteira some, para os horários subirem.
          const passada = semana.every((d) => !d || d < hoje);
          return (
            <div key={s} className={passada ? "hidden lg:contents" : "contents"}>
              {semana.map((data, i) => {
          if (!data) return <span key={`v${i}`} />;
          const livre = comHorario.has(data);
          const ativo = data === diaSelecionado;
          const ehHoje = data === hoje;
          return (
            <button
              key={data}
              type="button"
              disabled={!livre || confirmando}
              aria-pressed={ativo}
              aria-label={`${rotuloDia(data)}${livre ? "" : ", sem horários"}`}
              onClick={() => escolherDia(data)}
              className={
                "relative h-10 sm:h-11 lg:h-auto lg:aspect-square rounded-md font-mono text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground " +
                (ativo
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : livre
                    ? "bg-white/[0.07] border border-white/10 text-foreground font-semibold hover:border-white/40"
                    : "text-muted-foreground/35 cursor-default")
              }
            >
              {Number(data.slice(8))}
              {ehHoje && (
                <span
                  aria-hidden
                  className={`absolute left-1/2 -translate-x-1/2 bottom-1 w-1 h-1 rounded-full ${ativo ? "bg-secondary-foreground" : "bg-foreground/70"}`}
                />
              )}
            </button>
          );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  const horarios = diaAtual && (
    <div ref={horariosRef} className="p-5 sm:p-6 lg:p-6 scroll-mt-4">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-base font-semibold text-foreground">
          {partesDoDia(diaAtual.data).semana}{" "}
          <span className="font-mono">{partesDoDia(diaAtual.data).dia}</span>
        </p>
        <span className={ROTULO}>
          {diaAtual.slots.length} {diaAtual.slots.length === 1 ? "horário" : "horários"}
        </span>
      </div>
      {aviso && (
        <p role="alert" className="mb-3 flex gap-1.5 items-start text-[13px] text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{aviso}</span>
        </p>
      )}
      <div className="flex flex-col gap-2">
        {diaAtual.slots.map((s) => {
          const ativo = selecionado === s.inicio;
          return (
            <div key={s.inicio} className="flex gap-2">
              <button
                type="button"
                aria-pressed={ativo}
                disabled={confirmando}
                onClick={() => { setSelecionado(ativo ? null : s.inicio); setAviso(null); }}
                className={
                  "h-11 rounded-md border font-mono text-sm tabular-nums transition-[width,border-color,background-color] duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground disabled:opacity-60 " +
                  (ativo
                    ? "w-1/2 border-white/25 bg-white/[0.08] text-foreground"
                    : "w-full border-white/15 text-foreground hover:border-white/50")
                }
              >
                {s.hora}
              </button>
              {ativo && (
                <button
                  type="button"
                  onClick={() => void confirmar()}
                  disabled={confirmando}
                  className={`w-1/2 h-11 ${botaoOuro} disabled:opacity-70`}
                >
                  {confirmando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Confirmando
                    </>
                  ) : (
                    "Confirmar"
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground min-h-[18px]">
        {selecionado ? (
          <span className="first-letter:uppercase inline-block">{rotuloReuniao(selecionado)}</span>
        ) : (
          "Toque em um horário para escolher."
        )}
      </p>
    </div>
  );

  const aoLado = (conteudo: ReactNode) => (
    <div className="lg:col-span-2 p-6 lg:p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[240px] lg:min-h-[440px]">
      {conteudo}
    </div>
  );

  return (
    <div className="min-h-[100svh] w-full max-w-full overflow-x-hidden bg-background text-foreground">
      <style>{ANIMACAO_ENTRADA}</style>
      <main
        className="px-3 sm:px-6 pt-3 sm:pt-10 lg:py-10 lg:min-h-[100svh] lg:flex lg:flex-col lg:justify-center"
        style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}
      >
        <div className="agendar-entrada mx-auto w-full max-w-[1080px] space-y-3">
          {previa && (
            <div className="flex gap-2 items-start rounded-md border border-amber-500/30 px-3 py-2 text-xs text-amber-300/90">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Prévia local.</strong> Horários de exemplo gerados pela grade do Caio (com uma call fictícia amanhã às 14:00 e um bloqueio de agenda depois de amanhã de manhã). Nada é gravado e nenhum convite é enviado.
              </span>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.015] grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_280px] divide-y lg:divide-y-0 lg:divide-x divide-white/10">
            {info}

            {estado.fase === "carregando" && aoLado(
              <>
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className={ROTULO}>Carregando os horários livres</p>
              </>,
            )}

            {estado.fase === "erro" && aoLado(
              <>
                <AlertTriangle className="w-6 h-6 text-amber-400" />
                <div className="space-y-1 max-w-sm">
                  <p className="font-semibold text-foreground">{estado.mensagem}</p>
                  <p className="text-sm text-muted-foreground">Sua aplicação já foi recebida. Se preferir, nosso time te chama no WhatsApp para combinar o horário.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <button type="button" onClick={() => void carregar()} className={`h-11 px-5 ${botaoOuro}`}>
                    <RefreshCw className="w-4 h-4" />
                    Tentar de novo
                  </button>
                  <button
                    type="button"
                    onClick={() => concluir(null)}
                    className="h-11 px-5 rounded-md border border-white/15 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:border-white/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                  >
                    Combinar pelo WhatsApp
                  </button>
                </div>
              </>,
            )}

            {estado.fase === "vazio" && aoLado(
              <>
                <CalendarX className="w-6 h-6 text-muted-foreground" />
                <div className="space-y-1 max-w-sm">
                  <p className="font-semibold text-foreground">A agenda dos próximos dias está completa.</p>
                  <p className="text-sm text-muted-foreground">Sua aplicação já foi recebida. Nosso time te chama no WhatsApp para encontrar um horário com você.</p>
                </div>
                <button type="button" onClick={() => concluir(null)} className={`h-11 px-6 ${botaoOuro}`}>
                  Continuar
                </button>
              </>,
            )}

            {estado.fase === "pronto" && (
              <>
                {calendario}
                {horarios}
              </>
            )}
          </div>

          {estado.fase === "pronto" && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => concluir(null)}
                className="text-[13px] text-muted-foreground underline underline-offset-4 decoration-white/20 hover:text-foreground"
              >
                Nenhum horário serve? Nosso time te chama no WhatsApp
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
