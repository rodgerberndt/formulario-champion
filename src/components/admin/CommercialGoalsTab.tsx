import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getAdminToken } from "@/lib/adminAuth";

// ─────────────────────────────────────────────────────────────────────────────
// Metas Comercial — redimensionamento por forecast
//
// O princípio da aba: NENHUMA meta é digitada. Todas saem da cascata real do
// funil aplicada sobre a verba, e cada premissa mostra de onde veio: janela de
// baseline, histórico inteiro ou chute declarado.
//
// A cascata tem DOIS caminhos, porque o negócio tem dois:
//   • ASSESSORIA — MQL → reunião → realizada → venda. Ticket alto, contrato de
//     meses, é o que carrega a receita.
//   • SPRINT — sai do lead abaixo de R$ 10 mil direto com o SDR, sem passar por
//     reunião nenhuma. Ticket baixo, à vista.
// Misturar os dois dá taxas impossíveis (oito vendas em oito reuniões) e um
// ticket médio que não corresponde a venda nenhuma.
//
// A verba se divide em duas frentes com economias diferentes:
//   • TESTE (padrão 60%) — criativo novo e teste A/B. MQL mais caro, porque
//     boa parte do que entra na esteira morre. É o que gera o aprendizado.
//   • ESCALA (padrão 40%) — só criativo já validado. MQL mais barato.
// A frente de teste é maior de propósito: o ganho de eficiência do mês seguinte
// vem dela. No modelo, o aprendizado composto só existe na proporção do que se
// investiu em teste — zerar o teste congela o custo por MQL para sempre.
// ─────────────────────────────────────────────────────────────────────────────

const COPY_SALARY = 3500;
const COPY_CAPACITY_BODIES_PER_MONTH = 250;
const EDITOR_SALARIES = [2000, 2000, 3000];
const EDITOR_CAPACITY_BODIES_PER_MONTH = 80; // por editor, sem otimização
const COPY_COST_PER_BODY = COPY_SALARY / COPY_CAPACITY_BODIES_PER_MONTH;
const EDITOR_AVG_SALARY = EDITOR_SALARIES.reduce((a, b) => a + b, 0) / EDITOR_SALARIES.length;
const EDITOR_COST_PER_BODY = EDITOR_AVG_SALARY / EDITOR_CAPACITY_BODIES_PER_MONTH;
const DELIVERY_COST_PER_BODY = COPY_COST_PER_BODY + EDITOR_COST_PER_BODY; // R$ 43,17
const HOOKS_PER_BODY = 4;
const WEEKS_PER_MONTH = 4.345;
const CLOSER_COMMISSION_RATE = 0.0625; // sobre o recebido
const MIGUEL_COMMISSION_RATE = 0.01; // sobre o TCV

interface AbTest {
  id: string;
  name: string;
  variants: number;
  scope: "pagina" | "quiz" | "conta";
  note?: string;
  confirmed?: boolean;
}

interface Assumptions {
  version: number;
  mode: "verba" | "meta";
  investment_month1: number | null; // null = usa a média mensal do baseline
  target_revenue_final: number | null; // modo meta: receita alvo (ver target_basis)
  // "periodo" = a meta é o TOTAL do plano (fechar o ano em X); "mes_final" = a
  // meta é o ritmo atingido no último mês. São perguntas diferentes e davam
  // verbas muito diferentes; o default é o total, que é como a meta anual se lê.
  target_basis: "periodo" | "mes_final";
  /**
   * Como a verba de mídia cresce mês a mês.
   *
   * "fixo" é a regra da casa desde 26/08/2026: a verba do mês é a do mês
   * anterior mais `growth_pct`. Investiu R$ 20 mil, investe R$ 24 mil no mês
   * seguinte. O tráfego sobe sempre, sem depender do resultado do mês.
   *
   * "reinvestimento" amarra a mídia a uma fatia da receita do mês anterior
   * (`reinvest_pct`). Protege o caixa, mas trava o crescimento quando um mês
   * vem fraco: receita baixa vira verba baixa, que vira receita mais baixa
   * ainda. Foi por isso que deixou de ser o padrão.
   */
  growth_mode: "reinvestimento" | "fixo";
  /** Fatia da receita do mês anterior que vira mídia no mês seguinte. */
  reinvest_pct: number;
  growth_pct: number;
  test_share: number;
  test_cpmql_factor: number;
  scale_cpmql_factor: number;
  learning_pct: number;
  learning_floor_pct: number;
  saturation_pct: number;
  cpmql_override: number | null;
  cpl_override: number | null;
  meeting_rate_override: number | null;
  show_rate_override: number | null;
  close_rate_assessoria_override: number | null;
  sprint_rate_override: number | null;
  ticket_assessoria_override: number | null;
  ticket_sprint_override: number | null;
  creatives_per_week: number;
  min_spend_per_creative: number;
  bodies_per_contract_month: number;
  contract_months: number;
  editors_count: number;
  mql_per_variant_target: number;
  fixed_cost_month: number;
  /**
   * Teto de sprints vendidos por mês. `null` desliga o limite.
   *
   * A taxa de Sprint sai do histórico e projeta em cima de TODO lead não-MQL,
   * mas o Sprint é produto de baixo ticket que ocupa a mesma esteira de
   * produção da assessoria. Sem teto, o plano projeta um volume que o time não
   * quer vender — e que ocuparia a capacidade que a assessoria paga melhor.
   */
  sprint_cap_month: number | null;
  ab_tests: AbTest[];
}

// Fila de testes do processo mensal da página, como o time escreveu no documento
// de processo. O item 5 chegou ilegível no print (o cursor cobriu o nome) e está
// marcado como não confirmado — o forecast já conta a duração dele, mas a tela
// pede a confirmação em vez de inventar um nome.
const DEFAULT_AB_TESTS: AbTest[] = [
  { id: "hl1", name: "Headlines — 5 headlines", variants: 5, scope: "pagina", confirmed: true },
  { id: "hl2", name: "Headlines — 3 modelando a vencedora + 2 de outra maneira", variants: 5, scope: "pagina", confirmed: true },
  { id: "sub", name: "Subheadline", variants: 3, scope: "pagina", confirmed: false, note: "O processo não diz quantas variantes; 3 é premissa." },
  { id: "estrut", name: "Estruturas de página — 4 estruturas", variants: 4, scope: "pagina", confirmed: true },
  { id: "item5", name: "5º teste do processo (nome ilegível no print)", variants: 4, scope: "pagina", confirmed: false, note: "Confirmar o que é: o cursor cobriu o nome no documento." },
  { id: "cta", name: "CTA — 4 variações", variants: 4, scope: "pagina", confirmed: true },
  { id: "quiz1", name: "Quiz — medo de ser clonado", variants: 2, scope: "quiz", confirmed: true },
  { id: "quiz2", name: "Quiz — trocar a 1ª pergunta (maior queda de retenção)", variants: 2, scope: "quiz", confirmed: true },
];

const DEFAULT_ASSUMPTIONS: Assumptions = {
  version: 2,
  mode: "meta",
  investment_month1: null,
  target_revenue_final: null,
  target_basis: "periodo",
  growth_mode: "fixo",
  reinvest_pct: 20,
  growth_pct: 20,
  test_share: 60,
  test_cpmql_factor: 1.35,
  scale_cpmql_factor: 0.85,
  learning_pct: 4,
  learning_floor_pct: 65,
  saturation_pct: 12,
  cpmql_override: null,
  cpl_override: null,
  meeting_rate_override: null,
  show_rate_override: null,
  close_rate_assessoria_override: null,
  sprint_rate_override: null,
  ticket_assessoria_override: null,
  ticket_sprint_override: null,
  creatives_per_week: 15,
  min_spend_per_creative: 60,
  bodies_per_contract_month: 25,
  contract_months: 6,
  editors_count: 3,
  mql_per_variant_target: 20,
  fixed_cost_month: 0,
  // 5/mês: abaixo do ritmo realizado (8/mês na média de jul e ago) de propósito
  // — o Sprint não é o produto que o time quer escalar.
  sprint_cap_month: 5,
  ab_tests: DEFAULT_AB_TESTS,
};

// Chutes de último caso: só entram quando o histórico não tem NADA para a etapa.
// Aparecem sempre marcados como chute na tela — número sem origem não vira meta.
const FALLBACKS = {
  cpmql: 200,
  cpl: 90,
  meeting_rate: 0.4,
  show_rate: 0.65,
  close_rate_assessoria: 0.5,
  sprint_per_non_mql: 0.05,
  ticket_assessoria: 20000,
  ticket_sprint: 800,
  received_share: 0.6,
};

// Campos brutos que o backend fecha por mês. Toda taxa mostrada na tabela é
// derivada destes aqui por `enrichMonth`, e não lida pronta da resposta: assim a
// linha de total e a linha do mês nunca podem divergir de conta, e a tabela não
// espera o redeploy da função para exibir coluna nova.
interface MonthRow {
  ym: string;
  label: string;
  partial: boolean;
  spend: number;
  leads: number;
  mql: number;
  meetings: number;
  meetings_attended: number;
  /** Reuniões já decididas no mês: denominador do comparecimento. */
  meetings_decided: number;
  sales: number;
  sales_sprint: number;
  sales_assessoria: number;
  revenue: number;
  revenue_assessoria: number;
  revenue_sprint?: number;
  received: number;
}


interface GoalsResponse {
  today: string;
  current_month: string;
  months: MonthRow[];
  baseline: {
    from: string;
    to: string;
    days: number;
    cost_from: string;
    cost_days: number;
    cost_totals: MonthRow;
    totals: MonthRow;
    rates: Record<string, number | null>;
    sources: Record<string, string>;
    samples: Record<string, number>;
    confidence: string;
    warnings: string[];
  };
  all_time: { totals: MonthRow; rates: Record<string, number | null> };
  committed_revenue: Array<{ ym: string; amount: number }>;
  backlog_unscheduled: number;
  contracts: Array<{
    id: string;
    notes: string | null;
    sale_type: string;
    sale_date: string;
    revenue: number;
    delivery_months: number | null;
    bodies_per_month: number;
    ends_at: string | null;
  }>;
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
}

const brl = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined || !isFinite(v)
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

const pct = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || !isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

const num = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(digits);

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// O plano vai do mês que vem até dezembro do ano corrente — a meta é fechar o
// ano, então o horizonte encolhe sozinho conforme o ano anda (em agosto são
// quatro meses: set, out, nov, dez). Em dezembro não sobra mês nenhum no ano, e
// aí o horizonte passa a ser o ano seguinte inteiro.
function horizonFromMonth(ym: string): number {
  const m = Number(ym.split("-")[1]);
  const remaining = 12 - m;
  return remaining >= 1 ? remaining : 12;
}

const MES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "setembro a dezembro de 2026" — o título do plano, sem mês hardcoded. */
function horizonLabel(currentMonth: string, months: number): string {
  const first = shiftMonth(currentMonth, 1);
  const last = shiftMonth(currentMonth, months);
  const [fy, fm] = first.split("-");
  const [ly, lm] = last.split("-");
  const start = MES_EXTENSO[Number(fm) - 1];
  const end = MES_EXTENSO[Number(lm) - 1];
  return fy === ly ? `${start} a ${end} de ${fy}` : `${start}/${fy} a ${end}/${ly}`;
}

function monthLabel(ym: string): string {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [y, m] = ym.split("-");
  return `${nomes[Number(m) - 1]}/${y.slice(2)}`;
}

type Origin = "janela" | "historico" | "premissa" | "chute";

const ORIGIN_LABEL: Record<Origin, string> = {
  janela: "janela",
  historico: "histórico",
  premissa: "premissa",
  chute: "chute",
};

const ORIGIN_CLASS: Record<Origin, string> = {
  janela: "border-green-500/40 text-green-400",
  historico: "border-amber-500/40 text-amber-400",
  premissa: "border-blue-500/40 text-blue-400",
  chute: "border-red-500/40 text-red-400",
};

interface Assumption {
  value: number;
  origin: Origin;
  sample: number;
}

interface ForecastMonth {
  ym: string;
  label: string;
  spend: number;
  spend_test: number;
  spend_scale: number;
  cpmql_test: number;
  cpmql_scale: number;
  cpmql_blended: number;
  leads: number;
  mql: number;
  meetings: number;
  attended: number;
  sales: number;
  sales_assessoria: number;
  sales_sprint: number;
  revenue: number;
  cash: number;
  committed: number;
  active_bodies: number;
  delivery_cost: number;
  pipeline_cost: number;
  commissions: number;
  total_cost: number;
  margin: number;
  cac: number;
  roas: number;
  creatives: number;
  spend_per_creative: number;
  mql_per_creative: number;
}

// Presets da janela de baseline. "Mês passado + atual" é o default porque é como
// o time fecha o negócio, e porque o registro de gasto no banco começa em julho:
// janelas longas misturam lead sem custo lançado e barateiam o MQL de mentira.
type BaselinePreset = "mes-passado" | "30" | "60" | "90" | "180" | "365";

/**
 * Janela padrão do baseline: 90 dias.
 *
 * As premissas do plano são lidas desta janela, não digitadas. Três meses é o
 * ponto em que a amostra já sustenta uma taxa de fechamento (que depende de
 * poucas reuniões por mês) sem carregar um trimestre inteiro de operação
 * antiga. Trocar aqui muda o forecast inteiro na hora — que é o objetivo.
 */
const JANELA_PADRAO: BaselinePreset = "90";

function baselineParams(preset: BaselinePreset, currentMonth: string): Record<string, string> {
  if (preset === "mes-passado") {
    return { baseline_from: `${shiftMonth(currentMonth, -1)}-01` };
  }
  return { baseline_days: preset };
}

export default function CommercialGoalsTab({ fetchAdminData }: Props) {
  const [goals, setGoals] = useState<GoalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<BaselinePreset>(JANELA_PADRAO);
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scenario, setScenario] = useState<"conservador" | "base" | "agressivo">("base");
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      // Mês civil brasileiro, só para montar o parâmetro do preset por mês.
      const localMonth = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
      const data = await fetchAdminData("/commercial-goals", {
        // O histórico pede o máximo que o backend aceita e ele corta sozinho os
        // meses anteriores ao primeiro sinal: a tabela começa onde o sistema
        // começou a ser usado, sem ninguém ter que ajustar isso na mão.
        months_back: "36",
        forecast_months: String(horizonFromMonth(localMonth)),
        ...baselineParams(preset, localMonth),
      });
      setGoals(data);
      setLoadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setLoadError(message);
      toast({ title: "Erro ao carregar o histórico comercial", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, preset]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  // ── Carregar o plano salvo ────────────────────────────────────────────
  //
  // `planoCarregado` existe para o autosave não gravar o PADRÃO por cima do que
  // estava salvo: enquanto o GET não voltou, `assumptions` ainda é o default, e
  // salvar isso apagaria as premissas do time.
  const [planoCarregado, setPlanoCarregado] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAdminData("/commercial-plan");
        if (data?.assumptions) {
          setAssumptions({ ...DEFAULT_ASSUMPTIONS, ...data.assumptions });
          setSavedAt(data.updated_at || null);
        }
      } catch {
        // Plano ainda não salvo: segue com o padrão.
      } finally {
        setPlanoCarregado(true);
      }
    })();
  }, [fetchAdminData]);

  const salvarAssumptions = useCallback(async (valor: Assumptions, silencioso: boolean) => {
    setSaving(true);
    try {
      await fetchAdminData("/commercial-plan", { _method: "POST", plan: JSON.stringify(valor) });
      setSavedAt(new Date().toISOString());
      if (!silencioso) toast({ title: "Premissas salvas" });
      return true;
    } catch {
      // O autosave avisa também: falhar em silêncio aqui é como as premissas
      // sumiam antes — a pessoa mexe, confia, e o número volta ao padrão no F5.
      toast({ title: "Erro ao salvar as premissas", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [fetchAdminData]);

  const savePlan = () => salvarAssumptions(assumptions, false);

  // ── Autosave ──────────────────────────────────────────────────────────
  //
  // A aba é para ser olhada todo dia e ter os números ajustados conforme as
  // taxas mudam. Depender de um botão significa perder o ajuste sempre que
  // alguém fecha a aba sem clicar — foi o que aconteceu: o plano no banco
  // estava três dias atrasado.
  //
  // 1,2s depois da última tecla: tempo suficiente para não gravar a cada
  // dígito de um número que ainda está sendo escrito, e curto o bastante para
  // estar salvo antes de qualquer F5.
  const primeiraComparacao = useRef(true);
  const ultimoSalvo = useRef<string>("");
  const pendente = useRef<string | null>(null);

  useEffect(() => {
    if (!planoCarregado) return;
    const serializado = JSON.stringify(assumptions);

    // Primeira passada depois do carregamento: só registra o estado atual como
    // referência. Sem isso, abrir a aba já dispararia uma gravação idêntica.
    if (primeiraComparacao.current) {
      primeiraComparacao.current = false;
      ultimoSalvo.current = serializado;
      return;
    }
    if (serializado === ultimoSalvo.current) {
      pendente.current = null;
      return;
    }

    // Há mudança ainda não gravada. Fica marcada para o envio de última hora
    // conseguir salvá-la caso a página seja fechada antes do tempo.
    pendente.current = serializado;

    const id = window.setTimeout(() => {
      ultimoSalvo.current = serializado;
      pendente.current = null;
      void salvarAssumptions(JSON.parse(serializado) as Assumptions, true);
    }, 600);
    return () => window.clearTimeout(id);
  }, [assumptions, planoCarregado, salvarAssumptions]);

  // ── Envio de última hora ──────────────────────────────────────────────
  //
  // Digitar e apertar F5 em seguida cancelava o autosave: o timeout morre com o
  // componente e a alteração se perde — exatamente a queixa de "não está
  // salvando". Aqui, ao esconder ou fechar a página, o que estiver pendente vai
  // embora imediatamente com `keepalive`, que é o único jeito de uma requisição
  // sobreviver à navegação. `pagehide` cobre o F5 e o fechar; `visibilitychange`
  // cobre trocar de aba no navegador e o mobile, onde `pagehide` nem sempre vem.
  useEffect(() => {
    const enviarPendente = () => {
      const corpo = pendente.current;
      if (!corpo) return;
      pendente.current = null;
      ultimoSalvo.current = corpo;
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/commercial-plan`
          + `?_method=POST&plan=${encodeURIComponent(corpo)}`;
        void fetch(url, {
          method: "POST",
          keepalive: true,
          headers: {
            "x-admin-token": getAdminToken() || "",
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
      } catch {
        // Sem o que fazer numa página que já está indo embora.
      }
    };

    const aoEsconder = () => { if (document.visibilityState === "hidden") enviarPendente(); };
    window.addEventListener("pagehide", enviarPendente);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("pagehide", enviarPendente);
      document.removeEventListener("visibilitychange", aoEsconder);
      enviarPendente();
    };
  }, []);

  const set = <K extends keyof Assumptions>(key: K, value: Assumptions[K]) =>
    setAssumptions((prev) => ({ ...prev, [key]: value }));

  // ── Premissas efetivas: override do time > baseline real > chute ──
  const effective = useMemo(() => {
    const rates = goals?.baseline.rates || {};
    const sources = goals?.baseline.sources || {};
    const samples = goals?.baseline.samples || {};

    const pick = (key: string, override: number | null, fallback: number, scale = 1): Assumption => {
      if (override !== null && override !== undefined && isFinite(override)) {
        return { value: override * scale, origin: "premissa", sample: 0 };
      }
      const v = rates[key];
      if (v !== null && v !== undefined && isFinite(v) && v > 0) {
        return { value: v, origin: (sources[key] === "janela" ? "janela" : "historico"), sample: samples[key] || 0 };
      }
      return { value: fallback, origin: "chute", sample: 0 };
    };

    return {
      cpmql: pick("cpmql", assumptions.cpmql_override, FALLBACKS.cpmql),
      cpl: pick("cpl", assumptions.cpl_override, FALLBACKS.cpl),
      meeting_rate: pick("meeting_rate", assumptions.meeting_rate_override, FALLBACKS.meeting_rate, 0.01),
      show_rate: pick("show_rate", assumptions.show_rate_override, FALLBACKS.show_rate, 0.01),
      close_rate_assessoria: pick("close_rate_assessoria", assumptions.close_rate_assessoria_override, FALLBACKS.close_rate_assessoria, 0.01),
      sprint_per_non_mql: pick("sprint_per_non_mql", assumptions.sprint_rate_override, FALLBACKS.sprint_per_non_mql, 0.01),
      ticket_assessoria: pick("ticket_assessoria", assumptions.ticket_assessoria_override, FALLBACKS.ticket_assessoria),
      ticket_sprint: pick("ticket_sprint", assumptions.ticket_sprint_override, FALLBACKS.ticket_sprint),
      received_share: pick("received_share", null, FALLBACKS.received_share),
    };
  }, [goals, assumptions]);

  // Ritmo atual de verba: quanto se investe por mês na janela em que HÁ registro
  // de gasto (não na janela inteira, que tem meses sem sync do Meta).
  // Quantos meses o plano cobre: do mês que vem até dezembro. Tudo que antes era
  // "6" hardcoded passa por aqui — forecast, backlog de entrega e rótulos.
  const horizonMonths = useMemo(
    () => (goals ? horizonFromMonth(goals.current_month) : 4),
    [goals],
  );
  const periodLabel = goals ? horizonLabel(goals.current_month, horizonMonths) : "";

  const baselineMonthlySpend = useMemo(() => {
    if (!goals) return 0;
    const days = Math.max(1, goals.baseline.cost_days || goals.baseline.days);
    const spend = goals.baseline.cost_totals?.spend ?? goals.baseline.totals.spend;
    return (spend / days) * 30;
  }, [goals]);

  // Bodys já contratados que continuam sendo produzidos nos próximos meses. É a
  // carga que a operação carrega antes de vender qualquer coisa nova.
  const backlogBodiesByMonth = useMemo(() => {
    const map = new Map<string, number>();
    if (!goals) return map;
    for (let i = 1; i <= horizonMonths; i++) {
      const ym = shiftMonth(goals.current_month, i);
      let bodies = 0;
      for (const c of goals.contracts) {
        if (c.sale_type !== "assessoria" || !c.ends_at || !c.bodies_per_month) continue;
        if (ym < c.ends_at) bodies += c.bodies_per_month;
      }
      map.set(ym, bodies);
    }
    return map;
  }, [goals, horizonMonths]);

  // ── A cascata. Roda para uma verba inicial qualquer, porque o modo meta a
  //    resolve por tentativa até a receita do último mês bater no alvo. ──
  const runForecast = useCallback((month1Spend: number): ForecastMonth[] => {
    if (!goals) return [];

    const scenarioFactor = scenario === "conservador"
      ? { cpmql: 1.2, close: 0.8 }
      : scenario === "agressivo"
        ? { cpmql: 0.85, close: 1.2 }
        : { cpmql: 1, close: 1 };

    const growth = assumptions.growth_pct / 100;
    const testShare = Math.min(1, Math.max(0, assumptions.test_share / 100));
    const learningPerMonth = assumptions.learning_pct / 100;
    const learningFloor = Math.min(1, Math.max(0.3, assumptions.learning_floor_pct / 100));
    const saturation = assumptions.saturation_pct / 100;
    const testIntensity = Math.min(1.5, testShare / 0.6);

    const cpmqlBase = effective.cpmql.value * scenarioFactor.cpmql;
    const cplBase = effective.cpl.value * scenarioFactor.cpmql;
    const meetingRate = effective.meeting_rate.value;
    const showRate = effective.show_rate.value;
    const closeAssessoria = effective.close_rate_assessoria.value * scenarioFactor.close;
    const sprintRate = effective.sprint_per_non_mql.value * scenarioFactor.close;
    const ticketAss = effective.ticket_assessoria.value;
    const ticketSprint = effective.ticket_sprint.value;
    const receivedShare = effective.received_share.value;

    const creativesPerMonth = assumptions.creatives_per_week * WEEKS_PER_MONTH;
    const pipelineCost = (creativesPerMonth / HOOKS_PER_BODY) * DELIVERY_COST_PER_BODY;
    const committedByMonth = new Map(goals.committed_revenue.map((c) => [c.ym, c.amount]));

    const rows: ForecastMonth[] = [];
    // Vendas de assessoria dos meses anteriores continuam consumindo produção:
    // um contrato de 6 meses pesa na entrega dos 6 meses, não só no da venda.
    const newSalesByMonth: number[] = [];

    for (let i = 0; i < horizonMonths; i++) {
      const ym = shiftMonth(goals.current_month, i + 1);
      // A verba do mês. No modo reinvestimento ela é uma fatia da receita do
      // mês anterior; no primeiro mês não há mês anterior, então vale a verba
      // inicial. Um piso na verba inicial evita que um mês fraco zere a mídia
      // e trave o plano em zero para sempre.
      const spend = assumptions.growth_mode === "reinvestimento" && i > 0
        ? Math.max(month1Spend * 0.5, (rows[i - 1]?.revenue || 0) * (assumptions.reinvest_pct / 100))
        : month1Spend * Math.pow(1 + growth, i);
      const spendTest = spend * testShare;
      const spendScale = spend - spendTest;

      const learningFactor = Math.max(learningFloor, Math.pow(1 - learningPerMonth * testIntensity, i));
      const doublings = baselineMonthlySpend > 0 ? Math.max(0, Math.log2(spend / baselineMonthlySpend)) : 0;
      const saturationFactor = Math.pow(1 + saturation, doublings);
      const efficiency = learningFactor * saturationFactor;

      const cpmqlTest = cpmqlBase * assumptions.test_cpmql_factor * efficiency;
      const cpmqlScale = cpmqlBase * assumptions.scale_cpmql_factor * efficiency;
      const mql = (cpmqlTest > 0 ? spendTest / cpmqlTest : 0) + (cpmqlScale > 0 ? spendScale / cpmqlScale : 0);
      const leads = cplBase > 0 ? spend / (cplBase * efficiency) : 0;
      const nonMql = Math.max(0, leads - mql);

      const meetings = mql * meetingRate;
      const attended = meetings * showRate;
      const salesAss = attended * closeAssessoria;
      // O teto entra aqui e não na taxa: a taxa continua sendo o número real
      // medido, e o limite fica explícito como decisão do time.
      const salesSprintBruto = nonMql * sprintRate;
      const salesSprint = assumptions.sprint_cap_month != null && assumptions.sprint_cap_month >= 0
        ? Math.min(salesSprintBruto, assumptions.sprint_cap_month)
        : salesSprintBruto;
      const sales = salesAss + salesSprint;
      const revenue = salesAss * ticketAss + salesSprint * ticketSprint;
      const committed = committedByMonth.get(ym) || 0;
      const cash = revenue * receivedShare + committed;

      newSalesByMonth.push(salesAss);
      // Produção do mês: contratos antigos ainda ativos + os vendidos dentro do
      // plano que continuam no prazo de entrega.
      let activeBodies = backlogBodiesByMonth.get(ym) || 0;
      for (let k = 0; k <= i; k++) {
        if (i - k < assumptions.contract_months) {
          activeBodies += newSalesByMonth[k] * assumptions.bodies_per_contract_month;
        }
      }
      const deliveryCost = activeBodies * DELIVERY_COST_PER_BODY;
      // Comissão do closer incide sobre o que ENTROU; a do Miguel, sobre o TCV.
      const commissions = cash * CLOSER_COMMISSION_RATE + revenue * MIGUEL_COMMISSION_RATE;
      const totalCost = spend + deliveryCost + commissions + pipelineCost + assumptions.fixed_cost_month;

      rows.push({
        ym,
        label: monthLabel(ym),
        spend,
        spend_test: spendTest,
        spend_scale: spendScale,
        cpmql_test: cpmqlTest,
        cpmql_scale: cpmqlScale,
        cpmql_blended: mql > 0 ? spend / mql : 0,
        leads,
        mql,
        meetings,
        attended,
        sales,
        sales_assessoria: salesAss,
        sales_sprint: salesSprint,
        revenue,
        cash,
        committed,
        active_bodies: activeBodies,
        delivery_cost: deliveryCost,
        pipeline_cost: pipelineCost,
        commissions,
        total_cost: totalCost,
        // ── Margem sobre o CAIXA, não sobre o TCV ──────────────────────────
        //
        // Estava `revenue - totalCost`, e por isso a margem saía MAIOR que o
        // caixa: descontava os custos do valor total do contrato, incluindo as
        // parcelas que ainda não entraram. Só que os custos são pagos agora —
        // mídia, comissão, copy e edição saem no mês, não quando a última
        // parcela cai. Contra dinheiro que ainda não chegou, qualquer margem
        // parece boa.
        //
        // Agora é o que sobra do que efetivamente entrou. Um mês pode dar
        // negativo quando a entrega dos contratos antigos pesa mais que o caixa
        // novo — e isso é informação, não defeito do cálculo.
        margin: cash - totalCost,
        cac: sales > 0 ? spend / sales : 0,
        roas: spend > 0 ? revenue / spend : 0,
        creatives: creativesPerMonth,
        spend_per_creative: creativesPerMonth > 0 ? spendTest / creativesPerMonth : 0,
        mql_per_creative: creativesPerMonth > 0 && cpmqlTest > 0 ? spendTest / cpmqlTest / creativesPerMonth : 0,
      });
    }
    return rows;
  }, [goals, assumptions, effective, baselineMonthlySpend, scenario, backlogBodiesByMonth, horizonMonths]);

  // Modo meta: resolve por bisseção a verba do 1º mês que faz a meta bater. A
  // verba deixa de ser premissa e vira consequência da meta — que é a pergunta
  // certa quando se quer escalar, e não manter o ritmo.
  //
  // O alvo é o ACUMULADO do período por padrão (`target_basis: "periodo"`),
  // porque "fechar o ano em X" é soma de quatro meses, não o ritmo de dezembro.
  // Resolver pelo último mês pedia menos da metade da verba para a mesma frase.
  const solvedMonth1Spend = useMemo(() => {
    const manual = assumptions.investment_month1 && assumptions.investment_month1 > 0
      ? assumptions.investment_month1
      : baselineMonthlySpend;
    if (assumptions.mode !== "meta" || !assumptions.target_revenue_final || !goals) return manual;

    const target = assumptions.target_revenue_final;
    // A meta é de CAIXA — o que entra na conta (entrada + primeira parcela),
    // não o valor total do contrato. Como o caixa fica em torno de 68% do TCV,
    // a mesma meta em caixa exige quase 50% mais volume que em TCV. É uma meta
    // mais dura e é a que paga a conta no fim do mês.
    const achieved = (rows: ForecastMonth[]): number =>
      assumptions.target_basis === "mes_final"
        ? (rows[rows.length - 1]?.cash ?? 0)
        : rows.reduce((sum, r) => sum + r.cash, 0);

    let lo = 100;
    let hi = 2_000_000;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const rows = runForecast(mid);
      if (!rows.length) break;
      if (achieved(rows) < target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }, [assumptions.mode, assumptions.target_revenue_final, assumptions.target_basis, assumptions.investment_month1, baselineMonthlySpend, goals, runForecast]);

  const forecast = useMemo(() => runForecast(solvedMonth1Spend), [runForecast, solvedMonth1Spend]);

  const totals = useMemo(() => {
    const sum = (fn: (m: ForecastMonth) => number) => forecast.reduce((s, m) => s + fn(m), 0);
    return {
      spend: sum((m) => m.spend),
      mql: sum((m) => m.mql),
      meetings: sum((m) => m.attended),
      sales: sum((m) => m.sales),
      sales_assessoria: sum((m) => m.sales_assessoria),
      revenue: sum((m) => m.revenue),
      cash: sum((m) => m.cash),
      margin: sum((m) => m.margin),
    };
  }, [forecast]);

  // Teto de produção: o que a equipe atual entrega por mês. O editor é o gargalo
  // (80 bodys/mês contra 250 do copy), e é ele que limita a meta antes da verba.
  const editorCapacity = assumptions.editors_count * EDITOR_CAPACITY_BODIES_PER_MONTH;
  const capacityCeiling = Math.min(editorCapacity, COPY_CAPACITY_BODIES_PER_MONTH);
  const capacityBreach = forecast.find((m) => m.active_bodies > capacityCeiling);

  // ── Fila de testes A/B: quanto tempo cada um leva no volume projetado ──
  const testPlan = useMemo(() => {
    if (!forecast.length) return [];
    const dailyMql = forecast.map((m) => m.mql / 30);
    const target = Math.max(1, assumptions.mql_per_variant_target);

    const runQueue = (tests: AbTest[]) => {
      let dayCursor = 0;
      return tests.map((t) => {
        const needed = t.variants * target;
        let acc = 0;
        let days = 0;
        while (acc < needed && dayCursor + days < 180) {
          const monthIndex = Math.min(forecast.length - 1, Math.floor((dayCursor + days) / 30));
          acc += dailyMql[monthIndex];
          days += 1;
        }
        const start = dayCursor;
        const fits = acc >= needed;
        dayCursor += days;
        return { test: t, needed, days, start, end: start + days, fits };
      });
    };

    const pageQueue = runQueue(assumptions.ab_tests.filter((t) => t.scope === "pagina"));
    const otherQueue = runQueue(assumptions.ab_tests.filter((t) => t.scope !== "pagina"));
    return [...pageQueue, ...otherQueue];
  }, [forecast, assumptions.ab_tests, assumptions.mql_per_variant_target]);

  const pageTestsMonths = useMemo(() => {
    const page = testPlan.filter((t) => t.test.scope === "pagina");
    if (!page.length) return 0;
    return Math.max(...page.map((t) => t.end)) / 30;
  }, [testPlan]);

  const addTest = () =>
    set("ab_tests", [
      ...assumptions.ab_tests,
      { id: `t${Date.now()}`, name: "Novo teste", variants: 2, scope: "pagina", confirmed: true },
    ]);

  const updateTest = (id: string, patch: Partial<AbTest>) =>
    set("ab_tests", assumptions.ab_tests.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const removeTest = (id: string) => set("ab_tests", assumptions.ab_tests.filter((t) => t.id !== id));

  if (loading && !goals) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!goals) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-3">
          <p>Não foi possível carregar o histórico comercial.</p>
          {loadError && <p className="text-xs text-destructive/90">Resposta do servidor: {loadError}</p>}
          {loadError === "Rota não encontrada" && (
            <p className="text-xs text-amber-300/90 max-w-xl mx-auto">
              O backend desta aba ainda não foi publicado: falta aplicar a migration
              <span className="font-mono"> commercial_plan </span>
              e redeployar a função <span className="font-mono">admin-data</span>.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={loadGoals}>Tentar de novo</Button>
        </CardContent>
      </Card>
    );
  }

  const b = goals.baseline;
  // Último mês do plano. Vive aqui, depois do early return de carregamento,
  // porque `forecast` só existe quando `goals` chegou. Foi removido por engano
  // junto do bloco de histórico e derrubou a aba inteira em runtime.
  const lastMonth = forecast[forecast.length - 1];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Metas Comercial — {periodLabel}
              </p>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                Toda meta aqui é derivada, não digitada: a cascata real do funil aplicada sobre a
                verba. Assessoria e Sprint correm em caminhos separados, porque só a assessoria
                passa por reunião.
                <span className="block mt-2">
                  <strong className="text-foreground">Regra de mídia da casa:</strong>{" "}
                  {assumptions.growth_mode === "fixo" ? (
                    <>
                      a verba do mês é a do mês anterior{" "}
                      <strong className="text-foreground">mais {assumptions.growth_pct}%</strong>.
                      Investiu R$ 20 mil, investe {brl(20000 * (1 + assumptions.growth_pct / 100))} no mês
                      seguinte. O tráfego cresce sempre, em vez de encolher junto com um mês fraco.
                    </>
                  ) : (
                    <>
                      a verba do mês é{" "}
                      <strong className="text-foreground">{assumptions.reinvest_pct}% da receita do mês anterior</strong>.
                      Protege o caixa, mas um mês fraco derruba a verba do mês seguinte.
                    </>
                  )}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                Esta aba ignora os filtros globais de página e de criativo do topo: a meta é da
                operação inteira, não de uma variante de headline.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={preset} onValueChange={(v: any) => setPreset(v)}>
                <SelectTrigger className="w-[190px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes-passado">Mês passado + atual</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="60">Últimos 60 dias</SelectItem>
                  <SelectItem value="90">Últimos 3 meses (padrão)</SelectItem>
                  <SelectItem value="180">Últimos 6 meses</SelectItem>
                  <SelectItem value="365">Últimos 12 meses</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scenario} onValueChange={(v: any) => setScenario(v)}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservador">Conservador</SelectItem>
                  <SelectItem value="base">Cenário base</SelectItem>
                  <SelectItem value="agressivo">Agressivo</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={savePlan} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span className="ml-2 hidden md:inline">Salvar premissas</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAssumptions(DEFAULT_ASSUMPTIONS)} title="Voltar às premissas padrão">
                <RotateCcw className="w-4 h-4" />
              </Button>
              {/* Estado do salvamento automático. Sem isto, "salva sozinho" é
                  uma promessa que a pessoa não tem como conferir. */}
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {saving ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> salvando...
                  </span>
                ) : savedAt ? (
                  <>salvo {new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>
                ) : null}
              </span>
            </div>
          </div>
          {savedAt && (
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Premissas salvas em {new Date(savedAt).toLocaleString("pt-BR")}
            </p>
          )}
          {scenario !== "base" && (
            <p className="text-[11px] mt-2 text-amber-300/90">
              Cenário {scenario}: {scenario === "conservador" ? "custo por MQL 20% pior e fechamento 20% menor" : "custo por MQL 15% melhor e fechamento 20% maior"} que o histórico.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Meta: o comando principal da aba */}
      <Card className="border-emerald-500/30 bg-emerald-500/[0.03]">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-[220px]">
              <label className="text-[11px] text-muted-foreground block mb-1">Como planejar</label>
              <Select value={assumptions.mode} onValueChange={(v: any) => set("mode", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Partir da meta de receita</SelectItem>
                  <SelectItem value="verba">Partir da verba de mídia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {assumptions.mode === "meta" ? (
              <>
                <div className="w-[220px]">
                  <label className="text-[11px] text-muted-foreground block mb-1">
                    {assumptions.target_basis === "mes_final"
                      ? `Meta de CAIXA em ${monthLabel(shiftMonth(goals.current_month, horizonMonths))}`
                      : `Meta de CAIXA — total de ${periodLabel}`}
                  </label>
                  <Input
                    type="number"
                    value={assumptions.target_revenue_final ?? ""}
                    placeholder="ex: 1200000"
                    onChange={(e) => set("target_revenue_final", e.target.value === "" ? null : Number(e.target.value))}
                    className="h-9"
                  />
                </div>
                <div className="w-[200px]">
                  <label className="text-[11px] text-muted-foreground block mb-1">A meta é</label>
                  <Select value={assumptions.target_basis} onValueChange={(v: any) => set("target_basis", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="periodo">Somando os {horizonMonths} meses</SelectItem>
                      <SelectItem value="mes_final">Só no último mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="w-[220px]">
                <label className="text-[11px] text-muted-foreground block mb-1">Verba de mídia no 1º mês</label>
                <Input
                  type="number"
                  value={assumptions.investment_month1 ?? ""}
                  placeholder={String(Math.round(baselineMonthlySpend))}
                  onChange={(e) => set("investment_month1", e.target.value === "" ? null : Number(e.target.value))}
                  className="h-9"
                />
              </div>
            )}
            <div className="w-[190px]">
              <label className="text-[11px] text-muted-foreground block mb-1">Como a verba cresce</label>
              <Select value={assumptions.growth_mode} onValueChange={(v: any) => set("growth_mode", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo">% a mais que o mês anterior</SelectItem>
                  <SelectItem value="reinvestimento">% da receita do mês anterior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {assumptions.growth_mode === "reinvestimento" ? (
              <div className="w-[170px]">
                <label className="text-[11px] text-muted-foreground block mb-1">Reinvestir em mídia</label>
                <div className="relative">
                  <Input
                    type="number"
                    value={assumptions.reinvest_pct}
                    onChange={(e) => set("reinvest_pct", Number(e.target.value) || 0)}
                    className="h-9 pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  da receita do mês anterior
                </p>
              </div>
            ) : (
              <div className="w-[170px]">
                <label className="text-[11px] text-muted-foreground block mb-1">Crescimento de verba/mês</label>
                <div className="relative">
                  <Input
                    type="number"
                    value={assumptions.growth_pct}
                    onChange={(e) => set("growth_pct", Number(e.target.value) || 0)}
                    className="h-9 pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  sobre a verba do mês anterior
                </p>
              </div>
            )}
            <div className="flex-1 min-w-[260px] rounded-lg border border-emerald-500/25 bg-background/40 px-4 py-3">
              {assumptions.mode === "meta" && assumptions.target_revenue_final ? (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verba necessária no 1º mês</p>
                  <p className="text-2xl font-bold text-emerald-400">{brl(solvedMonth1Spend)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    chegando a {brl(lastMonth?.spend)} em {lastMonth?.label} · hoje o ritmo é {brl(baselineMonthlySpend)}/mês
                    {baselineMonthlySpend > 0 && ` (${num(solvedMonth1Spend / baselineMonthlySpend, 1)}× mais)`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Caixa projetado — total de {periodLabel}
                  </p>
                  <p className="text-2xl font-bold text-emerald-400">{brl(totals.cash)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    de {brl(totals.revenue)} em contrato (TCV) · {brl(solvedMonth1Spend)} de mídia no 1º mês
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Avisos de qualidade do dado e de capacidade */}
      {(b.warnings.length > 0 || b.confidence === "baixa" || capacityBreach) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> O que limita ou enfraquece este plano
            </p>
            {capacityBreach && (
              <p className="text-[12px] text-amber-100/90">
                <span className="font-semibold">A entrega estoura antes da verba:</span> em {capacityBreach.label} o
                plano exige {num(capacityBreach.active_bodies, 0)} bodys/mês e a equipe atual entrega{" "}
                {capacityCeiling} ({assumptions.editors_count} editores × {EDITOR_CAPACITY_BODIES_PER_MONTH}). Seriam
                necessários {Math.ceil(capacityBreach.active_bodies / EDITOR_CAPACITY_BODIES_PER_MONTH)} editores, ou
                subir a capacidade por editor.
              </p>
            )}
            {b.confidence === "baixa" && (
              <p className="text-[12px] text-amber-100/90">
                Amostra baixa na janela: {b.totals.mql} MQL e {b.totals.sales} vendas. O forecast serve para
                dimensionar verba e capacidade, não para prometer receita ao mês.
              </p>
            )}
            {b.warnings.map((w, i) => (
              <p key={i} className="text-[12px] text-amber-100/90">{w}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Baseline real */}
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-2">
            Baseline real — {b.from} a {b.to} ({b.days} dias)
            {b.cost_from !== b.from && (
              <span className="normal-case font-normal text-muted-foreground/70"> · custo medido de {b.cost_from} em diante</span>
            )}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mt-3">
            <BaselineStat label="Investido" value={brl(b.totals.spend)} sub={`${brl(baselineMonthlySpend)}/mês`} />
            <BaselineStat label="Leads" value={String(b.totals.leads)} sub={`${b.totals.mql} MQL`} />
            <BaselineStat label="CPMQL" value={brl(effective.cpmql.value)} origin={effective.cpmql.origin} sample={effective.cpmql.sample} />
            <BaselineStat label="MQL → reunião" value={pct(effective.meeting_rate.value)} origin={effective.meeting_rate.origin} sample={effective.meeting_rate.sample} />
            <BaselineStat label="Comparecimento" value={pct(effective.show_rate.value)} origin={effective.show_rate.origin} sample={effective.show_rate.sample} />
            <BaselineStat label="Realizada → assessoria" value={pct(effective.close_rate_assessoria.value)} origin={effective.close_rate_assessoria.origin} sample={effective.close_rate_assessoria.sample} />
            <BaselineStat label="Receita na janela" value={brl(b.totals.revenue)} sub={`${b.totals.sales} vendas`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mt-4 pt-4 border-t border-border/40">
            <BaselineStat label="Ticket assessoria" value={brl(effective.ticket_assessoria.value)} origin={effective.ticket_assessoria.origin} sample={effective.ticket_assessoria.sample} />
            <BaselineStat label="Ticket sprint" value={brl(effective.ticket_sprint.value)} origin={effective.ticket_sprint.origin} sample={effective.ticket_sprint.sample} />
            <BaselineStat label="Sprint por lead não-MQL" value={pct(effective.sprint_per_non_mql.value)} origin={effective.sprint_per_non_mql.origin} sample={effective.sprint_per_non_mql.sample} />
            <BaselineStat label="Custo por lead" value={brl(effective.cpl.value)} origin={effective.cpl.origin} sample={effective.cpl.sample} />
            <BaselineStat label="Caixa no ato" value={pct(effective.received_share.value)} origin={effective.received_share.origin} sub="do TCV entra no mês" />
            <BaselineStat label="Receita já contratada" value={brl(goals.committed_revenue.reduce((s, c) => s + c.amount, 0))} sub={`parcelas que caem em ${periodLabel}`} />
            <BaselineStat label="ROAS" value={num(b.rates.roas, 2)} sub="receita ÷ mídia" />
          </div>
        </CardContent>
      </Card>

      {/* Metas resultantes */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <BigStat label={`Investimento ${horizonMonths} meses`} value={brl(totals.spend)} />
        <BigStat label="MQL" value={num(totals.mql, 0)} accent="text-cyan-300" />
        <BigStat label="Reuniões realizadas" value={num(totals.meetings, 0)} />
        <BigStat label="Vendas de assessoria" value={num(totals.sales_assessoria, 1)} accent="text-green-400" sub={`+ ${num(totals.sales - totals.sales_assessoria, 1)} sprint`} />
        <BigStat label="Caixa no período" value={brl(totals.cash)} accent="text-green-400" sub="entrada + 1ª parcela — a meta" />
        <BigStat label="Receita em contrato (TCV)" value={brl(totals.revenue)} sub="valor total fechado" />
        <BigStat label="Margem" value={brl(totals.margin)} accent={totals.margin >= 0 ? "text-green-400" : "text-red-400"} sub="caixa após mídia, entrega e comissões" />
      </div>

      {/* Forecast mês a mês */}
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" /> Forecast — meta mês a mês
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Mídia</TableHead>
                  <TableHead className="text-right">Teste</TableHead>
                  <TableHead className="text-right">Escala</TableHead>
                  <TableHead className="text-right" title="Custo por MQL misturando teste e escala">CPMQL</TableHead>
                  <TableHead className="text-right">MQL</TableHead>
                  <TableHead className="text-right" title="Reuniões agendadas">Agendadas</TableHead>
                  <TableHead className="text-right" title="Reuniões que aconteceram (desconta o no-show)">Realizadas</TableHead>
                  <TableHead className="text-right" title="Custo por reunião realizada: a segunda métrica da hierarquia">R$/Realizada</TableHead>
                  <TableHead className="text-right">Assessoria</TableHead>
                  <TableHead className="text-right">Sprint</TableHead>
                  <TableHead className="text-right" title="Custo de aquisição por venda">CAC</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Caixa</TableHead>
                  <TableHead className="text-right">Bodys/mês</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecast.map((m) => (
                  <TableRow key={m.ym}>
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right">{brl(m.spend)}</TableCell>
                    <TableCell className="text-right text-blue-300">{brl(m.spend_test)}</TableCell>
                    <TableCell className="text-right text-purple-300">{brl(m.spend_scale)}</TableCell>
                    <TableCell className="text-right">{brl(m.cpmql_blended)}</TableCell>
                    <TableCell className="text-right font-semibold text-cyan-300">{num(m.mql, 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{num(m.meetings, 0)}</TableCell>
                    <TableCell className="text-right">{num(m.attended, 0)}</TableCell>
                    <TableCell className="text-right">{m.attended > 0 ? brl(m.spend / m.attended) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-green-400">{num(m.sales_assessoria, 1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{num(m.sales_sprint, 1)}</TableCell>
                    <TableCell className="text-right">{m.cac > 0 ? brl(m.cac) : "—"}</TableCell>
                    <TableCell className="text-right">{brl(m.revenue)}</TableCell>
                    <TableCell className="text-right">
                      {brl(m.cash)}
                      {m.committed > 0 && (
                        <span className="block text-[10px] text-muted-foreground/70">{brl(m.committed)} já contratado</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${m.active_bodies > capacityCeiling ? "text-red-400 font-semibold" : ""}`}>
                      {num(m.active_bodies, 0)}
                    </TableCell>
                    {/* A conta inteira no tooltip: quem lê a margem tem que
                        conseguir conferir de onde ela saiu sem abrir o código. */}
                    <TableCell
                      className={`text-right font-semibold ${m.margin >= 0 ? "text-green-400" : "text-red-400"}`}
                      title={[
                        `Caixa que entra:      ${brl(m.cash)}`,
                        `− Mídia:              ${brl(m.spend)}`,
                        `− Entrega (${num(m.active_bodies, 0)} bodys): ${brl(m.delivery_cost)}`,
                        `− Comissões:          ${brl(m.commissions)}`,
                        `− Esteira de teste:   ${brl(m.pipeline_cost)}`,
                        assumptions.fixed_cost_month > 0 ? `− Custo fixo:         ${brl(assumptions.fixed_cost_month)}` : null,
                        `${"=".repeat(30)}`,
                        `Margem:               ${brl(m.margin)}`,
                        "",
                        `TCV contratado no mês: ${brl(m.revenue)} (só ${brl(m.cash)} entra agora)`,
                      ].filter(Boolean).join(String.fromCharCode(10))}
                    >
                      {brl(m.margin)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-3">
            Bodys/mês soma os contratos antigos ainda em entrega com os vendidos dentro do plano — um
            contrato de {assumptions.contract_months} meses pesa nos {assumptions.contract_months} meses,
            não só no mês da venda. Vermelho é acima do teto de {capacityCeiling} bodys/mês da equipe atual.
          </p>
        </CardContent>
      </Card>

      {/* Capacidade de entrega */}
      <Card className={capacityBreach ? "border-red-500/40" : "border-primary/30"}>
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
            Capacidade de entrega — o teto que a verba não resolve
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <BaselineStat label="Teto atual" value={`${capacityCeiling} bodys/mês`} sub={`${assumptions.editors_count} editores × ${EDITOR_CAPACITY_BODIES_PER_MONTH}`} />
            <BaselineStat label="Carga já contratada" value={`${num(backlogBodiesByMonth.get(shiftMonth(goals.current_month, 1)) || 0, 0)} bodys/mês`} sub="contratos em andamento" />
            <BaselineStat label={`Carga em ${lastMonth?.label ?? "dez"}`} value={`${num(lastMonth?.active_bodies, 0)} bodys/mês`} sub="com as vendas do plano" />
            <BaselineStat label="Editores necessários" value={String(Math.ceil((lastMonth?.active_bodies || 0) / EDITOR_CAPACITY_BODIES_PER_MONTH))} sub={`em ${lastMonth?.label ?? "dez"}`} />
            <BaselineStat label="Custo por body" value={brl(DELIVERY_COST_PER_BODY, 2)} sub={`copy ${brl(COPY_COST_PER_BODY, 2)} + edição ${brl(EDITOR_COST_PER_BODY, 2)}`} />
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Editores hoje</label>
              <Input
                type="number"
                min={1}
                value={assumptions.editors_count}
                onChange={(e) => set("editors_count", Math.max(1, Number(e.target.value) || 1))}
                className="h-8 text-sm w-[80px]"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-3">
            O editor pesa o dobro do copy no custo do body não pelo salário, mas pela capacidade: 80
            contra 250 por mês. Subir a capacidade por editor é a maior alavanca de margem que existe
            aqui — e a única que faz a meta caber sem contratar.
          </p>
        </CardContent>
      </Card>

      {/* Premissas */}
      <Card className="border-primary/30">
        {/* De onde vem cada número — a base viva do forecast */}
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1 border-b border-border/50 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              De onde vem cada número do plano
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              janela: {b.from} a {b.to} · {b.days} dias
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3 max-w-3xl">
            Nenhuma taxa aqui é digitada. Todas saem do que aconteceu na janela acima e se atualizam
            sozinhas conforme a operação anda — mude o comparecimento na vida real e o forecast muda
            junto, sem ninguém tocar em nada. <strong className="text-foreground">Amostra</strong> é
            quantos casos sustentam o número: taxa apoiada em pouca coisa vira ruído, e por isso a
            origem fica visível.
          </p>

          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Métrica</TableHead>
                  <TableHead className="text-right">Valor em uso</TableHead>
                  <TableHead className="text-right">Amostra</TableHead>
                  <TableHead>De onde veio</TableHead>
                  <TableHead>O que ela decide no plano</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {([
                  { nome: "CPMQL", e: effective.cpmql, fmt: (v: number) => brl(v), papel: "Quantos MQL a verba compra" },
                  { nome: "Custo por lead", e: effective.cpl, fmt: (v: number) => brl(v), papel: "Volume de lead, base do Sprint" },
                  { nome: "MQL → reunião", e: effective.meeting_rate, fmt: (v: number) => pct(v, 1), papel: "Quantas reuniões saem dos MQL" },
                  { nome: "Comparecimento", e: effective.show_rate, fmt: (v: number) => pct(v, 1), papel: "Desconta o no-show" },
                  { nome: "Realizada → assessoria", e: effective.close_rate_assessoria, fmt: (v: number) => pct(v, 1), papel: "Fechamento por reunião realizada" },
                  { nome: "Sprint por lead não-MQL", e: effective.sprint_per_non_mql, fmt: (v: number) => pct(v, 1), papel: "Vendas de Sprint, que não passam por reunião" },
                  { nome: "Ticket assessoria", e: effective.ticket_assessoria, fmt: (v: number) => brl(v), papel: "Receita por venda de assessoria" },
                  { nome: "Ticket Sprint", e: effective.ticket_sprint, fmt: (v: number) => brl(v), papel: "Receita por sprint vendido" },
                  { nome: "Caixa no ato", e: effective.received_share, fmt: (v: number) => pct(v, 1), papel: "Quanto do contrato entra na conta — a meta" },
                ] as const).map((linha) => (
                  <TableRow key={linha.nome}>
                    <TableCell className="font-medium whitespace-nowrap">{linha.nome}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {linha.fmt(linha.e.value)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {linha.e.sample > 0 ? `n=${linha.e.sample}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ORIGIN_CLASS[linha.e.origin]}`}>
                        {ORIGIN_LABEL[linha.e.origin]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{linha.papel}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-[11px] text-muted-foreground/70 mt-3">
            <strong className="text-foreground">janela</strong>: medido no período acima —
            é o caso bom. <strong className="text-foreground">histórico</strong>: a janela tinha
            amostra pequena demais e o número veio de todo o histórico.
            <strong className="text-foreground"> chute</strong>: não há dado nenhum para a etapa, e o
            plano está usando um valor de partida — trate como provisório.
            <strong className="text-foreground"> premissa</strong>: alguém digitou um valor nos campos
            abaixo e ele passou a mandar no lugar do real. Apague o campo para voltar ao automático.
          </p>
        </CardContent>
      </Card>

      <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
            Premissas do plano — o que é decisão do time
          </p>
          <p className="text-[11px] text-muted-foreground/80 mb-3">
            Campos de taxa em branco usam o número real do baseline.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <Field label="Verba em teste" suffix="%" value={assumptions.test_share} onChange={(v) => set("test_share", v ?? 0)} hint={`Escala fica com ${(100 - assumptions.test_share).toFixed(0)}%`} />
            <Field label="Criativos novos por semana" value={assumptions.creatives_per_week} onChange={(v) => set("creatives_per_week", v ?? 0)} hint="Esteira de teste" />
            <Field label="MQL do teste custa" suffix="×" value={assumptions.test_cpmql_factor} step={0.05} onChange={(v) => set("test_cpmql_factor", v ?? 1)} hint="Sobre o custo médio" />
            <Field label="MQL da escala custa" suffix="×" value={assumptions.scale_cpmql_factor} step={0.05} onChange={(v) => set("scale_cpmql_factor", v ?? 1)} hint="Criativo já validado" />

            <Field label="Ganho por testar (mês)" suffix="%" value={assumptions.learning_pct} step={0.5} onChange={(v) => set("learning_pct", v ?? 0)} hint="Composto, proporcional à verba de teste" />
            <Field label="Piso do ganho acumulado" suffix="%" value={assumptions.learning_floor_pct} onChange={(v) => set("learning_floor_pct", v ?? 100)} hint="Do custo por MQL de hoje" />
            <Field label="Encarece a cada dobra de verba" suffix="%" value={assumptions.saturation_pct} onChange={(v) => set("saturation_pct", v ?? 0)} hint="Saturação de público" />
            <Field label="CPMQL" suffix="R$" value={assumptions.cpmql_override} placeholder={String(Math.round(effective.cpmql.value))} onChange={(v) => set("cpmql_override", v)} />

            <Field label="Custo por lead" suffix="R$" value={assumptions.cpl_override} placeholder={String(Math.round(effective.cpl.value))} onChange={(v) => set("cpl_override", v)} hint="Base do volume de Sprint" />
            <Field label="MQL → reunião" suffix="%" value={assumptions.meeting_rate_override} placeholder={(effective.meeting_rate.value * 100).toFixed(0)} onChange={(v) => set("meeting_rate_override", v)} />
            <Field label="Comparecimento" suffix="%" value={assumptions.show_rate_override} placeholder={(effective.show_rate.value * 100).toFixed(0)} onChange={(v) => set("show_rate_override", v)} />
            <Field label="Realizada → assessoria" suffix="%" value={assumptions.close_rate_assessoria_override} placeholder={(effective.close_rate_assessoria.value * 100).toFixed(0)} onChange={(v) => set("close_rate_assessoria_override", v)} />

            <Field label="Sprint por lead não-MQL" suffix="%" value={assumptions.sprint_rate_override} placeholder={(effective.sprint_per_non_mql.value * 100).toFixed(1)} step={0.1} onChange={(v) => set("sprint_rate_override", v)} />
            <Field label="Ticket assessoria" suffix="R$" value={assumptions.ticket_assessoria_override} placeholder={String(Math.round(effective.ticket_assessoria.value))} onChange={(v) => set("ticket_assessoria_override", v)} />
            <Field label="Ticket sprint" suffix="R$" value={assumptions.ticket_sprint_override} placeholder={String(Math.round(effective.ticket_sprint.value))} onChange={(v) => set("ticket_sprint_override", v)} />
            <Field label="Bodys/mês por contrato" value={assumptions.bodies_per_contract_month} onChange={(v) => set("bodies_per_contract_month", v ?? 0)} />

            <Field label="Meses por contrato" value={assumptions.contract_months} onChange={(v) => set("contract_months", v ?? 0)} />
            <Field label="MQL por variante no teste A/B" value={assumptions.mql_per_variant_target} onChange={(v) => set("mql_per_variant_target", v ?? 1)} hint="Amostra para eleger vencedora" />
            <Field label="Verba mínima por criativo" suffix="R$" value={assumptions.min_spend_per_creative} onChange={(v) => set("min_spend_per_creative", v ?? 0)} hint="Abaixo disso o teste não se lê" />
            <Field label="Custo fixo mensal" suffix="R$" value={assumptions.fixed_cost_month} onChange={(v) => set("fixed_cost_month", v ?? 0)} hint="Time e estrutura, se quiser na conta" />
            <Field
              label="Teto de Sprints/mês"
              value={assumptions.sprint_cap_month}
              placeholder="sem teto"
              onChange={(v) => set("sprint_cap_month", v)}
              hint="Realizado: 8/mês (jul e ago). Vazio = sem limite"
            />
          </div>
        </CardContent>
      </Card>

      {/* Esteira de criativos */}
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
            Esteira de teste — {assumptions.creatives_per_week} criativos por semana
          </p>
          {(() => {
            const perMonth = assumptions.creatives_per_week * WEEKS_PER_MONTH;
            const bodies = perMonth / HOOKS_PER_BODY;
            const cost = bodies * DELIVERY_COST_PER_BODY;
            const first = forecast[0];
            const last = forecast[forecast.length - 1];
            const thinTest = first && first.spend_per_creative < assumptions.min_spend_per_creative;
            const unreadable = first && first.mql_per_creative < 1;
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <BaselineStat label="Criativos por mês" value={num(perMonth, 0)} sub={`${assumptions.creatives_per_week}/semana`} />
                  <BaselineStat label="Bodys por mês" value={num(bodies, 1)} sub="4 ganchos = 1 body" />
                  <BaselineStat label="Custo de produção" value={brl(cost)} sub={`${brl(DELIVERY_COST_PER_BODY, 2)}/body`} />
                  <BaselineStat label="Verba por criativo (mês 1)" value={brl(first?.spend_per_creative)} sub="só a frente de teste" />
                  <BaselineStat label="Verba por criativo (mês 6)" value={brl(last?.spend_per_creative)} />
                  <BaselineStat label="MQL por criativo (mês 1)" value={num(first?.mql_per_creative, 2)} sub="leitura do teste" />
                </div>
                {(thinTest || unreadable) && (
                  <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1">
                    {thinTest && (
                      <p className="text-[12px] text-amber-100/90">
                        Cada criativo novo recebe {brl(first.spend_per_creative)} por mês, abaixo do
                        mínimo de {brl(assumptions.min_spend_per_creative)} para conseguir ler o resultado.
                        Ou entra menos criativo na esteira, ou sobe a verba de teste.
                      </p>
                    )}
                    {unreadable && (
                      <p className="text-[12px] text-amber-100/90">
                        Nesse volume, cada criativo gera {num(first.mql_per_creative, 2)} MQL por mês.
                        Abaixo de 1 MQL por criativo o corte vira sorteio: dá para eliminar o pior por
                        CTR e custo por clique, mas não para eleger vencedor por MQL.
                      </p>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground/70 mt-3">
                  Produção de esteira já está descontada da margem do forecast ({brl(cost)}/mês). Ela
                  não é custo de cliente: é o preço de nunca parar de testar.
                </p>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Programa de testes A/B */}
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Programa de testes A/B — quanto tempo cada um leva no volume projetado
            </p>
            <Button size="sm" variant="outline" onClick={addTest}>
              <Plus className="w-4 h-4 mr-1" /> Teste
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/80 mb-3">
            Testes de página são sequenciais entre si (dois ao mesmo tempo se contaminam); quiz e
            conta de anúncio rodam em trilha própria. A duração sai de{" "}
            {assumptions.mql_per_variant_target} MQL por variante no ritmo do forecast — a mesma régua
            de decisão do resto do painel, MQL e não lead total.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teste</TableHead>
                  <TableHead className="w-[110px]">Escopo</TableHead>
                  <TableHead className="text-right w-[90px]">Variantes</TableHead>
                  <TableHead className="text-right">MQL necessário</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead>Janela</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {testPlan.map(({ test, needed, days, start, end, fits }) => (
                  <TableRow key={test.id}>
                    <TableCell>
                      <Input
                        value={test.name}
                        onChange={(e) => updateTest(test.id, { name: e.target.value })}
                        className="h-8 text-sm"
                      />
                      {test.note && <p className="text-[10px] text-amber-300/80 mt-1">{test.note}</p>}
                      {test.confirmed === false && (
                        <Badge variant="outline" className="mt-1 text-[9px] px-1 py-0 border-amber-500/40 text-amber-400">
                          confirmar
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={test.scope} onValueChange={(v: any) => updateTest(test.id, { scope: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pagina">Página</SelectItem>
                          <SelectItem value="quiz">Quiz</SelectItem>
                          <SelectItem value="conta">Conta de anúncio</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={2}
                        value={test.variants}
                        onChange={(e) => updateTest(test.id, { variants: Math.max(2, Number(e.target.value) || 2) })}
                        className="h-8 text-sm text-right w-[70px] ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">{needed}</TableCell>
                    <TableCell className="text-right font-semibold">{fits ? `${days} dias` : `> ${horizonMonths} meses`}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fits ? `dia ${start + 1} ao ${end} (${monthLabel(shiftMonth(goals.current_month, 1 + Math.floor(start / 30)))})` : "não cabe no plano"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => removeTest(test.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
            <p className="text-[12px]">
              A fila de testes da página leva{" "}
              <span className="font-semibold text-cyan-300">{num(pageTestsMonths, 1)} meses</span> para
              rodar inteira no volume projetado.{" "}
              {pageTestsMonths > 1.2 ? (
                <>
                  O processo prevê o ciclo dos seis testes por mês; nesse volume de MQL ele não cabe em
                  um mês. As saídas são três: rodar menos variantes por teste, aceitar decidir com menos
                  MQL por variante, ou subir a verba até o volume que o ciclo mensal exige.
                </>
              ) : (
                <>O ciclo mensal completo cabe no volume projetado.</>
              )}
            </p>
            {forecast[0] && (
              <p className="text-[11px] text-muted-foreground/80 mt-2">
                Para fechar os testes de página dentro de um mês seria preciso{" "}
                {num(assumptions.ab_tests.filter((t) => t.scope === "pagina").reduce((s, t) => s + t.variants, 0) * assumptions.mql_per_variant_target, 0)}{" "}
                MQL no mês, contra os {num(forecast[0].mql, 0)} MQL projetados para o mês 1.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contratos em andamento */}
      {goals.contracts.length > 0 && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
              Carteira atual — o que já está vendido
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead className="text-right">TCV</TableHead>
                    <TableHead className="text-right">Meses</TableHead>
                    <TableHead className="text-right">Bodys/mês</TableHead>
                    <TableHead>Entrega até</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goals.contracts.slice(0, 15).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[260px] truncate">{c.notes || "—"}</TableCell>
                      <TableCell className="capitalize">{c.sale_type}</TableCell>
                      <TableCell>{c.sale_date}</TableCell>
                      <TableCell className="text-right">{brl(c.revenue)}</TableCell>
                      <TableCell className="text-right">{c.delivery_months ?? "—"}</TableCell>
                      <TableCell className="text-right">{c.delivery_months && c.bodies_per_month ? c.bodies_per_month : "—"}</TableCell>
                      <TableCell>{c.ends_at ? monthLabel(c.ends_at) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BaselineStat({ label, value, sub, origin, sample }: {
  label: string;
  value: string;
  sub?: string;
  origin?: Origin;
  sample?: number;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {origin && (
        <Badge variant="outline" className={`text-[9px] px-1 py-0 mt-0.5 ${ORIGIN_CLASS[origin]}`}>
          {ORIGIN_LABEL[origin]}{sample ? ` · n=${sample}` : ""}
        </Badge>
      )}
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

function BigStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="border-primary/20">
      <CardContent className="py-3 px-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-bold ${accent || ""}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, suffix, hint, placeholder, step }: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  hint?: string;
  placeholder?: string;
  step?: number;
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          value={value === null || value === undefined ? "" : value}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
          className="h-9 text-sm pr-8"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/60">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-1">{hint}</p>}
    </div>
  );
}
