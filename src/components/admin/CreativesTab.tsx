import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  DollarSign,
  Users,
  Target,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Star,
  Calendar,
  Circle,
  Search,
  X,
  Check,
  GripVertical,
  Layers,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { bandFromScore, bandColorClass } from "@/lib/leadScoring";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";
import MetasMes from "./MetasMes";
import GastoDoDia from "./GastoDoDia";
import PainelFunis from "./PainelFunis";
import PainelOrganico from "./PainelOrganico";
import DesempenhoPorConta from "./DesempenhoPorConta";
import { AnimatedNumber } from "./AnimatedNumber";
import { HEADLINE_VARIANTS } from "@/config/headlineVariants";
import { SUBHEADLINE_VARIANTS } from "@/config/subheadlineVariants";
import {
  ORIGENS,
  ROTULO_ORIGEM,
  ABOBORA_VAZIO,
  PERGUNTAS_ABOBORA,
  faltasNoAbobora,
  precisaNomeManual,
  type Origem,
  type AboboraCampos } from
"@/lib/funis";
import RegistroGravacao from "./RegistroGravacao";
import { assinarAoVivo, avisarAoVivo } from "@/lib/aoVivo";
import { pessoaDesteAparelho } from "@/hooks/useLeadNotifications";
import AnaliseCall, { type Analise } from "./AnaliseCall";
import DetalheReuniao from "./DetalheReuniao";
import { somarPorCriativo, type LinhaCriativoSomavel } from "@/lib/criativosAgregado";

/** Nome curto da variante de headline; o label já traz o slug ("HD3 · ..."). */
function headlineLabel(path: string): string {
  return HEADLINE_VARIANTS.find((v) => v.path === path)?.label
    || SUBHEADLINE_VARIANTS.find((v) => v.path === path)?.label
    || path;
}

// ── Types ──
interface CreativeData {
  /**
   * A CHAVE DA LINHA desde 18/09/2026: `${conta}::${ad_id}` — ou
   * ou a chave de um dos três baldes: `sem-anuncio-identificado`, `previa-gerenciador`,
   * `direct-link-in-bio`. É por ela que a tabela identifica a linha.
   * Opcional só para não quebrar com uma resposta de function antiga em cache.
   */
  row_key?: string;
  ad_id?: string | null;
  ad_account_id?: string | null;
  account_name?: string | null;
  /** ad_id | utm_content_id | nome_unico | nome_na_conta | nome_por_gasto | sem_anuncio | previa | sem_atribuicao | agregado */
  identidade_metodo?: string;
  /**
   * A identidade do CRIATIVO (nome normalizado), NÃO da linha. Duas linhas de
   * contas diferentes compartilham a mesma — é por ela que a soma opcional
   * junta, e é a forma gravada em `manual_sales.creative_key`.
   */
  creative_key: string;
  creative_label: string;
  creative_source_field: string;
  leads_count: number;
  mql_count: number;
  /** Coorte: dos MQL deste período, quantos agendaram, compareceram e compraram. */
  mql_agendaram?: number;
  mql_compareceram?: number;
  mql_compraram?: number;
  clicks: number;
  impressions: number;
  ctl: number | null;
  tier_small_count: number;
  tier_medium_count: number;
  tier_large_count: number;
  tier_enterprise_count: number;
  tier_enterprise_plus_count: number;
  mql_rate: number;
  spend: number;
  cost_per_mql: number | null;
  cost_per_small: number | null;
  cost_per_medium: number | null;
  cost_per_tier_large: number | null;
  cost_per_enterprise: number | null;
  cost_per_enterprise_plus: number | null;
  qualified_count: number;
  cost_per_qualified: number | null;
  sales_count: number;
  sales_sprint_count: number;
  sales_assessoria_count: number;
  cac: number | null;
  revenue: number;
  revenue_sprint: number;
  revenue_assessoria: number;
  revenue_assessoria_received?: number;
  revenue_assessoria_to_receive?: number;
  roas: number | null;
  last_activity: string | null;
  leads_by_stage: Record<string, number>;
  campaigns: string[];
  meetings_count: number;
  meetings_attended_count: number;
  cost_per_meeting: number | null;
  landing_page_views: number;
  sessions_count?: number;
  quiz_views_count?: number;
  lead_per_view: number | null;
  is_active: boolean;
  /**
   * A nota média da VERSÃO DOMINANTE da linha — não a média de todos os leads.
   *
   * Quiz (v2.3, seis componentes) e formulário curto (v3-form, só faturamento
   * e mercado renormalizados) são 0–100 mas NÃO são a mesma régua: a mesma
   * faixa "De R$ 10 a 20 mil" dá 43,8 no quiz e 20,0 no formulário. A média
   * das duas não existe em régua nenhuma, e as cores desta coluna são as do
   * quiz. `score_por_versao` traz cada uma separada.
   */
  avg_lead_score: number | null;
  score_por_versao?: Record<string, { media: number; n: number }>;
  score_versao_dominante?: string | null;
  score_misturado?: boolean;
  /** Leads da linha que ficaram FORA da média mostrada (as outras versões). */
  score_leads_fora_da_media?: number;
  hql_count?: number;
  /** Só nas linhas somadas por criativo: quantas linhas e quantas contas a soma juntou. */
  linhas_somadas?: number;
  contas_somadas?: number;
  contas_na_soma?: Array<{ ad_account_id: string; account_name: string | null; spend: number }>;
}

/** Métricas da campanha inteira, agregadas no backend a partir das mesmas
 *  fontes dos criativos (somar os criativos daria errado: há criativo rodando
 *  em nove campanhas e o gasto dele não se divide igualmente entre elas). */
interface CampaignPerformance {
  campaign: string;
  spend: number;
  impressions: number;
  clicks: number;
  landing_page_views: number;
  leads_count: number;
  mql_count: number;
  leads_5_10k_count: number;
  meetings_count: number;
  meetings_attended_count: number;
  sales_count: number;
  sales_sprint_count: number;
  sales_assessoria_count: number;
  revenue: number;
  creatives_count: number;
  is_active: boolean;
  ctl: number | null;
  cost_per_mql: number | null;
  mql_rate: number | null;
  lead_per_view: number | null;
  cost_per_meeting: number | null;
  meeting_rate: number | null;
  show_rate: number | null;
  win_rate: number | null;
  cac: number | null;
  cac_sprint: number | null;
  cac_assessoria: number | null;
  roas: number | null;
  avg_lead_score: number | null;
  cost_per_5_10k: number | null;
  sessions_count: number;
  quiz_views_count: number;
  conv_page: number | null;
  conv_quiz: number | null;
  conv_total: number | null;
  conv_total_mql: number | null;
  revenue_assessoria?: number;
}

/** Uma variante do teste A/B: a página por onde a pessoa entrou. */
interface VariantPerformance {
  page: string;
  spend: number;
  landing_page_views: number;
  sessions_count: number;
  quiz_views_count: number;
  leads_count: number;
  mql_count: number;
  leads_5_10k_count: number;
  meetings_count: number;
  meetings_attended_count: number;
  /** Coorte: dos MQL deste período, quantos agendaram, compareceram e compraram. */
  mql_agendaram?: number;
  mql_compareceram?: number;
  mql_compraram?: number;
  sales_count: number;
  sales_sprint_count: number;
  sales_assessoria_count: number;
  revenue: number;
  is_active: boolean;
  ctl: number | null;
  cost_per_mql: number | null;
  cost_per_meeting: number | null;
  meeting_rate: number | null;
  win_rate: number | null;
  cac: number | null;
  cac_sprint: number | null;
  cac_assessoria: number | null;
  roas: number | null;
  avg_lead_score: number | null;
  cost_per_5_10k: number | null;
  conv_page: number | null;
  conv_quiz: number | null;
  conv_total: number | null;
  conv_total_mql: number | null;
}

interface CreativesResponse {
  creatives: CreativeData[];
  campaigns_performance?: CampaignPerformance[];
  variants_performance?: VariantPerformance[];
  totals: {
    spend: number;
    leads: number;
    mql: number;
    clicks: number;
    impressions: number;
    ctl: number | null;
    tier_small: number;
    tier_medium: number;
    tier_large: number;
    tier_enterprise: number;
    tier_enterprise_plus: number;
    sales: number;
    /** Transações de Sprint. Não confundir com sprint_units, que são os níveis vendidos. */
    sales_sprint: number;
    /** Sprints vendidos (soma dos níveis): uma venda "nível 4" são quatro sprints. */
    sprint_units?: number;
    /** Custo por venda de cada mês: mídia do mês inteiro ÷ vendas do mês inteiro. */
    cac_by_month?: Record<string, { spend: number; sales: number; cac: number }>;
    sales_assessoria: number;
    /** Contratos de parceria (comissionados). Sem TCV, por definição. */
    sales_parceria?: number;
    /** Vendas reembolsadas no período. Fora da receita, mas visíveis. */
    sales_refunded?: number;
    revenue: number;
    revenue_sprint: number;
    revenue_assessoria: number;
    revenue_assessoria_received?: number;
    revenue_assessoria_to_receive?: number;
    meetings: number;
    meetings_attended: number;
    /** Coorte: dos MQL do período, quantos agendaram, compareceram e compraram. */
    mql_agendaram?: number;
    mql_compareceram?: number;
    mql_compraram?: number;
    /** Reuniões com desfecho (realizada ou no-show) — denominador do comparecimento. */
    meetings_decided?: number;
    /** Agendadas cuja hora já passou sem ninguém marcar o desfecho. */
    meetings_pending?: number;
    landing_page_views: number;
    lead_per_view: number | null;
    /** Leads de prospecção do período: ficam fora do CPL, CTL e lead/LPV. */
    leads_prospeccao?: number;
    cpl: number | null;
    cpmql: number | null;
    /**
     * Leads acima do corte de qualidade DA VERSÃO do score deles (73 no quiz,
     * 67 no formulário curto), o mesmo critério do evento HighQualityLead da
     * Meta. A CHAVE do JSON continua `hql` — só o rótulo da tela mudou.
     */
    hql?: number;
    /** Spend ÷ HQL. */
    cp_hql?: number | null;
    cp_tier_small: number | null;
    cp_tier_medium: number | null;
    cp_tier_large: number | null;
    cp_tier_enterprise: number | null;
    cp_tier_enterprise_plus: number | null;
    cac: number | null;
    roas: number | null;
    cp_meeting: number | null;
    /** Média da VERSÃO DOMINANTE. Ver `CreativeData.avg_lead_score`. */
    avg_lead_score: number | null;
    score_por_versao?: Record<string, { media: number; n: number }>;
    score_versao_dominante?: string | null;
    score_misturado?: boolean;
    score_leads_fora_da_media?: number;
  };
  /**
   * Fuso declarado das contas que gastaram no período contra o fuso em que a
   * tela montou o filtro. `ad_spend.date` é o dia NO FUSO DA CONTA; leads e
   * sessões são filtrados em UTC. Hoje as três contas são UTC−3 e não há
   * deslocamento — `divergencia` existe para o dia em que houver.
   */
  fuso?: {
    padrao: string;
    offset_filtro_min: number;
    divergencia: boolean;
    contas: Array<{
      ad_account_id: string;
      account_name: string | null;
      timezone_name: string | null;
      fuso_usado: string;
      offset_min: number;
      divergente: boolean;
    }>;
  };
  data_quality: {
    leads_with_creative: number;
    leads_total: number;
    spend_mapped: number;
    spend_total: number;
    sales_without_creative: number;
    leads_without_utms: number;
    /** Leads com macro literal da Meta: clique de PRÉVIA no Gerenciador, não tráfego. */
    leads_previa_gerenciador?: number;
    /** Quantas linhas da tabela vieram de cada método de identificação. */
    identidade_por_metodo?: Record<string, number>;
  };
}

interface ManualSale {
  id: string;
  sale_date: string;
  revenue: number;
  lead_id: string | null;
  creative_key: string | null;
  utm_content: string | null;
  notes: string | null;
  sale_type: string;
  /** Quantos sprints a venda representa. Nulo vale 1 (venda antiga). */
  sprint_levels?: number | null;
  lead_created_at?: string | null;
  closer?: string | null;
  payment_type?: string | null;
  installments_count?: number | null;
  installment_value?: number | null;
  amount_received?: number | null;
  delivery_months?: number | null;
  ads_contracted?: number | null;
  bodies_per_month?: number | null;
  /** Percentual de comissão. Só existe em venda de parceria. */
  commission_pct?: number | null;
  /** Reembolso é estado, não exclusão: data preenchida tira a venda da receita. */
  refunded_at?: string | null;
  refund_amount?: number | null;
  refund_reason?: string | null;
  /** Funil que gerou a venda. Vendas anteriores a 03/09/2026 são todas mídia paga. */
  origem?: string | null;
  /** Nome de quem comprou quando a venda não passou pelo formulário. */
  lead_nome?: string | null;
  /**
   * Nome de quem comprou, já resolvido pelo backend: o do lead vinculado, com
   * `lead_nome` como reserva. Use SEMPRE este, nunca `lead_nome` sozinho — em
   * 16/09/2026 as 14 vendas do sistema tinham lead vinculado e nenhuma tinha
   * `lead_nome`, então ler o campo cru mostrava "sem nome" em todas.
   */
  lead_nome_resolvido?: string | null;
}

// Links das agendas dos closers (exibidos nos diálogos de reunião).
// Caio: a definir posteriormente.
const CLOSER_CALENDARS: Record<string, string> = {
  Rodger: "https://calendar.app.google/GVHDaqd6VDsJWjHi9",
  Caio: "",
};

type MeetingStatus = "agendada" | "realizada" | "no_show";

const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  no_show: "No-show",
};

interface Meeting {
  id: string;
  creative_key: string | null;
  utm_content: string | null;
  notes: string | null;
  created_at: string;
  attended: boolean;
  /** agendada · realizada · no_show. Só as duas últimas entram no comparecimento. */
  status: MeetingStatus;
  /** Data e hora da call. `created_at` é quando o SDR registrou o agendamento. */
  scheduled_at: string | null;
  /** Já passou da hora e ninguém marcou o desfecho — o backend devolve calculado. */
  pendente?: boolean;
  closer: string | null;
  /** Página de entrada do lead ("/", "/HD3", ...), resolvida pelo evento de envio. */
  headline_path: string | null;
  origem?: string | null;
  /**
   * Quem marcou: "auto" = o próprio lead escolheu o horário em /agendar,
   * "time" = alguém registrou pelo painel. O backend normaliza (linha anterior
   * a 17/09/2026 vem sem o campo e é lida como "time").
   */
  agendado_por?: "auto" | "time" | string | null;
  lead_nome?: string | null;
  /** Nome do lead resolvido no backend. É a identidade da reunião. */
  lead_nome_resolvido?: string | null;
  lead_id?: string | null;
  utm_campaign?: string | null;
  /** Processo Abóbora — o que o SDR levantou antes de passar a call ao closer. */
  abobora_posicao?: string | null;
  abobora_segmento?: string | null;
  abobora_decide?: string | null;
  abobora_quem_decide?: string | null;
  abobora_investimento?: string | null;
  /** Calculada no banco a partir das cinco acima. */
  abobora_completa?: boolean | null;
  recording_url?: string | null;
  recording_folder?: string | null;
  recording_uploaded_at?: string | null;
  recording_by?: string | null;
  analise_ia?: Record<string, unknown> | null;
  analise_ia_at?: string | null;
  /** Desfecho escrito pelo closer depois da call. */
  motivo_categoria?: string | null;
  motivo_detalhe?: string | null;
  motivo_por?: string | null;
  motivo_at?: string | null;
}

interface LeadOption {
  id: string;
  nome_completo: string;
  whatsapp: string;
  mercado: string;
  utm_content: string | null;
  tier: string | null;
  investimento_faixa?: string | null;
  created_at: string;
  first_opened_at?: string | null;
  estagio_negocio?: string | null;
  sdr_override?: string | null;
}

interface AdSpendEntry {
  id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  utm_content: string | null;
  creative_key: string | null;
}

// ── Helpers ──
function normalizeCreativeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Taxa de qualificação: a nota média (0–100) dos leads que aquele criativo,
 * campanha ou variante trouxe.
 *
 * É a métrica que separa volume de qualidade. Um criativo pode trazer muito
 * lead barato e média baixa — CPMQL bom, pipeline ruim. A cor vem da mesma
 * faixa usada no modal do lead (Hot / Quente / Morno / Frio), para o que se lê
 * na linha e o que se lê no lead serem a mesma escala.
 */
function TaxaQualificacao({ score }: { score: number | null }) {
  if (score == null || !isFinite(score)) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  const band = bandFromScore(score);
  return (
    <span className={`font-semibold ${bandColorClass(band)}`} title={`${score.toFixed(0)}/100 · ${band}`}>
      {score.toFixed(0)}
      <span className="block text-[9px] font-normal opacity-70">{band}</span>
    </span>
  );
}

/** Nome curto de cada régua de score, para caber na coluna. */
const ROTULO_VERSAO_SCORE: Record<string, string> = {
  "v2.3": "quiz",
  "v3-form": "form",
};

function rotuloVersaoScore(versao: string | null | undefined): string {
  if (!versao) return "—";
  return ROTULO_VERSAO_SCORE[versao] ?? versao;
}

/**
 * A chave da LINHA da tabela.
 *
 * `row_key` vem do backend desde 18/09/2026 e é `${conta}::${ad_id}`. O
 * `creative_key` de reserva existe só para o intervalo em que uma function
 * antiga ainda estiver publicada: nesse caso a tela volta ao comportamento de
 * antes em vez de quebrar.
 */
function chaveDaLinha(c: { row_key?: string; creative_key: string }): string {
  return c.row_key || c.creative_key;
}

/**
 * A coluna Tx.Qualif. — uma média POR RÉGUA, nunca a média das duas.
 *
 * Corrigido em 18/09/2026. `v2.3` (quiz de 14 passos, seis componentes) e
 * `v3-form` (formulário curto da landing, só faturamento + mercado
 * renormalizados) são ambas 0–100 e NÃO medem a mesma coisa. Medido na mesma
 * faixa de faturamento, setembro:
 *
 *   Não vendo ainda   20,0 (quiz)  ×   5,0 (form)
 *   Até R$ 5 mil      42,5         ×   9,0
 *   De R$ 10 a 20 mil 43,8         ×  20,0
 *   setembro inteiro  52,8 (n=34)  ×  11,8 (n=4)
 *
 * O número grande é a média da versão com MAIS leads na linha; a outra vem
 * embaixo, com o `n`. As cores continuam sendo as do quiz e por isso só valem
 * para a linha do quiz — a linha do formulário sai em cinza, sem prometer uma
 * faixa que ela não tem. O corte de HQL já é por versão e não é tocado aqui.
 */
function NotaPorVersao({ c }: { c: CreativeData }) {
  const versoes = c.score_por_versao ?? {};
  const dominante = c.score_versao_dominante ?? null;
  const media = c.avg_lead_score;
  if (media === null || media === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  const cls =
    dominante === "v3-form" ? "text-muted-foreground" :
    media >= 75 ? "text-emerald-400" :
    media >= 50 ? "text-amber-400" :
    media >= 25 ? "text-blue-400" :
    "text-muted-foreground";
  const outras = Object.entries(versoes).filter(([v]) => v !== dominante);
  return (
    <div className={`font-semibold ${cls}`}>
      {media}
      <div className="text-[9px] text-muted-foreground font-normal">
        /100 · {rotuloVersaoScore(dominante)}
        {dominante ? ` (${versoes[dominante]?.n ?? 0})` : ""}
      </div>
      {outras.map(([versao, v]) => (
        <div
          key={versao}
          className="text-[9px] text-muted-foreground font-normal border-t border-border/40 mt-0.5 pt-0.5"
          title={`Régua diferente: ${versao}. Nunca somada à de cima.`}
        >
          {v.media} · {rotuloVersaoScore(versao)} ({v.n})
        </div>
      ))}
    </div>
  );
}

/**
 * A CONTA da linha, em cima do nome do anúncio.
 *
 * Nome é rótulo, ID é identidade — e a conta é metade da identidade. Sem ela
 * na tela, três linhas chamadas "Luis-Nathan Case #2 - V3" são indistinguíveis
 * e a leitura volta a ser a de antes.
 *
 * Os casos sem conta são declarados em vez de disfarçados:
 *   · `sem_anuncio`  — tem nome de criativo, nenhum anúncio conhecido usa esse
 *                      nome. É UM balde, nunca uma linha por nome (18/09/2026);
 *   · `previa`       — macro literal da Meta, clique de prévia no Gerenciador;
 *   · `agregado`     — linha somada por criativo, juntando contas de propósito.
 *
 * E quando a linha TEM conta mas chegou nela pelo nome, a etiqueta diz isso:
 * `nome_na_conta` e `nome_por_gasto` são caminhos fracos, e caminho fraco é
 * para aparecer.
 */
function EtiquetaDaConta({ c }: { c: CreativeData }) {
  if (c.identidade_metodo === "agregado" && (c.contas_somadas ?? 0) > 1) {
    const nomes = (c.contas_na_soma ?? []).map((x) => x.account_name || x.ad_account_id).join(" + ");
    return (
      <p
        className="text-[8px] font-semibold text-amber-400 truncate"
        title={`Linha somada: ${c.linhas_somadas} anúncios de ${c.contas_somadas} contas (${nomes}). Não pertence a nenhuma conta.`}
      >
        Σ {c.contas_somadas} contas
      </p>
    );
  }
  if (c.account_name || c.ad_account_id) {
    const porNome = c.identidade_metodo === "nome_na_conta" || c.identidade_metodo === "nome_por_gasto";
    return (
      <p
        className={`text-[8px] font-semibold truncate ${porNome ? "text-amber-400" : "text-sky-300"}`}
        title={
          porNome
            ? `${c.ad_account_id ?? ""} · linha resolvida pelo NOME do criativo (${c.identidade_metodo}), não por ad_id: parte destes registros chegou sem o ID do anúncio.`
            : (c.ad_account_id ?? undefined)
        }
      >
        {c.account_name || c.ad_account_id}{porNome ? " ·por nome" : ""}
      </p>
    );
  }
  if (c.identidade_metodo === "sem_anuncio") {
    return (
      <p
        className="text-[8px] font-semibold text-amber-400 truncate"
        title="Estes registros trouxeram um nome de criativo que não corresponde a nenhum anúncio conhecido (anúncio apagado, link antigo, nome digitado à mão). Ficam todos numa linha só — nunca uma linha por nome."
      >
        sem anúncio identificado
      </p>
    );
  }
  if (c.identidade_metodo === "previa") {
    return (
      <p
        className="text-[8px] font-semibold text-purple-300 truncate"
        title="Macro da Meta não substituída ({{ad.id}}): clique em PRÉVIA de anúncio dentro do Gerenciador. Não é tráfego pago nem orgânico."
      >
        prévia / interno
      </p>
    );
  }
  return <p className="text-[8px] text-muted-foreground truncate">sem conta</p>;
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Dinheiro sem centavos, para meta e comparação.
 *
 * "R$ 4.630,50 / R$ 2.500,00" ocupa duas linhas e os centavos não decidem nada
 * numa meta. Ao lado do realizado, o que se lê é a ordem de grandeza.
 */
function moedaCurta(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

// ── Margem / comissão (regra fixa do negócio) ──
const CLOSER_COMMISSION_RATE = 0.0625; // 6,25% sobre o recebido da venda, pro closer que fechou (sale.closer)

/**
 * Call feita em dupla.
 *
 * Quando o Rodger entra na call junto com o Caio, a comissão do Caio cai pela
 * METADE. A outra metade é do Rodger — e ele NÃO recebe: ela existe só para
 * aparecer na tela, para o Caio ver quanto deixou de ganhar por não ter fechado
 * sozinho. É número de conversa, não de folha de pagamento.
 *
 * Por isso ela é calculada, exibida e mantida FORA do custo da venda. Somá-la ao
 * custo inflaria o custo do time com dinheiro que ninguém paga, e a margem real
 * apareceria menor do que é.
 */
export const CLOSER_DUPLA = "Caio e Rodger";

/** O closer que efetivamente recebe, e quanto do total é dele. */
function repartirComissao(closer: string | null | undefined): {
  quemRecebe: string;
  fatiaPaga: number;
  simbolico: { quem: string; fatia: number } | null;
} {
  if ((closer || "").trim() === CLOSER_DUPLA) {
    return { quemRecebe: "Caio", fatiaPaga: 0.5, simbolico: { quem: "Rodger", fatia: 0.5 } };
  }
  return { quemRecebe: closer || "Sem closer", fatiaPaga: 1, simbolico: null };
}
const MIGUEL_COMMISSION_RATE = 0.01; // 1% sobre o valor total da venda (TCV) — comissão fixa, não depende do closer
// Cada body rende 4 ganchos, ou seja, 4 criativos entregues. É essa a conta que
// transforma o que foi VENDIDO (ads contratados) em custo de produção.
const HOOKS_PER_BODY = 4;
// Fallback só para venda antiga sem `ads_contracted` preenchido. Não é uma
// premissa de negócio: é chute, e o front marca o número como estimado.
const FALLBACK_BODIES_PER_MONTH = 25;

/**
 * Bodys de entrega de um contrato.
 *
 * Sai do contrato, não de uma média: 150 ads em 3 meses são 50 criativos por
 * mês; a 4 ganchos por body, 12 bodys por mês, 36 no total. O piso é por MÊS
 * porque body é unidade de produção mensal — foi assim que o fundador
 * descreveu o caso do Enzo Garcia (12 por mês, 36 no total, não 37).
 */
function bodiesForSale(sale: {
  delivery_months?: number | null;
  ads_contracted?: number | null;
  bodies_per_month?: number | null;
}): { bodies: number; perMonth: number; estimated: boolean } {
  const months = Number(sale.delivery_months) || 0;
  const ads = Number(sale.ads_contracted) || 0;
  const bpm = Number(sale.bodies_per_month) || 0;

  // Contrato fechado em criativos: 150 ads em 3 meses = 50/mês = 12 bodys/mês.
  if (ads > 0 && months > 0) {
    const perMonth = Math.floor(ads / months / HOOKS_PER_BODY);
    return { bodies: perMonth * months, perMonth, estimated: false };
  }
  if (ads > 0) {
    const perMonth = Math.floor(ads / HOOKS_PER_BODY);
    return { bodies: perMonth, perMonth, estimated: false };
  }
  // Contrato fechado em bodys por mês, que é o formato mais comum ("25B mês").
  if (bpm > 0 && months > 0) return { bodies: bpm * months, perMonth: bpm, estimated: false };
  // Nem um nem outro preenchido: estima e avisa.
  return { bodies: months * FALLBACK_BODIES_PER_MONTH, perMonth: FALLBACK_BODIES_PER_MONTH, estimated: months > 0 };
}
const COPY_SALARY = 3500;
const COPY_CAPACITY_BODIES_PER_MONTH = 250; // ~10 clientes × 25 bodys
const EDITOR_SALARIES = [2000, 2000, 3000]; // editores atuais (2 de R$2k, 1 de R$3k)
const EDITOR_CAPACITY_BODIES_PER_MONTH = 80; // média por editor, sem otimização
const COPY_COST_PER_BODY = COPY_SALARY / COPY_CAPACITY_BODIES_PER_MONTH;
const EDITOR_AVG_SALARY = EDITOR_SALARIES.reduce((a, b) => a + b, 0) / EDITOR_SALARIES.length;
const EDITOR_COST_PER_BODY = EDITOR_AVG_SALARY / EDITOR_CAPACITY_BODIES_PER_MONTH;
const DELIVERY_COST_PER_BODY = COPY_COST_PER_BODY + EDITOR_COST_PER_BODY;

interface SaleMargin {
  cac: number;
  closer: string;
  closerCommission: number;
  /** A comissão inteira, antes da divisão. Só difere de closerCommission na dupla. */
  comissaoCheia: number;
  /** Call feita a dois: metade da comissão vira número simbólico. */
  emDupla: boolean;
  /** O que o Rodger teria recebido. NÃO é custo: ele não cobra. */
  comissaoSimbolica: { quem: string; valor: number } | null;
  miguelCommission: number;
  deliveryCost: number;
  deliveryBodies: number;
  deliveryBodiesPerMonth: number;
  deliveryEstimated: boolean;
  totalCost: number;
  margin: number;
  marginPct: number | null;
}

// CAC é o investimento do período rateado entre TODAS as vendas: spend total ÷
// vendas. Toda venda carrega o mesmo pedaço, então a soma do CAC de todas elas
// fecha exatamente com o que foi gasto em mídia.
//
// Antes, cada tipo era calculado sobre uma base diferente — Assessoria levava o
// spend INTEIRO dividido pelas vendas de assessoria, e Sprint uma fatia
// proporcional aos leads até R$ 20 mil. Como as duas partiam do mesmo spend, a
// soma passava do que foi realmente investido e o custo total da margem saía
// inflado. Separar Sprint de Assessoria continua existindo nos cards de leitura
// (spend ÷ vendas de cada tipo), que é comparação, não rateio.
function calcSaleMargin(
  sale: ManualSale,
  cacPerSale: number
): SaleMargin {
  const revenue = Number(sale.revenue) || 0;
  const received = Number(sale.amount_received) || 0;
  const months = Number(sale.delivery_months) || 0;
  const cac = cacPerSale || 0;
  const reparticao = repartirComissao(sale.closer);
  const closer = reparticao.quemRecebe;
  const comissaoCheia = received * CLOSER_COMMISSION_RATE;
  const closerCommission = comissaoCheia * reparticao.fatiaPaga;
  // O que o Rodger teria recebido se cobrasse. Não entra em custo nenhum.
  const comissaoSimbolica = reparticao.simbolico
    ? { quem: reparticao.simbolico.quem, valor: comissaoCheia * reparticao.simbolico.fatia }
    : null;
  const emDupla = !!reparticao.simbolico;
  const miguelCommission = revenue * MIGUEL_COMMISSION_RATE;
  const { bodies, perMonth, estimated } = bodiesForSale(sale);
  const deliveryCost = bodies * DELIVERY_COST_PER_BODY;
  const totalCost = cac + closerCommission + miguelCommission + deliveryCost;
  const margin = revenue - totalCost;
  const marginPct = revenue > 0 ? margin / revenue : null;
  return { cac, closer, closerCommission, comissaoSimbolica, emDupla, comissaoCheia, miguelCommission, deliveryCost, deliveryBodies: bodies, deliveryBodiesPerMonth: perMonth, deliveryEstimated: estimated, totalCost, margin, marginPct };
}

// Quem o quiz roteia para a página do Sprint (Quiz.tsx, SPRINT_FAIXAS).
// É o denominador certo do win rate do Sprint.
const SPRINT_FAT_FAIXAS = [
  "Não vendo ainda (R$0/mês)", "Até R$ 5 mil", "De R$ 5 mil a R$ 10 mil",
];

const MQL_FAT_MIN_FAIXAS = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
];

function LeadSearchPicker({ leads, loading, selectedId, onSelect, label = "Lead *" }: {
  leads: LeadOption[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = selectedId ? leads.find(l => l.id === selectedId) : null;

  if (loading) {
    return (
      <div>
        <label className="text-sm text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando leads...
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-sm text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            {selected ? (
              <span className="truncate">
                {selected.nome_completo} <span className="text-muted-foreground text-xs">({selected.whatsapp})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Pesquisar lead pelo nome...</span>
            )}
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Digite o nome do lead..." />
            <CommandList>
              <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
              <CommandGroup>
                {leads.map(l => (
                  <CommandItem
                    key={l.id}
                    value={`${l.nome_completo} ${l.whatsapp}`}
                    onSelect={() => {
                      onSelect(l.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${selectedId === l.id ? "opacity-100" : "opacity-0"}`} />
                    <span className="font-medium">{l.nome_completo}</span>
                    <span className="text-muted-foreground ml-1 text-xs">({l.whatsapp})</span>
                    {l.tier && <span className="ml-1 text-xs text-muted-foreground">[{l.tier}]</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <Button variant="ghost" size="sm" className="mt-1 text-xs h-6" onClick={() => onSelect(null)}>
          <X className="w-3 h-3 mr-1" /> Limpar seleção
        </Button>
      )}
    </div>
  );
}

function isLeadMql(estagio: string, investimento: string | null, sdrOverride?: string | null): boolean {
  if (sdrOverride === "Dara" || sdrOverride === "Miguel") return false;
  const faturaEnough = investimento ? MQL_FAT_MIN_FAIXAS.includes(investimento) : false;
  return faturaEnough;
}

// ── Props ──
interface FunnelMetricsInput {
  visitors: number | null;
  sessions: number | null;
  entered_quiz: number | null;
  completed: number;
  conversion_rate: number | null;
  step_funnel?: Array<{
    step_id: string;
    count: number;
    label?: string;
    flow?: string;
    flow_index?: number;
    flow_started?: number;
    flow_completed?: number;
  }>;
  quiz_v2_empty?: boolean;
  quiz_v1_present?: boolean;
}

interface CreativesTabProps {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
  startDateOnly: string;
  endDateOnly: string;
  startISO: string;
  endISO: string;
  funnelMetrics?: FunnelMetricsInput | null;
}

export default function CreativesTab({ fetchAdminData, startDateOnly, endDateOnly, startISO, endISO, funnelMetrics }: CreativesTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CreativesResponse | null>(null);
  // Slot no header global do /admin para portar as ações (Sync Meta Ads / Gasto / Reunião / Venda / Atualizar)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // Espera o slot existir; usa rAF para aguardar montagem do header
    let raf = 0;
    const find = () => {
      const el = document.getElementById("admin-header-actions-slot");
      if (el) setHeaderSlot(el);
      else raf = window.requestAnimationFrame(find);
    };
    find();
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      setHeaderSlot(null);
    };
  }, []);
  const [attribution, setAttribution] = useState<"first" | "last">("first");
  const [sortField, setSortField] = useState<string>("mql_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drillCreative, setDrillCreative] = useState<CreativeData | null>(null);

  // Drag & drop column ordering (persisted)
  const DEFAULT_COLUMN_ORDER = [
    "creative", "spend", "lpv", "conv_page", "conv_quiz", "conv_total", "leads", "ctl", "mql_cpmql",
    "qualified_5_10k", "score", "meetings", "cost_meeting", "booking_rate", "call_conv", "sales_cac",
    "cac_sprint", "cac_assessoria", "win_rate", "revenue", "roas",
  ] as const;
  type ColumnId = (typeof DEFAULT_COLUMN_ORDER)[number];
  const COLUMN_ORDER_KEY = "creatives-tab-column-order-v1";
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_COLUMN_ORDER];
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnId[];
        const valid = parsed.filter((c) => (DEFAULT_COLUMN_ORDER as readonly string[]).includes(c)) as ColumnId[];
        // Append any new columns missing from saved order
        for (const c of DEFAULT_COLUMN_ORDER) if (!valid.includes(c)) valid.push(c);
        return valid;
      }
    } catch {}
    return [...DEFAULT_COLUMN_ORDER];
  });
  useEffect(() => {
    try { localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(columnOrder)); } catch {}
  }, [columnOrder]);
  const [draggedCol, setDraggedCol] = useState<ColumnId | null>(null);
  const moveColumn = (from: ColumnId, to: ColumnId) => {
    if (from === to) return;
    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  };

  // Filters
  const [filterOnlyActive, setFilterOnlyActive] = useState(false);
  const [filterOnlyWithSpend, setFilterOnlyWithSpend] = useState(false);
  const [filterOnlyWithLeads, setFilterOnlyWithLeads] = useState(false);
  const [filterOnlyWithMql, setFilterOnlyWithMql] = useState(false);
  const [filterOnlyWithSales, setFilterOnlyWithSales] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<"all" | "conversao" | "mql">("all");
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [campaignFilterOpen, setCampaignFilterOpen] = useState(false);
  const [selectedCreatives, setSelectedCreatives] = useState<string[]>([]);
  const [creativeFilterOpen, setCreativeFilterOpen] = useState(false);
  /**
   * Somar as linhas do MESMO criativo, juntando contas.
   *
   * RECOLHIDO POR PADRÃO, de propósito: a leitura padrão é por (conta,
   * anúncio), que é a única que pertence a alguém. A soma existe para a
   * pergunta "quanto este criativo custou no total, rodando onde rodar?", e
   * quando ligada a linha declara quantas contas juntou.
   */
  const [somarCriativos, setSomarCriativos] = useState(false);

  // Manual sales form
  const [showAddSale, setShowAddSale] = useState(false);
  const [saleForm, setSaleForm] = useState({
    sale_date: "",
    revenue: "",
    creative_key: "",
    notes: "",
    // De qual funil veio. Mídia paga é o default porque é o único que existia
    // até 03/09/2026 e ainda é a maioria.
    origem: "midia_paga" as Origem,
    lead_nome: "",
    sale_type: "sprint" as "sprint" | "assessoria" | "parceria",
    commission_pct: "",
    closer: "Caio",
    payment_type: "tcv_total" as "tcv_total" | "pix_parcelado" | "recorrencia",
    installments_count: "",
    installment_value: "",
    amount_received: "",
    delivery_months: "",
    ads_contracted: "",
    bodies_per_month: "",
    sprint_levels: "",
    // Com ele preenchido, a venda de Sprint ou Assessoria já cria o cliente no Hub.
    cliente_email: "",
  });
  const [savingSale, setSavingSale] = useState(false);

  // Sales listing
  const [salesList, setSalesList] = useState<ManualSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [showSalesList, setShowSalesList] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);


  // Meeting state
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    creative_key: "",
    notes: "",
    closer: "Caio",
    scheduled_at: "",
    origem: "midia_paga" as Origem,
    lead_nome: "",
    ...ABOBORA_VAZIO,
  });
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [showMeetingsList, setShowMeetingsList] = useState(false);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  /** Reunião aberta em leitura. Clicar na linha abre; editar é outro diálogo. */
  const [reuniaoDetalhe, setReuniaoDetalhe] = useState<Meeting | null>(null);

  // Edit states
  const [editingSale, setEditingSale] = useState<ManualSale | null>(null);
  const [editSaleForm, setEditSaleForm] = useState({
    revenue: "",
    sale_type: "sprint" as "sprint" | "assessoria" | "parceria",
    commission_pct: "",
    refunded_at: "",
    refund_amount: "",
    refund_reason: "",
    notes: "",
    origem: "midia_paga" as Origem,
    lead_nome: "",
    closer: "Caio",
    payment_type: "tcv_total" as "tcv_total" | "pix_parcelado" | "recorrencia",
    installments_count: "",
    installment_value: "",
    amount_received: "",
    delivery_months: "",
    ads_contracted: "",
    bodies_per_month: "",
    sprint_levels: "",
  });
  const [savingEditSale, setSavingEditSale] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editMeetingForm, setEditMeetingForm] = useState<
    { notes: string; status: MeetingStatus; closer: string; scheduled_at: string; origem: Origem } & AboboraCampos
  >({ notes: "", status: "agendada", closer: "Caio", scheduled_at: "", origem: "midia_paga", ...ABOBORA_VAZIO });
  const [savingEditMeeting, setSavingEditMeeting] = useState(false);
  const [togglingAttendedId, setTogglingAttendedId] = useState<string | null>(null);

  // Leads for picker
  const [leadsList, setLeadsList] = useState<LeadOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [meetingSelectedLeadId, setMeetingSelectedLeadId] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const result = await fetchAdminData("/leads", { from: startISO, to: endISO });
      setLeadsList(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error("Error loading leads:", err);
    } finally {
      setLeadsLoading(false);
    }
  }, [fetchAdminData, startISO, endISO]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const result = await fetchAdminData("/manual-sales", { from: startDateOnly, to: endDateOnly });
      setSalesList(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error("Error loading sales:", err);
    } finally {
      setSalesLoading(false);
    }
  }, [fetchAdminData, startDateOnly, endDateOnly]);

  const loadMeetings = useCallback(async () => {
    setMeetingsLoading(true);
    try {
      const result = await fetchAdminData("/meetings", { from: startISO, to: endISO });
      // Normaliza aqui, e não em cada lugar que lê: enquanto a função não
      // estiver redeployada, `status` vem indefinido e a tela mostraria toda
      // reunião como agendada.
      const lista: Meeting[] = (Array.isArray(result) ? result : []).map((m: Meeting) => ({
        ...m,
        status: m.status ?? (m.attended ? "realizada" : "agendada"),
      }));
      setMeetingsList(lista);
    } catch (err) {
      console.error("Error loading meetings:", err);
    } finally {
      setMeetingsLoading(false);
    }
  }, [fetchAdminData, startISO, endISO]);

  const handleDeleteSale = async (saleId: string) => {
    setDeletingSaleId(saleId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/manual-sales/${saleId}`, {
        method: "DELETE",
        headers: { "x-admin-token": getAdminToken() || "" },
      });
      toast({ title: "Venda removida!" });
      avisarAoVivo({ tipo: "venda", acao: "removida", por: pessoaDesteAparelho() || "alguém" });
      setSalesList(prev => prev.filter(s => s.id !== saleId));
      loadData();
    } catch {
      toast({ title: "Erro ao remover venda", variant: "destructive" });
    } finally {
      setDeletingSaleId(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from: startISO,
        to: endISO,
        attribution,
        from_date: startDateOnly,
        to_date: endDateOnly,
      };
      if (campaignTypeFilter !== "all") {
        params.campaign_type = campaignTypeFilter === "mql" ? "mql" : "lead";
      }
      if (selectedCampaigns.length > 0) {
        params.campaigns = selectedCampaigns.join("|||");
      }
      const result = await fetchAdminData("/creatives", params);
      setData(result);
    } catch (err) {
      console.error("Error loading creatives:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData, startISO, endISO, startDateOnly, endDateOnly, attribution, campaignTypeFilter, selectedCampaigns]);

  useEffect(() => {
    let cancelled = false;

    // As quatro rodam JUNTAS. Antes era um `await` atrás do outro e o tempo da
    // aba era a SOMA das quatro rotas — dava para ver na tela cada bloco
    // aparecendo na vez dele (total, depois MQL, depois reuniões, depois
    // vendas). Nenhuma delas depende do resultado da anterior, então a espera
    // passa a ser a da rota mais lenta, não a do somatório.
    //
    // O pool de requisições (`runPooled`) tem quatro vagas, então as quatro
    // saem de fato ao mesmo tempo. `allSettled` para uma falha não derrubar as
    // outras: cada carregador já trata o próprio erro.
    const loadInitialData = async () => {
      if (cancelled) return;
      await Promise.allSettled([loadData(), loadSales(), loadLeads(), loadMeetings()]);
    };

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [loadData, loadSales, loadLeads, loadMeetings]);

  useEffect(() => {
    if (showMeetingsList) {
      loadMeetings();
    }
  }, [showMeetingsList, loadMeetings]);


  // ── A meta do período filtrado ────────────────────────────────────────────
  //
  // A meta deixou de morar só numa aba própria: ela agora anda ao lado de cada
  // KPI, rateada para o mesmo intervalo que a tela está mostrando. Comparar "12
  // MQL no filtro que estou olhando" com "151 no mês" não respondia nada.
  //
  // O rateio é por dias ÚTEIS para o funil e por dias CORRIDOS para mídia,
  // exatamente como nas semanas — setembro tem semanas de 3, 4 e 5 dias úteis, e
  // dividir por dias iguais faria o time parecer atrasado sem nada ter mudado.
  const [metaPeriodo, setMetaPeriodo] = useState<{
    metas: Record<string, number | null>;
    dias_uteis: number;
    meses_sem_meta: string[];
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetchAdminData("/metas-periodo", { from: startDateOnly, to: endDateOnly });
        if (vivo) setMetaPeriodo(r);
      } catch {
        if (vivo) setMetaPeriodo(null);
      }
    })();
    return () => { vivo = false; };
  }, [fetchAdminData, startDateOnly, endDateOnly]);

  // Outro painel mexeu em venda ou reunião: recarrega. Venda e reunião mudam
  // métrica, funil, margem e meta de uma vez, então não dá para remendar o
  // estado local na mão — é mais barato e mais seguro buscar de novo.
  useEffect(() => {
    return assinarAoVivo((e) => {
      if (e.tipo !== "venda" && e.tipo !== "reuniao") return;
      loadData();
      if (showSalesList) loadSales();
      if (showMeetingsList) loadMeetings();
    });
  }, [loadData, loadSales, loadMeetings, showSalesList, showMeetingsList]);

  /** A meta de uma linha para o período filtrado, ou null quando não há. */
  const metaDe = useCallback(
    (chave: string): number | null => metaPeriodo?.metas?.[chave] ?? null,
    [metaPeriodo],
  );

  /**
   * Choque de agenda com o que a tela já tem em memória.
   *
   * O bloqueio de verdade é no servidor — a lista aqui só cobre o período
   * filtrado, e uma call daqui a duas semanas não estaria nela. Este aviso
   * existe para o SDR ver o problema ANTES de clicar, não para garantir a regra.
   */
  const INTERVALO_MINIMO_MS = 3 * 60 * 60 * 1000;
  const choqueDeAgenda = (quandoLocal: string, closer: string, ignorarId?: string) => {
    if (!quandoLocal) return null;
    const alvo = new Date(quandoLocal).getTime();
    if (Number.isNaN(alvo)) return null;
    return meetingsList.find((m) => {
      if (!m.scheduled_at || m.id === ignorarId) return false;
      if (m.closer && closer && m.closer !== closer) return false;
      if (m.status === "no_show") return false;
      const t = new Date(m.scheduled_at).getTime();
      return Math.abs(t - alvo) < INTERVALO_MINIMO_MS;
    }) || null;
  };

  /**
   * A observação, sem o nome do lead colado na frente.
   *
   * O formulário grava `notes` como "Nome do lead — observação", porque a
   * coluna nasceu sendo o único lugar que sabia de quem era a reunião. Agora o
   * nome vem resolvido do banco, então a observação volta a ser só observação —
   * e reunião sem observação nenhuma mostra "—" em vez de repetir o nome.
   */
  const soObservacao = (m: Meeting): string => {
    const bruto = (m.notes || "").trim();
    if (!bruto) return "";
    const nome = (m.lead_nome_resolvido || "").trim();
    if (nome && bruto.startsWith(nome)) {
      return bruto.slice(nome.length).replace(/^\s*—\s*/, "").trim();
    }
    const partes = bruto.split(" — ");
    return partes.length > 1 ? partes.slice(1).join(" — ").trim() : "";
  };

  // O que ainda falta no Processo Abóbora do formulário aberto. Recalculado a
  // cada tecla porque é ele que libera o botão de registrar.
  const faltasDoAbobora = faltasNoAbobora(meetingForm);

  // Na EDIÇÃO a regra é outra. Reunião registrada antes de 03/09/2026 não tem
  // Abóbora nenhum, e exigi-lo travaria até a correção de uma data. Então o
  // bloco só passa a valer quando alguém escreve alguma coisa nele.
  const aboboraTocadoNaEdicao =
    !!editMeetingForm.abobora_posicao.trim() ||
    !!editMeetingForm.abobora_segmento.trim() ||
    !!editMeetingForm.abobora_decide ||
    !!editMeetingForm.abobora_quem_decide.trim() ||
    !!editMeetingForm.abobora_investimento.trim();

  const selectedSaleLead = selectedLeadId ? leadsList.find(l => l.id === selectedLeadId) : null;
  const selectedMeetingLead = meetingSelectedLeadId ? leadsList.find(l => l.id === meetingSelectedLeadId) : null;

  const handleAddSale = async () => {
    if (!saleForm.revenue) {
      toast({ title: "Preencha a receita", variant: "destructive" });
      return;
    }
    const semFormulario = precisaNomeManual(saleForm.origem);
    // Mídia paga continua exigindo o lead: é dele que saem o criativo e a data
    // de entrada, sem os quais não há atribuição nem ciclo de vendas. Indicação
    // e social selling não têm lead nenhum para exigir — exigir era exatamente
    // o que mantinha esses dois funis fora do sistema.
    if (!semFormulario && !selectedLeadId) {
      toast({ title: "Selecione o lead da venda", description: "Necessário para calcular o ciclo de vendas", variant: "destructive" });
      return;
    }
    if (semFormulario && !saleForm.lead_nome.trim()) {
      toast({ title: "Informe o nome do cliente", variant: "destructive" });
      return;
    }
    const clienteEmail = saleForm.cliente_email.trim().toLowerCase();
    if (clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clienteEmail)) {
      toast({ title: "E-mail do cliente inválido", variant: "destructive" });
      return;
    }
    setSavingSale(true);
    try {
      const lead = semFormulario ? null : selectedSaleLead;
      const ck = lead?.utm_content ? normalizeCreativeKey(lead.utm_content) : "";
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const nome = lead ? lead.nome_completo : saleForm.lead_nome.trim();
      const venda = await fetchAdminData("/manual-sales", {
        _method: "POST",
        sale_date: today,
        revenue: saleForm.revenue,
        creative_key: ck,
        utm_content: lead?.utm_content || "",
        origem: saleForm.origem,
        lead_nome: semFormulario ? saleForm.lead_nome.trim() : "",
        notes: nome ? `${nome}${saleForm.notes ? ` — ${saleForm.notes}` : ""}` : (saleForm.notes || "Venda sem lead"),
        lead_id: lead?.id || "",
        sale_type: saleForm.sale_type,
        commission_pct: saleForm.sale_type === "parceria" ? saleForm.commission_pct : "",
        // Só faz sentido em Sprint; em assessoria vai vazio e o backend grava nulo.
        sprint_levels: saleForm.sale_type === "sprint" ? saleForm.sprint_levels : "",
        closer: saleForm.closer,
        payment_type: saleForm.payment_type,
        installments_count: saleForm.installments_count,
        installment_value: saleForm.installment_value,
        amount_received: saleForm.amount_received,
        delivery_months: saleForm.delivery_months,
        ads_contracted: saleForm.ads_contracted,
        bodies_per_month: saleForm.bodies_per_month,
        cliente_email: saleForm.sale_type === "parceria" ? "" : clienteEmail,
        cliente_nome: nome || "",
        cliente_whatsapp: lead?.whatsapp || "",
      });
      const hub = (venda as { hub?: { ok?: boolean; ja_existia?: boolean; erro?: string; avisos?: string[] } | null })?.hub;
      if (!hub) {
        toast({ title: "Venda registrada!" });
      } else if (!hub.ok) {
        toast({ title: "Venda registrada, mas o cliente não entrou no Hub", description: hub.erro, variant: "destructive" });
      } else if (hub.ja_existia) {
        toast({ title: "Venda registrada!", description: "Esse e-mail já era cliente no Hub: nada novo foi criado." });
      } else {
        toast({
          title: "Venda registrada e cliente criado no Hub!",
          description: hub.avisos?.length ? hub.avisos.join(" · ") : undefined,
        });
      }
      avisarAoVivo({ tipo: "venda", acao: "criada", por: pessoaDesteAparelho() || "alguém" });
      setSaleForm({ sale_date: "", revenue: "", creative_key: "", notes: "", origem: "midia_paga", lead_nome: "", sale_type: "sprint", commission_pct: "", closer: "Caio", payment_type: "tcv_total", installments_count: "", installment_value: "", amount_received: "", delivery_months: "", ads_contracted: "", bodies_per_month: "", sprint_levels: "", cliente_email: "" });
      setSelectedLeadId(null);
      setShowAddSale(false);
      loadData();
      loadSales();
    } catch {
      toast({ title: "Erro ao salvar venda", variant: "destructive" });
    } finally {
      setSavingSale(false);
    }
  };

  const handleAddMeeting = async () => {
    const semFormulario = precisaNomeManual(meetingForm.origem);
    if (!semFormulario && !meetingSelectedLeadId) {
      toast({ title: "Selecione um lead", variant: "destructive" });
      return;
    }
    if (semFormulario && !meetingForm.lead_nome.trim()) {
      toast({ title: "Informe o nome do lead", variant: "destructive" });
      return;
    }
    const faltas = faltasNoAbobora(meetingForm);
    if (faltas.length > 0) {
      toast({
        title: "Processo Abóbora incompleto",
        description: `Falta responder: ${faltas.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    setSavingMeeting(true);
    try {
      const lead = semFormulario ? null : selectedMeetingLead!;
      const ck = lead?.utm_content ? normalizeCreativeKey(lead.utm_content) : "";
      const nome = lead ? lead.nome_completo : meetingForm.lead_nome.trim();
      await fetchAdminData("/meetings", {
        _method: "POST",
        creative_key: ck,
        utm_content: lead?.utm_content || "",
        notes: `${nome}${meetingForm.notes ? ` — ${meetingForm.notes}` : ""}`,
        lead_id: lead?.id || "",
        lead_nome: semFormulario ? meetingForm.lead_nome.trim() : "",
        origem: meetingForm.origem,
        closer: meetingForm.closer,
        // Nasce agendada. Quem marca a call de sexta na segunda não pode
        // derrubar o comparecimento do mês antes de a reunião existir.
        status: "agendada",
        scheduled_at: meetingForm.scheduled_at ? new Date(meetingForm.scheduled_at).toISOString() : "",
        abobora_posicao: meetingForm.abobora_posicao,
        abobora_segmento: meetingForm.abobora_segmento,
        abobora_decide: meetingForm.abobora_decide,
        abobora_quem_decide: meetingForm.abobora_quem_decide,
        abobora_investimento: meetingForm.abobora_investimento,
      });
      toast({ title: "Reunião agendada!" });
      avisarAoVivo({ tipo: "reuniao", acao: "criada", por: pessoaDesteAparelho() || "alguém" });
      setMeetingForm({ creative_key: "", notes: "", closer: "Caio", scheduled_at: "", origem: "midia_paga", lead_nome: "", ...ABOBORA_VAZIO });
      setMeetingSelectedLeadId(null);
      setShowAddMeeting(false);
      loadData();
      loadMeetings();
    } catch (err) {
      // O backend recusa Abóbora incompleto com 422 e a lista do que falta.
      // Mostrar essa lista é o que evita o SDR ficar tentando de novo às cegas.
      //
      // 409 com "já tem call agendada" é a trava de reunião duplicada: o lead de
      // faixa alta marca sozinho em /agendar, o SDR não vê e registra por cima.
      // O título precisa dizer que NÃO é erro de sistema, é reunião que já
      // existe — senão o SDR tenta de novo.
      const msg = err instanceof Error ? err.message : "";
      const duplicada = /já tem call agendada/i.test(msg);
      toast({
        title: duplicada ? "Este lead já tem call marcada" : "Erro ao salvar reunião",
        description: msg || undefined,
        variant: "destructive",
      });
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    setDeletingMeetingId(meetingId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/meetings/${meetingId}`, {
        method: "DELETE",
        headers: { "x-admin-token": getAdminToken() || "" },
      });
      toast({ title: "Reunião removida!" });
      avisarAoVivo({ tipo: "reuniao", acao: "removida", por: pessoaDesteAparelho() || "alguém" });
      setMeetingsList(prev => prev.filter(m => m.id !== meetingId));
      loadData();
    } catch {
      toast({ title: "Erro ao remover reunião", variant: "destructive" });
    } finally {
      setDeletingMeetingId(null);
    }
  };

  const handleEditSale = async () => {
    if (!editingSale) return;
    setSavingEditSale(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/manual-sales/${editingSale.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({
          revenue: editSaleForm.revenue,
          sale_type: editSaleForm.sale_type,
          commission_pct: editSaleForm.sale_type === "parceria" ? editSaleForm.commission_pct : "",
          refunded_at: editSaleForm.refunded_at,
          refund_amount: editSaleForm.refund_amount,
          refund_reason: editSaleForm.refund_reason,
          notes: editSaleForm.notes,
          closer: editSaleForm.closer,
          origem: editSaleForm.origem,
          lead_nome: editSaleForm.lead_nome,
          payment_type: editSaleForm.payment_type,
          installments_count: editSaleForm.installments_count,
          installment_value: editSaleForm.installment_value,
          amount_received: editSaleForm.amount_received,
          delivery_months: editSaleForm.delivery_months,
          ads_contracted: editSaleForm.ads_contracted,
          bodies_per_month: editSaleForm.bodies_per_month,
          sprint_levels: editSaleForm.sale_type === "sprint" ? editSaleForm.sprint_levels : "",
        }),
      });
      toast({ title: "Venda atualizada!" });
      avisarAoVivo({ tipo: "venda", acao: "atualizada", por: pessoaDesteAparelho() || "alguém" });
      setSalesList(prev => prev.map(s => s.id === editingSale.id ? {
        ...s,
        revenue: parseFloat(editSaleForm.revenue),
        sale_type: editSaleForm.sale_type,
        notes: editSaleForm.notes,
        closer: editSaleForm.closer,
        payment_type: editSaleForm.payment_type,
        installments_count: editSaleForm.installments_count ? parseInt(editSaleForm.installments_count) : null,
        installment_value: editSaleForm.installment_value ? parseFloat(editSaleForm.installment_value) : null,
        amount_received: editSaleForm.amount_received ? parseFloat(editSaleForm.amount_received) : 0,
        delivery_months: editSaleForm.delivery_months ? parseFloat(editSaleForm.delivery_months) : null,
        ads_contracted: editSaleForm.ads_contracted ? parseInt(editSaleForm.ads_contracted, 10) : null,
        bodies_per_month: editSaleForm.bodies_per_month ? parseInt(editSaleForm.bodies_per_month, 10) : null,
      } : s));
      setEditingSale(null);
      loadData();
    } catch {
      toast({ title: "Erro ao atualizar venda", variant: "destructive" });
    } finally {
      setSavingEditSale(false);
    }
  };

  const handleEditMeeting = async () => {
    if (!editingMeeting) return;
    setSavingEditMeeting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/meetings/${editingMeeting.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({
          // Reunião sem lead no banco e sem `lead_nome` tem o nome guardado
          // APENAS no começo da observação (linhas antigas). Salvar só a
          // observação apagaria a única identidade que ela tem, para sempre.
          notes: (!editingMeeting.lead_id && !editingMeeting.lead_nome && editingMeeting.lead_nome_resolvido)
            ? `${editingMeeting.lead_nome_resolvido}${editMeetingForm.notes ? ` — ${editMeetingForm.notes}` : ""}`
            : editMeetingForm.notes,
          status: editMeetingForm.status,
          closer: editMeetingForm.closer,
          origem: editMeetingForm.origem,
          scheduled_at: editMeetingForm.scheduled_at ? new Date(editMeetingForm.scheduled_at).toISOString() : null,
          // O Abóbora só viaja quando alguém mexeu nele. Mandar sempre faria o
          // backend validar as reuniões anteriores a 03/09/2026, que não têm
          // essas respostas e nunca vão ter — e nenhuma delas poderia mais ser
          // editada, nem para corrigir a data.
          ...(aboboraTocadoNaEdicao ? {
            abobora_posicao: editMeetingForm.abobora_posicao,
            abobora_segmento: editMeetingForm.abobora_segmento,
            abobora_decide: editMeetingForm.abobora_decide,
            abobora_quem_decide: editMeetingForm.abobora_quem_decide,
            abobora_investimento: editMeetingForm.abobora_investimento,
          } : {}),
        }),
      });
      toast({ title: "Reunião atualizada!" });
      avisarAoVivo({ tipo: "reuniao", acao: "atualizada", por: pessoaDesteAparelho() || "alguém" });
      setMeetingsList(prev => prev.map(m => m.id === editingMeeting.id ? {
        ...m,
        notes: editMeetingForm.notes,
        status: editMeetingForm.status,
        attended: editMeetingForm.status === "realizada",
        closer: editMeetingForm.closer,
        origem: editMeetingForm.origem,
        scheduled_at: editMeetingForm.scheduled_at ? new Date(editMeetingForm.scheduled_at).toISOString() : null,
        ...(aboboraTocadoNaEdicao ? {
          abobora_posicao: editMeetingForm.abobora_posicao,
          abobora_segmento: editMeetingForm.abobora_segmento,
          abobora_decide: editMeetingForm.abobora_decide,
          abobora_quem_decide: editMeetingForm.abobora_quem_decide,
          abobora_investimento: editMeetingForm.abobora_investimento,
          abobora_completa: faltasNoAbobora(editMeetingForm).length === 0,
        } : {}),
      } : m));
      setEditingMeeting(null);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({ title: "Erro ao atualizar reunião", description: msg || undefined, variant: "destructive" });
    } finally {
      setSavingEditMeeting(false);
    }
  };

  /** Agendada → Realizada → No-show → Agendada. Um clique resolve o caso comum. */
  const proximoStatus = (s: MeetingStatus): MeetingStatus =>
    s === "agendada" ? "realizada" : s === "realizada" ? "no_show" : "agendada";

  const handleCycleStatus = async (meeting: Meeting) => {
    const novo = proximoStatus(meeting.status || "agendada");

    // Virar "realizada" sem venda e sem motivo é recusado pelo backend (422).
    // Em vez de deixar o closer levar o erro, o painel já abre a reunião no
    // ponto onde o desfecho é escrito. Reunião com venda não passa por aqui:
    // o backend dispensa o motivo quando existe venda ligada ao lead.
    if (novo === "realizada" && !meeting.motivo_categoria && !salesList.some((v) => v.lead_id && v.lead_id === meeting.lead_id && !v.refunded_at)) {
      setReuniaoDetalhe(meeting);
      toast({
        title: "Falta o motivo",
        description: "Escolha o desfecho da call para marcar como realizada.",
      });
      return;
    }

    setTogglingAttendedId(meeting.id);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetchAdmin(`${supabaseUrl}/functions/v1/admin-data/meetings/${meeting.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      setMeetingsList(prev => prev.map(m => m.id === meeting.id ? { ...m, status: novo, attended: novo === "realizada" } : m));
      loadData();
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    } finally {
      setTogglingAttendedId(null);
    }
  };

  const [sendingCapiRetro, setSendingCapiRetro] = useState<string | null>(null);

  const handleCapiRetroactive = async (type: "meetings" | "tiers" | "purchases" | "mqls") => {
    setSendingCapiRetro(type);
    try {
      const result = await fetchAdminData(`/capi-retroactive-${type}`, { _method: "POST" });
      toast({
        title: `CAPI ${type} retroativo concluído`,
        description: `Enviados: ${result.sent}, Falhas: ${result.failed}${result.skipped != null ? `, Ignorados: ${result.skipped}` : ""} (Total: ${result.total})`,
      });
    } catch {
      toast({ title: `Erro ao enviar CAPI ${type}`, variant: "destructive" });
    } finally {
      setSendingCapiRetro(null);
    }
  };


  // Extract unique campaign names for filter
  const allCampaignNames = useMemo(() => {
    const names = new Set<string>();
    (data?.creatives || []).forEach(c => c.campaigns.forEach(camp => names.add(camp)));
    return Array.from(names).sort();
  }, [data]);

  const toggleCampaign = (camp: string) => {
    setSelectedCampaigns(prev =>
      prev.includes(camp) ? prev.filter(c => c !== camp) : [...prev, camp]
    );
  };

  // Extract unique creative keys for filter
  const allCreativeKeys = useMemo(() => {
    const keys = new Set<string>();
    (data?.creatives || []).forEach(c => {
      if (c.creative_key) keys.add(c.creative_key);
    });
    return Array.from(keys).sort();
  }, [data]);

  const toggleCreative = (key: string) => {
    setSelectedCreatives(prev =>
      prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]
    );
  };

  // ── As LINHAS da tabela: por (conta, anúncio), ou somadas por criativo ──
  //
  // O backend devolve uma linha por par (conta, anúncio) — a única leitura que
  // pertence a alguém. `somarCriativos` liga a soma por criativo, que junta
  // contas DE PROPÓSITO e diz quantas juntou. Recolhida por padrão: era a soma
  // silenciosa que fazia o experimento das 3 contas ser lido por um número de
  // ninguém.
  const linhasDeCriativo = useMemo<CreativeData[]>(() => {
    const brutas = data?.creatives || [];
    if (!somarCriativos) return brutas;
    return somarPorCriativo(brutas as unknown as LinhaCriativoSomavel[]) as unknown as CreativeData[];
  }, [data?.creatives, somarCriativos]);

  // ── Per-creative extras: CAC by type, win rate, sales cycle, call→sale conversion ──
  const creativeExtrasRaw = useMemo(() => {
    const map = new Map<string, {
      cacSprint: number | null;
      cacAssessoria: number | null;
      winRate: number | null;
      cycleDays: number | null;
      cycleCount: number;
      callConvRate: number | null;
      bookingRate: number | null;
    }>();

    for (const c of linhasDeCriativo) {
      const sprintCount = c.sales_sprint_count || 0;
      const assesCount = c.sales_assessoria_count || 0;
      const cacSprint = sprintCount > 0 && c.spend > 0 ? c.spend / sprintCount : null;
      const cacAssessoria = assesCount > 0 && c.spend > 0 ? c.spend / assesCount : null;
      const winRate = c.mql_count > 0 ? (c.mql_compraram ?? 0) / c.mql_count : null;

      const days: number[] = [];
      for (const s of salesList) {
        if (!s.creative_key || s.creative_key !== c.creative_key) continue;
        if (!s.lead_created_at || !s.sale_date) continue;
        const leadDate = new Date(s.lead_created_at);
        const saleDate = new Date(s.sale_date + "T12:00:00Z");
        if (isNaN(leadDate.getTime()) || isNaN(saleDate.getTime())) continue;
        days.push(Math.max(0, Math.round((saleDate.getTime() - leadDate.getTime()) / 86400000)));
      }
      const cycleDays = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;
      // Taxas medidas sobre a COORTE: dos MQL que entraram no período, quantos
      // agendaram, compareceram e compraram — não importa em que dia isso
      // aconteceu. Dividir "reuniões do período" por "MQL do período" mistura
      // dois grupos e produz taxa acima de 100%, que foi o bug do Caio Case #4.
      const bookingRate = c.mql_count > 0 ? (c.mql_agendaram ?? 0) / c.mql_count : null;
      const callConvRate = (c.mql_compareceram ?? 0) > 0
        ? (c.mql_compraram ?? 0) / (c.mql_compareceram as number)
        : null;

      // Chaveado pela LINHA, não pelo criativo: duas linhas de contas
      // diferentes compartilham `creative_key`, e uma sobrescreveria a outra —
      // as duas mostrariam o CAC e o win rate de uma conta só.
      map.set(chaveDaLinha(c), { cacSprint, cacAssessoria, winRate, cycleDays, cycleCount: days.length, callConvRate, bookingRate });
    }
    return map;
  }, [linhasDeCriativo, salesList]);

  const creatives = linhasDeCriativo
    .filter(c => {
      if (filterOnlyActive && !c.is_active) return false;
      if (filterOnlyWithSpend && c.spend <= 0) return false;
      if (filterOnlyWithLeads && c.leads_count <= 0) return false;
      if (filterOnlyWithMql && c.mql_count <= 0) return false;
      if (filterOnlyWithSales && c.sales_count <= 0) return false;
      if (selectedCampaigns.length > 0 && !c.campaigns.some(camp => selectedCampaigns.includes(camp))) return false;
      if (selectedCreatives.length > 0 && !selectedCreatives.includes(c.creative_key)) return false;
      return true;
    })
    .sort((a, b) => {
      const getValue = (c: CreativeData) => {
        if (sortField === "cpl") return c.spend > 0 && c.leads_count > 0 ? c.spend / c.leads_count : null;
        if (sortField === "ctl") return c.clicks > 0 ? (c.leads_count / c.clicks) * 100 : null;
        if (sortField === "conv_page") return (c.sessions_count || 0) > 0 ? ((c.quiz_views_count || 0) / (c.sessions_count || 1)) * 100 : null;
        if (sortField === "conv_quiz") return (c.quiz_views_count || 0) > 0 ? (c.leads_count / (c.quiz_views_count || 1)) * 100 : null;
        if (sortField === "conv_total") return (c.sessions_count || 0) > 0 ? (c.leads_count / (c.sessions_count || 1)) * 100 : null;
        if (sortField === "cost_meeting") return c.meetings_attended_count > 0 ? c.spend / c.meetings_attended_count : null;
        const extras = creativeExtrasRaw.get(chaveDaLinha(c));
        if (sortField === "call_conv_rate") return extras?.callConvRate ?? null;
        if (sortField === "booking_rate") return extras?.bookingRate ?? null;
        if (sortField === "cac_sprint") return extras?.cacSprint ?? null;
        if (sortField === "cac_assessoria") return extras?.cacAssessoria ?? null;
        if (sortField === "win_rate") return extras?.winRate ?? null;
        if (sortField === "cycle_days") return extras?.cycleDays ?? null;
        return (c as any)[sortField] ?? null;
      };
      const aVal = getValue(a) ?? -Infinity;
      const bVal = getValue(b) ?? -Infinity;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

  // Find top creatives
  const topMql = creatives.length > 0 ? creatives.reduce((best, c) => c.mql_count > best.mql_count ? c : best, creatives[0]) : null;
  const topRevenue = creatives.length > 0 ? creatives.reduce((best, c) => c.revenue > best.revenue ? c : best, creatives[0]) : null;
  const topSales = creatives.length > 0 ? creatives.reduce((best, c) => c.sales_count > best.sales_count ? c : best, creatives[0]) : null;
  const topMeetings = creatives.length > 0 ? creatives.reduce((best, c) => c.meetings_count > best.meetings_count ? c : best, creatives[0]) : null;
  const bestCpmql = creatives.filter(c => c.cost_per_mql !== null && c.cost_per_mql > 0).sort((a, b) => (a.cost_per_mql || Infinity) - (b.cost_per_mql || Infinity))[0] || null;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3 inline ml-1" /> : <ChevronUp className="w-3 h-3 inline ml-1" />;
  };

  const totals = data?.totals;
  const dq = data?.data_quality;

  const creativeExtras = creativeExtrasRaw;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const advancedFiltersActive =
    filterOnlyActive || filterOnlyWithSpend || filterOnlyWithLeads || filterOnlyWithMql || filterOnlyWithSales;
  const advancedFiltersActiveCount = [
    filterOnlyActive, filterOnlyWithSpend, filterOnlyWithLeads, filterOnlyWithMql, filterOnlyWithSales,
  ].filter(Boolean).length;
  const anyFilterActive =
    advancedFiltersActive || selectedCampaigns.length > 0 || selectedCreatives.length > 0 ||
    campaignTypeFilter !== "all" || attribution !== "first";
  const clearAllFilters = () => {
    setAttribution("first");
    setCampaignTypeFilter("all");
    setFilterOnlyActive(false);
    setFilterOnlyWithSpend(false);
    setFilterOnlyWithLeads(false);
    setFilterOnlyWithMql(false);
    setFilterOnlyWithSales(false);
    setSelectedCampaigns([]);
    setSelectedCreatives([]);
  };

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Grupo 1: como agrupar/atribuir os dados */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={attribution} onValueChange={(v) => setAttribution(v as "first" | "last")}>
            <SelectTrigger className="w-[188px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">Atribuição: First Touch</SelectItem>
              <SelectItem value="last">Atribuição: Last Touch</SelectItem>
            </SelectContent>
          </Select>

          <Select value={campaignTypeFilter} onValueChange={(v) => setCampaignTypeFilter(v as "all" | "conversao" | "mql")}>
            <SelectTrigger className="w-[178px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Campanha: Todas</SelectItem>
              <SelectItem value="conversao">Campanha: Conversão</SelectItem>
              <SelectItem value="mql">Campanha: MQL</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="hidden sm:block w-px h-6 bg-border" />

        {/* Grupo 2: recorte de quais criativos/campanhas entram na lista */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={advancedFiltersActive ? "default" : "outline"}
            size="sm"
            className="relative"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            Filtros{advancedFiltersActiveCount > 0 ? ` (${advancedFiltersActiveCount})` : ""}
            {showAdvancedFilters ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>

        {/* Campaign name filter */}
        {allCampaignNames.length > 0 && (
          <Popover open={campaignFilterOpen} onOpenChange={setCampaignFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={selectedCampaigns.length > 0 ? "default" : "outline"}
                size="sm"
                className="min-w-[170px] justify-between font-normal"
              >
                {selectedCampaigns.length > 0 ? (
                  <span className="truncate">{selectedCampaigns.length} campanha{selectedCampaigns.length > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-muted-foreground">Filtrar campanhas</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar campanha..." />
                <CommandList>
                  <CommandEmpty>Nenhuma campanha encontrada.</CommandEmpty>
                  <CommandGroup>
                    {allCampaignNames.map(camp => (
                      <CommandItem key={camp} value={camp} onSelect={() => toggleCampaign(camp)}>
                        <Check className={`mr-2 h-4 w-4 ${selectedCampaigns.includes(camp) ? "opacity-100" : "opacity-0"}`} />
                        <span className="truncate text-xs">{camp}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              {selectedCampaigns.length > 0 && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedCampaigns([])}>
                    <X className="w-3 h-3 mr-1" /> Limpar filtro
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Creative key filter */}
        {allCreativeKeys.length > 0 && (
          <Popover open={creativeFilterOpen} onOpenChange={setCreativeFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={selectedCreatives.length > 0 ? "default" : "outline"}
                size="sm"
                className="min-w-[170px] justify-between font-normal"
              >
                {selectedCreatives.length > 0 ? (
                  <span className="truncate">{selectedCreatives.length} criativo{selectedCreatives.length > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-muted-foreground">Filtrar criativos</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar criativo..." />
                <CommandList>
                  <CommandEmpty>Nenhum criativo encontrado.</CommandEmpty>
                  <CommandGroup>
                    {allCreativeKeys.map(key => (
                      <CommandItem key={key} value={key} onSelect={() => toggleCreative(key)}>
                        <Check className={`mr-2 h-4 w-4 ${selectedCreatives.includes(key) ? "opacity-100" : "opacity-0"}`} />
                        <span className="truncate text-xs">{key}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              {selectedCreatives.length > 0 && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedCreatives([])}>
                    <X className="w-3 h-3 mr-1" /> Limpar filtro
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
        </div>

        {anyFilterActive && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearAllFilters}>
            <X className="w-3 h-3 mr-1" /> Limpar todos os filtros
          </Button>
        )}

        {/* Ações foram movidas para o header global (#admin-header-actions-slot) via portal abaixo. */}
      </div>

      {/* Portal: ações renderizadas no header do /admin, ao lado do seletor de datas */}
      {headerSlot &&
        createPortal(
          <>
            {/* O PLACAR DO PERÍODO, colado nos botões que registram.
                Pedido em 16/09/2026. Reuniões e vendas já existiam na aba, mas
                em pontas opostas dela: "Ver reuniões" na terceira fileira e
                "Ver vendas" lá embaixo no card de Total. Para olhar as duas
                era preciso rolar a aba inteira duas vezes, e é justamente o
                que o time olha o dia todo.

                Não custa requisição nenhuma: `salesList` e `meetingsList` já
                são carregadas no mount junto com o resto da aba. E segue o
                filtro de período vigente, sem regra própria.

                Reembolso é estado, não exclusão — a venda reembolsada sai da
                contagem e do TCV aqui, igual ao resto do painel, e aparece
                marcada na lista para não sumir do histórico. */}
            {(() => {
              const vendas = salesList.filter((s) => !s.refunded_at);
              const tcv = vendas.reduce((n, s) => n + Number(s.revenue || 0), 0);
              const recebido = vendas.reduce((n, s) => n + Number(s.amount_received || 0), 0);
              const realizadas = meetingsList.filter((m) => m.status === "realizada").length;
              const aAcontecer = meetingsList.filter((m) => m.status === "agendada").length;
              const reunioesOrdenadas = [...meetingsList].sort((a, b) =>
                (b.scheduled_at || b.created_at).localeCompare(a.scheduled_at || a.created_at));
              const vendasOrdenadas = [...salesList].sort((a, b) => b.sale_date.localeCompare(a.sale_date));
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs gap-2 border border-border/70"
                      title="Reuniões e vendas do período filtrado"
                    >
                      <span className="flex items-center gap-1 text-orange-400 font-semibold tabular-nums">
                        <Calendar className="w-3.5 h-3.5" />
                        {meetingsList.length}
                      </span>
                      <span className="w-px h-3.5 bg-border/70" />
                      <span className="text-emerald-400 font-semibold tabular-nums">{vendas.length}</span>
                      <span className="hidden sm:inline text-muted-foreground tabular-nums">
                        {formatCurrency(tcv) || "—"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(92vw,460px)] max-h-[72vh] overflow-y-auto p-0">
                    <div className="p-3 border-b border-border/60">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        No período filtrado
                      </p>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reuniões</p>
                          <p className="text-lg font-bold text-orange-400 leading-tight tabular-nums">
                            {meetingsList.length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {realizadas} realizada{realizadas === 1 ? "" : "s"}
                            {aAcontecer > 0 ? ` · ${aAcontecer} por acontecer` : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vendas</p>
                          <p className="text-lg font-bold text-emerald-400 leading-tight tabular-nums">
                            {vendas.length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatCurrency(tcv) || "—"} de TCV · {formatCurrency(recebido) || "—"} recebido
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 border-b border-border/60">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Reuniões
                      </p>
                      {reunioesOrdenadas.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">Nenhuma reunião no período.</p>
                      ) : (
                        <div className="space-y-1">
                          {reunioesOrdenadas.slice(0, 8).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setReuniaoDetalhe(m)}
                              className="w-full flex items-center gap-2 text-left rounded px-1.5 py-1 hover:bg-muted/50"
                            >
                              <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap w-20">
                                {format(new Date(m.scheduled_at || m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                              <span className="text-xs truncate flex-1 min-w-0">
                                {m.lead_nome_resolvido || "sem nome"}
                              </span>
                              <span
                                className={`text-[9px] uppercase tracking-wider whitespace-nowrap ${
                                  m.status === "realizada"
                                    ? "text-emerald-400"
                                    : m.status === "no_show"
                                      ? "text-rose-400"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {m.status === "realizada" ? "realizada" : m.status === "no_show" ? "no-show" : "agendada"}
                              </span>
                            </button>
                          ))}
                          {reunioesOrdenadas.length > 8 && (
                            <p className="text-[10px] text-muted-foreground px-1.5 pt-1">
                              e mais {reunioesOrdenadas.length - 8} · a lista inteira fica em "Ver reuniões"
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Vendas
                      </p>
                      {vendasOrdenadas.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">Nenhuma venda no período.</p>
                      ) : (
                        <div className="space-y-1">
                          {vendasOrdenadas.slice(0, 8).map((s) => (
                            <div key={s.id} className="flex items-center gap-2 px-1.5 py-1">
                              <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap w-20">
                                {format(new Date(s.sale_date + "T12:00:00"), "dd/MM", { locale: ptBR })}
                              </span>
                              <span className="text-xs truncate flex-1 min-w-0">
                                {s.lead_nome_resolvido || s.lead_nome || "sem nome"}
                                <span className="text-[10px] text-muted-foreground ml-1">
                                  {s.sale_type === "assessoria" ? "assessoria" : s.sale_type === "parceria" ? "parceria" : "sprint"}
                                </span>
                                {s.refunded_at && (
                                  <span className="text-[10px] text-rose-400 ml-1">reembolsada</span>
                                )}
                              </span>
                              <span
                                className={`text-xs font-semibold tabular-nums whitespace-nowrap ${
                                  s.refunded_at ? "text-muted-foreground line-through" : "text-emerald-400"
                                }`}
                              >
                                {formatCurrency(Number(s.revenue || 0))}
                              </span>
                            </div>
                          ))}
                          {vendasOrdenadas.length > 8 && (
                            <p className="text-[10px] text-muted-foreground px-1.5 pt-1">
                              e mais {vendasOrdenadas.length - 8} · a lista inteira fica em "Ver vendas"
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })()}
            {/* Um grupo só, encostado, em vez de três botões soltos de pesos
                diferentes. Reunião e Venda são as duas ações que o time faz o
                dia inteiro; Atualizar é acessório e vira só o ícone. */}
            <div className="inline-flex items-center rounded-md border border-border/70 overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none h-8 px-3 text-xs"
                onClick={() => setShowAddMeeting(true)}
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-orange-400" /> Reunião
              </Button>
              <div className="w-px h-5 bg-border/70" />
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none h-8 px-3 text-xs"
                onClick={() => setShowAddSale(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Venda
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={loadData}
              disabled={loading}
              title="Atualizar os dados do período"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
            </Button>
          </>,
          headerSlot
        )}

      {/* Advanced filters */}
      {showAdvancedFilters && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyActive} onCheckedChange={setFilterOnlyActive} />
              Somente ativos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithSpend} onCheckedChange={setFilterOnlyWithSpend} />
              Somente com gasto
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithLeads} onCheckedChange={setFilterOnlyWithLeads} />
              Somente com leads
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithMql} onCheckedChange={setFilterOnlyWithMql} />
              Somente com MQL
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={filterOnlyWithSales} onCheckedChange={setFilterOnlyWithSales} />
              Somente com vendas
            </label>
          </CardContent>
        </Card>
      )}

      {/* O botão de Venda que ficava aqui saiu: ele era o MESMO do cabeçalho,
          duplicado logo abaixo dos filtros. Dois botões idênticos na mesma tela
          fazem a pessoa parar para descobrir se fazem coisas diferentes. */}

      {/* Summary Cards - Grouped Blocks */}
      {totals && (() => {
        const scheduleRate = totals.mql > 0 ? ((totals.mql_agendaram ?? 0) / totals.mql) * 100 : null;
        const callConversion = totals.meetings_attended > 0 ? ((totals.sales_assessoria || 0) / totals.meetings_attended) * 100 : null;
        // Ticket por VENDA. O preço por sprint (nível) aparece no subtexto do card,
        // porque são grandezas diferentes: R$ 3.437 em 3 vendas de 17 níveis são
        // R$ 1.145 por venda e R$ 202 por sprint.
        const avgSprint = totals.sales_sprint > 0 ? totals.revenue_sprint / totals.sales_sprint : 0;
        const sprintUnits = totals.sprint_units ?? totals.sales_sprint ?? 0;
        const avgSprintUnit = sprintUnits > 0 ? (totals.revenue_sprint || 0) / sprintUnits : 0;
        const avgAssessoria = totals.sales_assessoria > 0 ? totals.revenue_assessoria / totals.sales_assessoria : 0;
        const avgTotal = totals.sales > 0 ? totals.revenue / totals.sales : 0;
        const cacSprint = (totals.sales_sprint || 0) > 0 && totals.spend > 0 ? totals.spend / (totals.sales_sprint || 0) : null;
        const cacAssessoria = (totals.sales_assessoria || 0) > 0 && totals.spend > 0 ? totals.spend / (totals.sales_assessoria || 0) : null;
        const cacTotalVal = (totals.sales || 0) > 0 && totals.spend > 0 ? totals.spend / (totals.sales || 0) : null;
        const roasSprint = totals.spend > 0 ? (totals.revenue_sprint || 0) / totals.spend : null;
        const roasAssessoria = totals.spend > 0 ? (totals.revenue_assessoria || 0) / totals.spend : null;
        const roasTotalVal = totals.spend > 0 ? (totals.revenue || 0) / totals.spend : null;
        // Leads R$ 5 mil a R$ 10 mil (tier Medium) — usado para CPL ≥5k
        const qualifiedLeads = leadsList.filter(
          (lead) => (lead.investimento_faixa || "") === "De R$ 5 mil a R$ 10 mil"
        ).length;
        const winRateVal = qualifiedLeads > 0 ? (totals.sales / qualifiedLeads) * 100 : 0;

        // ── Win rate por tipo (período filtrado)
        //
        // Elegível ao Sprint é quem o próprio quiz manda para a página do
        // Sprint: as três faixas abaixo de R$ 10 mil. Antes o denominador era
        // só "De R$ 5 mil a R$ 10 mil", o que deixava a conta com um punhado
        // de leads e produzia win rate de centenas por cento.
        const sprintLeadsCount = leadsList.filter(
          (l) => SPRINT_FAT_FAIXAS.includes(l.investimento_faixa || "")
        ).length;
        const mqlLeadsCount = leadsList.filter(
          (l) => MQL_FAT_MIN_FAIXAS.includes(l.investimento_faixa || "")
        ).length;
        // CAC da margem: mídia do MÊS INTEIRO dividida pelas vendas do MÊS
        // INTEIRO, nunca pelo recorte da tela.
        //
        // Dividir a mídia do filtro pelas vendas do filtro produz um custo por
        // venda que não existe: olhando um único dia, a venda daquele dia foi
        // paga por semanas de tráfego anterior, e o tráfego daquele dia vai
        // pagar vendas que ainda não aconteceram. Era assim que três vendas de
        // Sprint num filtro curto apareciam com R$ 4 mil de CAC.
        //
        // O backend manda o custo por venda de cada mês em `cac_by_month`; aqui
        // cada venda usa o do próprio mês. O cálculo antigo fica só como rede
        // de segurança para respostas sem o campo novo.
        const cacFallback = (salesList.length || totals.sales || 0) > 0 && totals.spend > 0
          ? totals.spend / (salesList.length || totals.sales || 0)
          : 0;
        const cacDoMes = (saleDate?: string | null): number =>
          totals.cac_by_month?.[(saleDate || "").slice(0, 7)]?.cac ?? cacFallback;
        const mesesNoFiltro = Object.entries(totals.cac_by_month || {});
        const vendasNoMes = mesesNoFiltro.reduce((n, [, m]) => n + m.sales, 0);
        const midiaNoMes = mesesNoFiltro.reduce((n, [, m]) => n + m.spend, 0);
        const cacPerSale = vendasNoMes > 0 ? midiaNoMes / vendasNoMes : cacFallback;
        const sprintWinRate = sprintLeadsCount > 0
          ? ((totals.sales_sprint || 0) / sprintLeadsCount) * 100
          : null;
        const assessoriaWinRate = mqlLeadsCount > 0
          ? ((totals.sales_assessoria || 0) / mqlLeadsCount) * 100
          : null;
        const totalQualified = sprintLeadsCount + mqlLeadsCount;
        const totalWinRate = totalQualified > 0
          ? (((totals.sales_sprint || 0) + (totals.sales_assessoria || 0)) / totalQualified) * 100
          : null;

        // ── Ciclo de vendas (período filtrado): dias entre lead.created_at e sale.sale_date
        const calcCycle = (filterFn: (s: ManualSale) => boolean): { avg: number | null; count: number } => {
          const days: number[] = [];
          for (const s of salesList) {
            if (!filterFn(s)) continue;
            if (!s.lead_created_at || !s.sale_date) continue;
            const leadDate = new Date(s.lead_created_at);
            const saleDate = new Date(s.sale_date + "T12:00:00");
            if (isNaN(leadDate.getTime()) || isNaN(saleDate.getTime())) continue;
            const diff = Math.max(0, Math.round((saleDate.getTime() - leadDate.getTime()) / 86400000));
            days.push(diff);
          }
          return {
            avg: days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null,
            count: days.length,
          };
        };
        const cycleSprint = calcCycle((s) => s.sale_type === "sprint");
        const cycleAssessoria = calcCycle((s) => s.sale_type === "assessoria");
        const cycleTotal = calcCycle(() => true);
        const fmtCycle = (c: { avg: number | null; count: number }): string =>
          c.avg != null ? `${c.avg.toFixed(1)} dias` : "—";
        const fmtCycleSub = (c: { avg: number | null; count: number }): string =>
          c.count > 0 ? `${c.count} venda${c.count > 1 ? "s" : ""} c/ lead vinculado` : "Sem dados";

        // ── Tempo de resposta (created_at → first_opened_at + 10s margem)
        // Conta APENAS minutos dentro do horário comercial (9h–20h, America/Sao_Paulo, todos os dias).
        // Leads que chegam fora do expediente "começam a contar" às 9h do próximo dia útil de atendimento.
        const RESPONSE_MARGIN_MS = 10_000;
        const BUSINESS_START_HOUR = 9;
        const BUSINESS_END_HOUR = 20; // exclusivo: janela é [9h, 20h)
        const BR_TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // BRT (UTC-3)

        // Converte um instante UTC para "ms desde epoch" no relógio de São Paulo.
        const toBrClockMs = (utcMs: number) => utcMs + BR_TZ_OFFSET_MS;
        const fromBrClockMs = (brMs: number) => brMs - BR_TZ_OFFSET_MS;

        // Retorna o início (ms UTC) da janela comercial do dia que contém `brMs`.
        const businessStartOfDay = (brMs: number) => {
          const d = new Date(brMs);
          const dayStartBr = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            BUSINESS_START_HOUR, 0, 0, 0
          );
          return dayStartBr;
        };
        const businessEndOfDay = (brMs: number) => {
          const d = new Date(brMs);
          return Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            BUSINESS_END_HOUR, 0, 0, 0
          );
        };

        // Calcula ms entre dois instantes UTC contando apenas dentro de [9h,20h) BR.
        const businessHoursDiffMs = (startUtcMs: number, endUtcMs: number): number => {
          if (endUtcMs <= startUtcMs) return 0;
          let startBr = toBrClockMs(startUtcMs);
          const endBr = toBrClockMs(endUtcMs);
          let total = 0;
          // Limite de segurança: no máximo 60 dias de varredura.
          for (let i = 0; i < 60 && startBr < endBr; i++) {
            const dayStart = businessStartOfDay(startBr);
            const dayEnd = businessEndOfDay(startBr);
            const windowStart = Math.max(startBr, dayStart);
            const windowEnd = Math.min(endBr, dayEnd);
            if (windowEnd > windowStart) total += windowEnd - windowStart;
            // Avança para 9h do próximo dia.
            const nextDay = new Date(dayStart);
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);
            startBr = nextDay.getTime();
          }
          return total;
        };

        const calcAvgResponse = (filterFn: (l: LeadOption) => boolean): string => {
          const opened = leadsList.filter(
            (l) => filterFn(l) && l.first_opened_at && l.created_at
          );
          if (opened.length === 0) return "—";
          const totalMs = opened.reduce((sum, l) => {
            const startUtc = new Date(l.created_at).getTime();
            const endUtc = new Date(l.first_opened_at!).getTime();
            const diff = businessHoursDiffMs(startUtc, endUtc);
            return sum + diff + RESPONSE_MARGIN_MS;
          }, 0);
          const avgSec = Math.round(totalMs / opened.length / 1000);
          if (avgSec < 60) return `${avgSec}s`;
          const m = Math.floor(avgSec / 60);
          const s = avgSec % 60;
          if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
          const h = Math.floor(m / 60);
          const rm = m % 60;
          return `${h}h ${rm}m`;
        };
        const isQualifiedLead = (l: LeadOption) => {
          const f = l.investimento_faixa || null;
          return !!f && !["Não vendo ainda (R$0/mês)", "Até R$ 5 mil"].includes(f);
        };
        const isMqlLead = (l: LeadOption) =>
          isLeadMql(l.estagio_negocio || "", l.investimento_faixa || null, l.sdr_override || null);
        const avgResponseAll = calcAvgResponse(() => true);
        const avgResponse5k = calcAvgResponse(isQualifiedLead);
        const avgResponseMql = calcAvgResponse(isMqlLead);

        // ── Margem real (comissões + custo de entrega + CAC) — sem custo fixo comercial,
        // só a comissão do time entra na conta.
        const salesMargins = salesList.map((s) => ({ sale: s, m: calcSaleMargin(s, cacDoMes(s.sale_date)) }));
        // Comissão de closer agrupada por quem de fato fechou a venda (sale.closer),
        // não mais um valor fixo atribuído sempre ao Cayo.
        const KNOWN_CLOSERS = Object.keys(CLOSER_CALENDARS);
        const commissionByCloser: Record<string, number> = Object.fromEntries(KNOWN_CLOSERS.map((c) => [c, 0]));
        for (const x of salesMargins) {
          commissionByCloser[x.m.closer] = (commissionByCloser[x.m.closer] || 0) + x.m.closerCommission;
        }
        const closerCommissionEntries = [
          ...KNOWN_CLOSERS,
          ...Object.keys(commissionByCloser).filter((c) => !KNOWN_CLOSERS.includes(c)),
        ].map((c) => [c, commissionByCloser[c]] as const);
        // Somada e exibida, nunca somada ao custo: ver `repartirComissao`.
        const totalComissaoSimbolica = salesMargins.reduce(
          (sum, x) => sum + (x.m.comissaoSimbolica?.valor || 0), 0);
        const totalMiguelCommission = salesMargins.reduce((sum, x) => sum + x.m.miguelCommission, 0);
        const totalDeliveryCost = salesMargins.reduce((sum, x) => sum + x.m.deliveryCost, 0);
        // Entrega aberta nas duas maos que a produzem. O editor pesa o dobro do
        // copy nao pelo salario, mas pela capacidade (80 bodys/mes contra 250) —
        // por isso vale ver as duas linhas separadas, e nao so o total.
        const totalDeliveryBodies = salesMargins.reduce((sum, x) => sum + x.m.deliveryBodies, 0);
        const totalCopyCost = totalDeliveryBodies * COPY_COST_PER_BODY;
        const totalEditorCost = totalDeliveryBodies * EDITOR_COST_PER_BODY;
        const totalTeamCommission =
          closerCommissionEntries.reduce((sum, [, amount]) => sum + amount, 0) + totalMiguelCommission;
        const shareOfRevenue = (v: number) =>
          totals.revenue > 0 ? ` · ${((v / totals.revenue) * 100).toFixed(1)}% da receita` : "";
        const totalCacCost = salesMargins.reduce((sum, x) => sum + x.m.cac, 0);
        const totalCostSum = salesMargins.reduce((sum, x) => sum + x.m.totalCost, 0);
        const netMargin = salesMargins.reduce((sum, x) => sum + x.m.margin, 0);
        const netMarginPct = totals.revenue > 0 ? netMargin / totals.revenue : null;

        // ── Conversão de call por closer (Realizadas → Assessoria), a partir das
        // reuniões e vendas reais no período (não do totals agregado por criativo).
        const callConversionByCloser = (closerName: string): number | null => {
          const attended = meetingsList.filter((m) => m.status === "realizada" && (m.closer || "Sem closer") === closerName).length;
          if (attended === 0) return null;
          const won = salesList.filter((s) => s.sale_type === "assessoria" && (s.closer || "Sem closer") === closerName).length;
          return (won / attended) * 100;
        };

        // O realizado com a meta do período colada nele.
        //
        // A meta vem do intervalo filtrado, não do mês: mudar o filtro para hoje
        // muda os dois lados da comparação junto. `meta` nulo simplesmente some
        // da tela — KPI sem meta cadastrada não ganha um "/ 0", que o olho leria
        // como meta batida.
        const MetricItem = ({ label, value, sub, color, meta, metaFormato }: {
          label: string; value: string; sub?: string; color?: string;
          meta?: number | null; metaFormato?: "moeda" | "numero";
        }) => {
          const temMeta = meta != null && meta > 0;
          const alvo = temMeta
            ? (metaFormato === "moeda"
                ? moedaCurta(meta)
                : meta.toLocaleString("pt-BR", { maximumFractionDigits: meta % 1 === 0 ? 0 : 1 }))
            : null;
          // Só dá para calcular o percentual quando o valor exibido é um número
          // puro. "12,5%" e "3,2x" não são realizados de meta nenhuma.
          const bruto = temMeta ? Number(String(value).replace(/[^\d,-]/g, "").replace(",", ".")) : NaN;
          const pct = temMeta && Number.isFinite(bruto) ? bruto / (meta as number) : null;
          const falta = temMeta && pct != null && pct < 1 ? (meta as number) - bruto : null;
          return (
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate" title={label}>{label}</p>
              {/* Valor e meta na MESMA linha, sem quebra. Antes o "/ R$ 2.500,00"
                  caía para a linha de baixo e o cartão parecia ter dois números
                  soltos em vez de uma comparação. */}
              <p className={`text-lg font-bold leading-tight whitespace-nowrap tabular-nums ${color || ""}`}>
                {value}
                {alvo && <span className="text-[11px] font-normal text-muted-foreground"> / {alvo}</span>}
              </p>
              {pct != null && (
                <p
                  className={`text-[10px] font-medium whitespace-nowrap ${pct >= 1 ? "text-emerald-400" : pct >= 0.7 ? "text-amber-400" : "text-rose-400"}`}
                  title="Percentual da meta rateada para o período filtrado"
                >
                  {(pct * 100).toFixed(0)}% da meta
                  {/* Quanto ainda falta. É este número que traduz o efeito do
                      fim de semana: a semana começa no sábado, então um sábado
                      e um domingo fortes fazem o que falta de segunda a sexta
                      encolher na cara de quem olha. */}
                  {falta != null && (
                    <span className="text-muted-foreground font-normal">
                      {" · faltam "}
                      {metaFormato === "moeda"
                        ? moedaCurta(falta)
                        : falta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                    </span>
                  )}
                </p>
              )}
              {sub && <p className="text-[10px] text-muted-foreground leading-snug">{sub}</p>}
            </div>
          );
        };

        // Caixa dos consolidados: mesma informacao em corpo maior, para o olho
        // parar primeiro no total e so depois descer para a composicao.
        const BigMetric = ({ label, value, sub, color, border, meta }: {
          label: string; value: string; sub?: string; color?: string; border?: string;
          meta?: number | null;
        }) => (
          <div className={`rounded-xl border ${border || "border-border/60"} bg-background/40 px-4 py-4`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${color || ""}`}>
              {value}
              {meta != null && meta > 0 && (
                <span className="text-xs font-normal text-muted-foreground"> / {formatCurrency(meta) || "—"}</span>
              )}
            </p>
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          </div>
        );

        return (
        <div className="space-y-4">
          {/* Meta do mês: primeiro bloco da aba, porque é a pergunta que a
              operação faz todo dia. Ignora os filtros de período do topo de
              propósito — meta é do mês inteiro, não do recorte que a pessoa
              está olhando para analisar criativo. */}
          <MetasMes />
          {/* Os três funis. Fica logo abaixo da meta porque a meta é de receita
              total, e este bloco diz de onde ela está vindo — sem ele, todo o
              painel dá a impressão de que só existe tráfego. */}
          <PainelFunis fetchAdminData={fetchAdminData} startISO={startISO} endISO={endISO} />
          {/* O orgânico aberto por canal e por peça (21/10/2026). */}
          <PainelOrganico fetchAdminData={fetchAdminData} startISO={startISO} endISO={endISO} />

          {/* Desempenho por conta → campanha → conjunto → anúncio, tudo por ID.
              Logo depois dos funis porque responde a pergunta seguinte: dentro
              da mídia paga, qual conta está trazendo o quê, e com que qualidade. */}
          <DesempenhoPorConta
            fetchAdminData={fetchAdminData}
            startISO={startISO}
            endISO={endISO}
            startDateOnly={startDateOnly}
            endDateOnly={endDateOnly}
          />

          {/* A semana começa no sábado, então ela atravessa a virada do mês com
              frequência — e mês sem meta cadastrada entra no período valendo
              zero. Sem este aviso a meta apareceria pequena e ninguém saberia
              por quê. */}
          {(metaPeriodo?.meses_sem_meta?.length ?? 0) > 0 && (
            <div className="flex gap-2 text-[11px] text-amber-400 border border-amber-500/25 bg-amber-500/5 p-2 rounded">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                O período filtrado pega {metaPeriodo!.meses_sem_meta.join(", ")}, que
                não {metaPeriodo!.meses_sem_meta.length > 1 ? "têm" : "tem"} meta
                cadastrada. As metas ao lado dos KPIs cobrem só os dias dos meses com meta.
              </span>
            </div>
          )}

          {/* Row 1: Tráfego + MQLs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tráfego */}
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">Tráfego</p>
                {/* Duas linhas em vez de seis colunas espremidas. Em cima o
                    dinheiro — o do período e o de hoje, lado a lado, que é a
                    comparação que interessa. Embaixo o volume. Seis colunas num
                    card de meia tela quebravam cada rótulo em quatro linhas. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 mb-4 border-b border-border/40">
                  <MetricItem label="Total Spend" value={formatCurrency(totals.spend) || "—"} meta={metaDe("midia")} metaFormato="moeda" sub="No período filtrado" />
                  {/* Hoje em mídia, colado no Total Spend de propósito. Ele é o
                      único item do card que IGNORA o filtro de data: orçamento
                      de campanha é fato do presente, e "quanto vou gastar em
                      agosto passado" não quer dizer nada. */}
                  <GastoDoDia />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MetricItem
                    label="LPV"
                    value={formatNumber(totals.landing_page_views || 0)}
                    color="text-sky-400"
                    sub="Landing Page Views (Pixel)"
                  />
                  <MetricItem
                    label="Total Leads"
                    value={formatNumber(totals.leads)}
                    sub={`⏱ Resp: ${avgResponseAll}${funnelMetrics && funnelMetrics.completed > 0 ? ` · ${((totals.leads / funnelMetrics.completed) * 100).toFixed(1)}% conclusões` : ""}`}
                  />
                  <MetricItem label="CPL" value={formatCurrency(totals.cpl) || "—"} sub={(totals.leads_prospeccao ?? 0) > 0 ? `Spend ÷ Leads · sem ${totals.leads_prospeccao} de prospecção` : "Spend ÷ Leads"} />
                  <MetricItem
                    label="CTL"
                    value={totals.ctl !== null && totals.ctl !== undefined ? `${totals.ctl.toFixed(2)}%` : "—"}
                    color="text-emerald-400"
                    sub={`Leads ÷ Cliques · ${formatNumber(totals.clicks || 0)} cliques`}
                  />
                </div>
              </CardContent>
            </Card>
            {/* MQLs */}
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">MQLs</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                  <MetricItem label="% MQL" value={totals.leads > 0 ? `${((totals.mql / totals.leads) * 100).toFixed(1)}%` : "—"} color="text-green-300" sub="Leads → MQL" />
                  <MetricItem label="Total MQL" value={formatNumber(totals.mql)} color="text-green-400" sub={`⏱ Resp: ${avgResponseMql}`} meta={metaDe("mql")} metaFormato="numero" />
                  <MetricItem label="Leads ≥5k" value={formatNumber(qualifiedLeads)} color="text-cyan-300" sub={`⏱ Resp: ${avgResponse5k}`} />
                  <MetricItem label="CPMQL" value={formatCurrency(totals.cpmql) || "—"} />
                  <MetricItem label="CPL ≥5k" value={qualifiedLeads > 0 ? formatCurrency(totals.spend / qualifiedLeads) || "—" : "—"} color="text-cyan-400" />
                  {/* HQL ao lado do MQL de propósito. Na coorte de agosto o
                      MQL não previu quem paga e o score previu: 16 HQL = 62,5%
                      de agendamento e 97,5% da receita, enquanto os 56 MQL da
                      faixa agendaram 25%. É o mesmo corte do evento
                      HighQualityLead que alimenta a Meta.

                      O rótulo deixou de ser "HQL73" em 17/09/2026: o corte
                      agora depende da versão do score (73 no quiz, 67 no
                      formulário curto) e o número no nome mentiria em metade
                      dos leads. A chave do JSON (`hql`) não mudou. */}
                  <MetricItem
                    label="HQL"
                    value={formatNumber(totals.hql ?? 0)}
                    color="text-emerald-400"
                    sub={totals.leads > 0
                      ? `${(((totals.hql ?? 0) / totals.leads) * 100).toFixed(1)}% dos leads`
                      : "acima do corte da versão"}
                  />
                  <MetricItem
                    label="Custo/HQL"
                    value={totals.cp_hql != null ? formatCurrency(totals.cp_hql) || "—" : "—"}
                    color="text-emerald-300"
                    sub="Spend ÷ HQL"
                  />
                  <MetricItem
                    label="Lead Score"
                    value={totals.avg_lead_score !== null && totals.avg_lead_score !== undefined ? `${totals.avg_lead_score}/100` : "—"}
                    color={
                      totals.avg_lead_score == null ? undefined :
                      totals.avg_lead_score >= 75 ? "text-emerald-400" :
                      totals.avg_lead_score >= 50 ? "text-amber-400" :
                      totals.avg_lead_score >= 25 ? "text-blue-400" :
                      "text-muted-foreground"
                    }
                    sub="Média (todas as perguntas do quiz)"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Tiers */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">Tiers (% sobre total de leads)</p>
              <div className="grid grid-cols-5 gap-4">
                <MetricItem label="Small" value={formatNumber(totals.tier_small)} sub={`${totals.leads > 0 ? ((totals.tier_small / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_small) || "—"}`} />
                <MetricItem label="Medium" value={formatNumber(totals.tier_medium)} color="text-blue-400" sub={`${totals.leads > 0 ? ((totals.tier_medium / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_medium) || "—"}`} />
                <MetricItem label="Large" value={formatNumber(totals.tier_large)} color="text-amber-400" sub={`${totals.leads > 0 ? ((totals.tier_large / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_large) || "—"}`} />
                <MetricItem label="Enterprise" value={formatNumber(totals.tier_enterprise)} color="text-purple-400" sub={`${totals.leads > 0 ? ((totals.tier_enterprise / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_enterprise) || "—"}`} />
                <MetricItem label="Enterprise+" value={formatNumber(totals.tier_enterprise_plus)} color="text-pink-400" sub={`${totals.leads > 0 ? ((totals.tier_enterprise_plus / totals.leads) * 100).toFixed(1) : "0.0"}% · ${formatCurrency(totals.cp_tier_enterprise_plus) || "—"}`} />
              </div>
            </CardContent>
          </Card>

          {/* Row 3: Reuniões */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reuniões</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setShowMeetingsList(!showMeetingsList);
                  }}
                >
                  {showMeetingsList ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                  {showMeetingsList ? "Ocultar" : "Ver reuniões"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                <MetricItem label="Taxa Agendamento" value={scheduleRate !== null ? `${scheduleRate.toFixed(1)}%` : "—"} color="text-yellow-400" sub="MQL → Reuniões" />
                <MetricItem
                  label="Agendadas"
                  value={formatNumber(totals.meetings)}
                  color="text-orange-400"
                  meta={metaDe("reunioes_agendadas")}
                  metaFormato="numero"
                  sub={
                    (totals.meetings || 0) - (totals.meetings_decided || 0) > 0
                      ? `${(totals.meetings || 0) - (totals.meetings_decided || 0)} ainda vão acontecer`
                      : formatCurrency(totals.cp_meeting) || undefined
                  }
                />
                <MetricItem
                  label="Realizadas"
                  value={formatNumber(totals.meetings_attended || 0)}
                  color="text-emerald-400"
                  meta={metaDe("reunioes_realizadas")}
                  metaFormato="numero"
                  /* Show rate sobre reunião DECIDIDA. Call marcada para semana que
                     vem não é falta de ninguém, e enquanto o campo era booleano
                     ela entrava aqui como uma. */
                  sub={(totals.meetings_decided || 0) > 0
                    ? `${((totals.meetings_attended || 0) / (totals.meetings_decided || 1) * 100).toFixed(0)}% show rate (de ${totals.meetings_decided} decididas)`
                    : "—"}
                />
                <MetricItem label="Conversão Call" value={callConversion !== null ? `${callConversion.toFixed(1)}%` : "—"} color="text-cyan-400" sub="Realizadas → Assessoria" />
                {Object.keys(CLOSER_CALENDARS).map((closerName) => {
                  const conv = callConversionByCloser(closerName);
                  return (
                    <MetricItem
                      key={closerName}
                      label={`Conversão ${closerName}`}
                      value={conv !== null ? `${conv.toFixed(1)}%` : "—"}
                      color="text-cyan-300"
                      sub="Realizadas → Assessoria"
                    />
                  );
                })}
              </div>
              {showMeetingsList && (
                <div className="mt-4 border-t border-border/50 pt-4">
                  {/* A configuração da agenda saiu daqui e virou um botão no
                      cabeçalho, ao lado do tema. Configuração não é lista: ela
                      é mexida uma vez e ficava ocupando o topo de toda abertura
                      da tabela de reuniões. */}
                  {meetingsLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : meetingsList.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">Nenhuma reunião registrada no período.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Lead</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Criativo</TableHead>
                          <TableHead>Página / variante</TableHead>
                          <TableHead>Closer</TableHead>
                          <TableHead>Observação</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead className="w-28">Gravação</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {meetingsList.map((meeting) => (
                          // A linha inteira abre o detalhe. As respostas do
                          // Processo Abóbora são a parte mais rica do registro e
                          // não apareciam em lugar nenhum: o SDR preenchia e
                          // ninguém lia. As células com botão param a
                          // propagação, senão clicar em "Realizada" abriria o
                          // diálogo junto.
                          <TableRow
                            key={meeting.id}
                            className="cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setReuniaoDetalhe(meeting)}
                          >
                            <TableCell>
                              {meeting.scheduled_at ? (
                                <div>
                                  <div>{format(new Date(meeting.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    agendada em {format(new Date(meeting.created_at), "dd/MM", { locale: ptBR })}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div>{format(new Date(meeting.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                                  <div className="text-[10px] text-muted-foreground">sem data da call</div>
                                </div>
                              )}
                            </TableCell>
                            {/* Quem é a reunião. Antes só existia a observação,
                                onde o nome vinha grudado — e "de quem é esta
                                call?" não tinha resposta na tabela. */}
                            <TableCell className="font-medium max-w-[180px]">
                              <span className="truncate block" title={meeting.lead_nome_resolvido || "—"}>
                                {meeting.lead_nome_resolvido || "—"}
                              </span>
                              {/* Quem colocou esta call na agenda. Sem o selo,
                                  a reunião que o próprio lead marcou em /agendar
                                  era indistinguível da que o SDR registrou — e a
                                  primeira não é trabalho do time. */}
                              <Badge
                                variant="outline"
                                className={`text-[9px] mt-0.5 ${
                                  meeting.agendado_por === "auto"
                                    ? "border-cyan-500/40 text-cyan-300"
                                    : "border-border/60 text-muted-foreground"
                                }`}
                              >
                                {meeting.agendado_por === "auto" ? "pelo lead" : "pelo time"}
                              </Badge>
                              {!meeting.lead_id && (
                                <span className="text-[9px] text-muted-foreground block">sem lead no sistema</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  (meeting.origem || "midia_paga") === "midia_paga"
                                    ? "border-sky-500/40 text-sky-300"
                                    : "border-violet-500/40 text-violet-300"
                                }`}
                              >
                                {ROTULO_ORIGEM[meeting.origem || "midia_paga"]}
                              </Badge>
                              {/* Reunião registrada antes de 03/09/2026 não tem
                                  Abóbora, e nunca vai ter: o aviso é só para as
                                  novas, onde a ausência significa algo. */}
                              {meeting.abobora_completa === false && (
                                <div className="text-[10px] text-amber-400/80 mt-0.5">abóbora incompleto</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {meeting.utm_content || meeting.creative_key ? (
                                <Badge variant="outline" className="text-xs">{meeting.utm_content || meeting.creative_key}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {meeting.headline_path ? (
                                <Badge variant="outline" className="text-xs border-cyan-500/40 text-cyan-300">
                                  {headlineLabel(meeting.headline_path)}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {meeting.closer ? (
                                <Badge variant="outline" className="text-xs">{meeting.closer}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {soObservacao(meeting) || "—"}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCycleStatus(meeting)}
                                disabled={togglingAttendedId === meeting.id}
                                title="Clique para alternar: agendada → realizada → no-show"
                                className={
                                  meeting.status === "realizada" ? "text-emerald-400"
                                    : meeting.status === "no_show" ? "text-red-400"
                                      : "text-amber-400"
                                }
                              >
                                {togglingAttendedId === meeting.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : meeting.status === "realizada" ? (
                                  <><Check className="w-4 h-4 mr-1" /> Realizada</>
                                ) : meeting.status === "no_show" ? (
                                  <><X className="w-4 h-4 mr-1" /> No-show</>
                                ) : (
                                  <><Calendar className="w-4 h-4 mr-1" /> Agendada</>
                                )}
                              </Button>
                              {meeting.pendente && (
                                <div className="text-[10px] text-amber-400/80">já passou, marque o desfecho</div>
                              )}
                              {/* Call que aconteceu e ninguém escreveu por quê.
                                  É a fila de trabalho do closer, e sem ela o
                                  motivo simplesmente nunca é preenchido. */}
                              {meeting.status === "realizada" && !meeting.motivo_categoria && (
                                <div className="text-[10px] text-sky-400/80">falta dizer por que não fechou</div>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <RegistroGravacao
                                  reuniao={meeting}
                                  autor={meeting.closer || "Caio"}
                                  aoSalvar={(url, folder) =>
                                    setMeetingsList(prev => prev.map(m =>
                                      m.id === meeting.id
                                        ? { ...m, recording_url: url, recording_folder: folder, recording_uploaded_at: new Date().toISOString() }
                                        : m))
                                  }
                                />
                                {meeting.recording_url && (
                                  <a
                                    href={meeting.recording_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-primary hover:underline"
                                  >
                                    ver
                                  </a>
                                )}
                                <AnaliseCall
                                  meetingId={meeting.id}
                                  titulo={meeting.notes || "Reunião"}
                                  analise={(meeting.analise_ia as Analise | null) || null}
                                  analisadaEm={meeting.analise_ia_at || null}
                                  aoAnalisar={(a) =>
                                    setMeetingsList(prev => prev.map(m =>
                                      m.id === meeting.id
                                        ? { ...m, analise_ia: a as unknown as Record<string, unknown>, analise_ia_at: new Date().toISOString() }
                                        : m))
                                  }
                                />
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingMeeting(meeting);
                                    setEditMeetingForm({
                                      notes: soObservacao(meeting),
                                      status: meeting.status || (meeting.attended ? "realizada" : "agendada"),
                                      closer: meeting.closer || "Caio",
                                      scheduled_at: meeting.scheduled_at ? format(new Date(meeting.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
                                      origem: ((meeting.origem as Origem) || "midia_paga"),
                                      abobora_posicao: meeting.abobora_posicao || "",
                                      abobora_segmento: meeting.abobora_segmento || "",
                                      abobora_decide: (meeting.abobora_decide === "sim" || meeting.abobora_decide === "nao") ? meeting.abobora_decide : "",
                                      abobora_quem_decide: meeting.abobora_quem_decide || "",
                                      abobora_investimento: meeting.abobora_investimento || "",
                                    });
                                  }}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteMeeting(meeting.id)}
                                  disabled={deletingMeetingId === meeting.id}
                                >
                                  {deletingMeetingId === meeting.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Row 4: Vendas */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Sprint */}
            <Card className="border-violet-500/20">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 border-b border-violet-500/20 pb-2">Sprint</p>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Vendas"
                    value={`${formatNumber(totals.sales_sprint || 0)}`}
                    color="text-violet-400"
                    meta={metaDe("vendas_sprint")}
                    metaFormato="numero"
                    sub={`${formatCurrency(totals.revenue_sprint || 0) || "—"} · ${formatNumber(sprintUnits)} sprint${sprintUnits === 1 ? "" : "s"} vendido${sprintUnits === 1 ? "" : "s"}`}
                  />
                  <MetricItem
                    label="Ticket Médio"
                    value={avgSprint > 0 ? formatCurrency(avgSprint) || "—" : "—"}
                    color="text-violet-300"
                    sub={avgSprintUnit > 0 ? `${formatCurrency(avgSprintUnit)} por sprint` : undefined}
                  />
                  <MetricItem label="Ciclo de Vendas" value={fmtCycle(cycleSprint)} color="text-violet-300" sub={fmtCycleSub(cycleSprint)} />
                  <MetricItem
                    label="Win Rate"
                    value={sprintWinRate != null ? `${sprintWinRate.toFixed(1)}%` : "—"}
                    color="text-violet-300"
                    sub={`${totals.sales_sprint || 0} / ${sprintLeadsCount} leads sprint`}
                  />
                  <MetricItem label="CAC" value={cacSprint !== null ? formatCurrency(cacSprint) || "—" : "—"} color="text-violet-300" sub="Spend ÷ Vendas Sprint" />
                  <MetricItem label="ROAS" value={roasSprint !== null ? `${roasSprint.toFixed(2)}x` : "—"} color="text-violet-300" sub="Receita Sprint ÷ Spend" />
                </div>
              </CardContent>
            </Card>
            {/* Assessoria — TCV (contrato) */}
            <Card className="border-teal-500/20">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-3 border-b border-teal-500/20 pb-2">Assessoria · TCV</p>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Vendas"
                    value={`${formatNumber(totals.sales_assessoria || 0)}`}
                    color="text-teal-400"
                    meta={metaDe("contratos_assessoria")}
                    metaFormato="numero"
                    sub={`${formatCurrency(totals.revenue_assessoria || 0) || "—"} · ${totals.mql > 0 ? (((totals.sales_assessoria || 0) / totals.mql) * 100).toFixed(1) : "0.0"}% MQLs`}
                  />
                  <MetricItem label="Ticket Médio" value={avgAssessoria > 0 ? formatCurrency(avgAssessoria) || "—" : "—"} color="text-teal-300" />
                  <MetricItem label="Ciclo de Vendas" value={fmtCycle(cycleAssessoria)} color="text-teal-300" sub={fmtCycleSub(cycleAssessoria)} />
                  <MetricItem
                    label="Win Rate"
                    value={assessoriaWinRate != null ? `${assessoriaWinRate.toFixed(1)}%` : "—"}
                    color="text-teal-300"
                    sub={`${totals.sales_assessoria || 0} / ${mqlLeadsCount} MQLs`}
                  />
                  <MetricItem label="CAC" value={cacAssessoria !== null ? formatCurrency(cacAssessoria) || "—" : "—"} color="text-teal-300" sub="Spend ÷ Vendas Assessoria" />
                  <MetricItem label="ROAS" value={roasAssessoria !== null ? `${roasAssessoria.toFixed(2)}x` : "—"} color="text-teal-300" sub="Receita Assessoria ÷ Spend" />
                </div>
              </CardContent>
            </Card>
            {/* Assessoria — Recebido (caixa) */}
            <Card className="border-teal-500/20">
              <CardContent className="pt-4">
                <p className="text-xs font-semibold text-teal-300 uppercase tracking-wider mb-3 border-b border-teal-500/20 pb-2">Assessoria · Recebido</p>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Recebido"
                    value={formatCurrency(totals.revenue_assessoria_received || 0) || "—"}
                    color="text-teal-400"
                    sub={`${(totals.revenue_assessoria || 0) > 0 ? (((totals.revenue_assessoria_received || 0) / (totals.revenue_assessoria || 1)) * 100).toFixed(1) : "0.0"}% do TCV`}
                  />
                  <MetricItem
                    label="A Receber"
                    value={formatCurrency(totals.revenue_assessoria_to_receive || 0) || "—"}
                    color="text-amber-300"
                    sub={`Restante do contrato`}
                  />
                  <MetricItem
                    label="Ticket Recebido"
                    value={(totals.sales_assessoria || 0) > 0 ? formatCurrency((totals.revenue_assessoria_received || 0) / (totals.sales_assessoria || 1)) || "—" : "—"}
                    color="text-teal-300"
                  />
                  <MetricItem
                    label="ROAS Caixa"
                    value={totals.spend > 0 ? `${(((totals.revenue_assessoria_received || 0)) / totals.spend).toFixed(2)}x` : "—"}
                    color="text-teal-300"
                    sub="Recebido Assessoria ÷ Spend"
                  />
                </div>
              </CardContent>
            </Card>
            {/* Totais */}
            <Card className="border-emerald-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Total</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setShowSalesList(!showSalesList);
                      if (!showSalesList) loadSales();
                    }}
                  >
                    {showSalesList ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                    {showSalesList ? "Ocultar" : "Ver vendas"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MetricItem
                    label="Vendas"
                    value={`${formatNumber(totals.sales)}`}
                    color="text-emerald-400"
                    /* O TCV do período com a meta ao lado. Ele não tem KPI
                       próprio na tela, e é a linha que sustenta a meta anual. */
                    sub={`${formatCurrency(totals.revenue) || "—"}${
                      metaDe("tcv_total") ? ` / ${formatCurrency(metaDe("tcv_total") as number)} de TCV` : ""
                    } · ${totals.leads > 0 ? ((totals.sales / totals.leads) * 100).toFixed(2) : "0.00"}% leads`}
                  />
                  <MetricItem label="Ticket Médio" value={avgTotal > 0 ? formatCurrency(avgTotal) || "—" : "—"} color="text-emerald-300" />
                  <MetricItem label="Ciclo de Vendas" value={fmtCycle(cycleTotal)} color="text-emerald-300" sub={fmtCycleSub(cycleTotal)} />
                  <MetricItem
                    label="Win Rate"
                    value={totalWinRate != null ? `${totalWinRate.toFixed(1)}%` : "—"}
                    color="text-emerald-300"
                    sub={`${(totals.sales_sprint || 0) + (totals.sales_assessoria || 0)} / ${totalQualified} leads (Sprint + MQL)`}
                  />
                  <MetricItem label="CAC" value={cacTotalVal !== null ? formatCurrency(cacTotalVal) || "—" : "—"} color="text-emerald-300" sub="Spend ÷ Vendas" />
                  <MetricItem label="ROAS" value={roasTotalVal !== null ? `${roasTotalVal.toFixed(2)}x` : "—"} color="text-emerald-300" sub="Receita ÷ Spend" />
                  {/* Parceria só aparece quando existe. Ela é contrato fechado
                      sem TCV, então fica fora de ticket médio, ROAS e CAC — e
                      um card zerado permanente só ocuparia espaço. */}
                  {(totals.sales_refunded || 0) > 0 && (
                    <MetricItem
                      label="Reembolsadas"
                      value={formatNumber(totals.sales_refunded || 0)}
                      color="text-rose-400"
                      sub="Fora da receita · no histórico"
                    />
                  )}
                  {(totals.sales_parceria || 0) > 0 && (
                    <MetricItem
                      label="Parcerias"
                      value={formatNumber(totals.sales_parceria || 0)}
                      color="text-amber-400"
                      sub="Comissionadas · fora do TCV"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Margem real — composicao em cima, consolidado embaixo em caixas
              maiores. A composicao e o que se audita; os totais sao o que se
              decide, e por isso ganham corpo maior. */}
          <Card className="border-amber-500/20">
            <CardContent className="pt-4">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3 border-b border-amber-500/20 pb-2">Margem</p>

              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-3">Composição</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* A comissão simbólica do Rodger. Fica ao lado das reais, mas
                    marcada e FORA do custo: ele não cobra. O número existe para
                    o Caio ver quanto a call em dupla custou a ele. */}
                {totalComissaoSimbolica > 0 && (
                  <MetricItem
                    label="Rodger (simbólica)"
                    value={formatCurrency(totalComissaoSimbolica) || "—"}
                    color="text-muted-foreground"
                    sub="Não é paga · não entra no custo"
                  />
                )}
                {closerCommissionEntries.map(([closerName, amount]) => (
                  <MetricItem
                    key={closerName}
                    label={`Comissão ${closerName}`}
                    value={formatCurrency(amount) || "—"}
                    color="text-amber-300"
                    sub="6,25% do recebido"
                  />
                ))}
                <MetricItem
                  label="Comissão Miguel"
                  value={formatCurrency(totalMiguelCommission) || "—"}
                  color="text-amber-300"
                  sub="1% do total vendido"
                />
                <MetricItem
                  label="Copy"
                  value={formatCurrency(totalCopyCost) || "—"}
                  color="text-amber-300"
                  sub={`${formatNumber(totalDeliveryBodies)} bodys × ${formatCurrency(COPY_COST_PER_BODY)}`}
                />
                <MetricItem
                  label="Edição"
                  value={formatCurrency(totalEditorCost) || "—"}
                  color="text-amber-300"
                  sub={`${formatNumber(totalDeliveryBodies)} bodys × ${formatCurrency(EDITOR_COST_PER_BODY)}`}
                />
                <MetricItem
                  label="CAC Atribuído"
                  value={formatCurrency(totalCacCost) || "—"}
                  color="text-amber-300"
                  sub={vendasNoMes > 0
                    ? `${formatCurrency(cacPerSale) || "—"} por venda · mídia do mês ÷ ${vendasNoMes} ${vendasNoMes === 1 ? "venda do mês" : "vendas do mês"}`
                    : `${formatCurrency(cacPerSale) || "—"} por venda`}
                />
              </div>

              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-6 mb-3 border-t border-amber-500/10 pt-4">Consolidado</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <BigMetric
                  meta={metaDe("margem_contribuicao")}
                  label="Margem de Contribuição"
                  value={formatCurrency(netMargin) || "—"}
                  color={netMargin >= 0 ? "text-emerald-400" : "text-rose-400"}
                  border={netMargin >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}
                  sub={`${netMarginPct != null ? (netMarginPct * 100).toFixed(1) : "0.0"}% da receita`}
                />
                <BigMetric
                  label="Custo Total"
                  value={formatCurrency(totalCostSum) || "—"}
                  color="text-rose-300"
                  border="border-rose-500/25"
                  sub={`Time + operacional + tráfego${shareOfRevenue(totalCostSum)}`}
                />
                <BigMetric
                  label="Comissões do Time"
                  value={formatCurrency(totalTeamCommission) || "—"}
                  color="text-amber-300"
                  border="border-amber-500/25"
                  sub={`Closers + Miguel${shareOfRevenue(totalTeamCommission)}`}
                />
                <BigMetric
                  label="Operacional"
                  value={formatCurrency(totalDeliveryCost) || "—"}
                  color="text-amber-300"
                  border="border-amber-500/25"
                  sub={`Copy + edição${shareOfRevenue(totalDeliveryCost)}`}
                />
                <BigMetric
                  label="Tráfego"
                  value={formatCurrency(totalCacCost) || "—"}
                  color="text-amber-300"
                  border="border-amber-500/25"
                  sub={`Custo por venda do mês × vendas do período${shareOfRevenue(totalCacCost)}`}
                />
              </div>

              {/* Reenvio de eventos ao Meta.
                  A rota e o handler já existiam desde sempre, mas nenhum botão
                  chamava — e sem alguém disparar, venda registrada no painel
                  nunca virava Purchase no Meta. Em 27/08/2026 eram 3 de 11
                  vendas enviadas, e a campanha otimizava com um terço da
                  receita real. O event_id é preso ao id da venda, então clicar
                  duas vezes não conta a mesma venda duas vezes. */}
              <div className="mt-6 border-t border-amber-500/10 pt-4">
                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">
                  Reenviar eventos ao Meta
                </p>
                <p className="text-[11px] text-muted-foreground/60 mb-3">
                  Manda para a CAPI o que ainda não foi enviado. Seguro repetir: cada evento
                  carrega o id do registro, então o Meta descarta duplicata.
                </p>
                <div className="flex flex-wrap gap-2">
                  {([
                    { t: "purchases" as const, label: "Compras" },
                    { t: "meetings" as const, label: "Reuniões" },
                    { t: "mqls" as const, label: "MQLs" },
                    { t: "tiers" as const, label: "Tiers" },
                  ]).map((b) => (
                    <Button
                      key={b.t}
                      variant="outline"
                      size="sm"
                      disabled={sendingCapiRetro !== null}
                      onClick={() => handleCapiRetroactive(b.t)}
                      className="h-8 text-xs border-amber-500/30 hover:bg-amber-500/10"
                    >
                      {sendingCapiRetro === b.t
                        ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                        : null}
                      {b.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sales table inline (expanded under Total card) */}
          {showSalesList && (
            <Card>
              <CardContent className="pt-4">
                {salesLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : salesList.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">Nenhuma venda registrada no período.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">TCV</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead>Criativo</TableHead>
                        <TableHead>Notas</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesList.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{format(new Date(sale.sale_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                (sale.origem || "midia_paga") === "midia_paga"
                                  ? "border-sky-500/40 text-sky-300"
                                  : "border-fuchsia-500/40 text-fuchsia-300"
                              }`}
                            >
                              {ROTULO_ORIGEM[sale.origem || "midia_paga"]}
                            </Badge>
                            {(sale.lead_nome_resolvido || sale.lead_nome) && (
                              <div
                                className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px] truncate"
                                title={sale.lead_nome_resolvido || sale.lead_nome || ""}
                              >
                                {sale.lead_nome_resolvido || sale.lead_nome}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                sale.sale_type === "assessoria" ? "border-teal-500/50 text-teal-400"
                                  : sale.sale_type === "parceria" ? "border-amber-500/50 text-amber-400"
                                    : "border-violet-500/50 text-violet-400"
                              }`}
                            >
                              {sale.sale_type === "assessoria" ? "Assessoria"
                                : sale.sale_type === "parceria" ? "Parceria" : "Sprint"}
                            </Badge>
                            {sale.refunded_at && (
                              <div className="text-[10px] text-rose-400 mt-0.5" title={sale.refund_reason || ""}>
                                reembolsada em {format(new Date(sale.refunded_at + "T12:00:00"), "dd/MM", { locale: ptBR })}
                              </div>
                            )}
                            {sale.closer === CLOSER_DUPLA && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                call em dupla · comissão dividida
                              </div>
                            )}
                            {sale.sale_type === "parceria" && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {sale.commission_pct != null ? `${sale.commission_pct}% de comissão` : "comissionada"}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(sale.revenue)}</TableCell>
                          <TableCell>
                            {(() => {
                              const pt = sale.payment_type || "tcv_total";
                              const label = pt === "pix_parcelado" ? "Pix Parcelado" : pt === "recorrencia" ? "Recorrência" : "À Vista";
                              const detail = pt === "pix_parcelado" && sale.installments_count && sale.installment_value
                                ? `${sale.installments_count}x ${formatCurrency(Number(sale.installment_value))}`
                                : pt === "recorrencia" && sale.installment_value
                                ? `${formatCurrency(Number(sale.installment_value))}/mês`
                                : null;
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant="outline" className="text-[10px] w-fit">{label}</Badge>
                                  {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-400 font-semibold text-sm">{formatCurrency(Number(sale.amount_received || 0))}</span>
                              {(Number(sale.revenue) - Number(sale.amount_received || 0)) > 0.01 && (
                                <span className="text-[10px] text-amber-400">+{formatCurrency(Number(sale.revenue) - Number(sale.amount_received || 0))} a receber</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {(() => {
                              const m = calcSaleMargin(sale, cacDoMes(sale.sale_date));
                              return (
                                <div className="flex flex-col items-end">
                                  <span className={`font-semibold text-sm ${m.margin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {formatCurrency(m.margin)}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {m.marginPct != null ? `${(m.marginPct * 100).toFixed(1)}%` : "—"}
                                  </span>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {sale.utm_content || sale.creative_key ? (
                              <Badge variant="outline" className="text-xs">{sale.utm_content || sale.creative_key}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{sale.notes || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSale(sale);
                                  setEditSaleForm({
                                    revenue: String(sale.revenue),
                                    origem: ((sale.origem as Origem) || "midia_paga"),
                                    lead_nome: sale.lead_nome || "",
                                    sale_type: (sale.sale_type || "sprint") as "sprint" | "assessoria" | "parceria",
                                    commission_pct: sale.commission_pct != null ? String(sale.commission_pct) : "",
                                    refunded_at: sale.refunded_at || "",
                                    refund_amount: sale.refund_amount != null ? String(sale.refund_amount) : "",
                                    refund_reason: sale.refund_reason || "",
                                    sprint_levels: sale.sprint_levels != null ? String(sale.sprint_levels) : "",
                                    notes: sale.notes || "",
                                    closer: sale.closer || "Caio",
                                    payment_type: ((sale.payment_type as "tcv_total" | "pix_parcelado" | "recorrencia") || "tcv_total"),
                                    installments_count: sale.installments_count != null ? String(sale.installments_count) : "",
                                    installment_value: sale.installment_value != null ? String(sale.installment_value) : "",
                                    amount_received: sale.amount_received != null ? String(sale.amount_received) : "",
                                    delivery_months: sale.delivery_months != null ? String(sale.delivery_months) : "",
                                    ads_contracted: sale.ads_contracted != null ? String(sale.ads_contracted) : "",
                                    bodies_per_month: sale.bodies_per_month != null ? String(sale.bodies_per_month) : "",
                                  });
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSale(sale.id)}
                                disabled={deletingSaleId === sale.id}
                              >
                                {deletingSaleId === sale.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

        </div>
        );
      })()}

      {/* Ranking Cards */}

      {/* Performance por Variante — o teste A/B em andamento */}
      {(data?.variants_performance?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance por Variante (Teste A/B)
              <span className="text-sm font-normal text-muted-foreground">
                ({data!.variants_performance!.length})
              </span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              A variante é a página por onde a pessoa entrou. A verba vem do conjunto do Meta, que no
              teste é nomeado como a página ("SH 4" → /SH4); conjunto que não é de teste fica de fora
              em vez de ser rateado.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr className="text-muted-foreground">
                    <th className="text-left p-2 min-w-[120px]">Variante</th>
                    <th className="text-right p-2">Spend</th>
                    <th className="text-right p-2" title="Sessões medidas pelo tracking próprio">Sessões</th>
                    <th className="text-right p-2">Leads</th>
                    <th className="text-right p-2" title="Custo por lead">CTL</th>
                    <th className="text-right p-2">MQL</th>
                    <th className="text-right p-2" title="Custo por MQL">CPMQL</th>
                    <th className="text-right p-2" title="Reuniões agendadas">Agend.</th>
                    <th className="text-right p-2" title="Reuniões realizadas">Realiz.</th>
                    <th className="text-right p-2" title="Custo por reunião realizada">R$/Reun.</th>
                    <th className="text-right p-2" title="MQL que viraram reunião">Tx.Agend</th>
                    <th className="text-right p-2">Vendas</th>
                    <th className="text-right p-2" title="Vendas por reunião realizada">Win%</th>
                    <th className="text-right p-2">CAC</th>
                    <th className="text-right p-2" title="CAC de Sprint">CAC-S</th>
                    <th className="text-right p-2" title="CAC de assessoria">CAC-A</th>
                    <th className="text-right p-2" title="Leads de R$ 5 a 10 mil e o custo por eles">5–10k / CP</th>
                    <th className="text-right p-2" title="Nota média (0–100) dos leads que a variante trouxe. Separa volume de qualidade.">Tx.Qualif.</th>
                    <th className="text-right p-2" title="Sessões que entraram no quiz">Conv.Pág</th>
                    <th className="text-right p-2" title="Entrou no quiz e virou lead">Conv.Quiz</th>
                    <th className="text-right p-2" title="Sessões que viraram lead">Conv.Total</th>
                    <th className="text-right p-2">Receita</th>
                    <th className="text-right p-2">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.variants_performance!.map((v) => (
                    <tr key={v.page} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.is_active ? "bg-green-500" : "bg-muted-foreground/40"}`}
                            title={v.is_active ? "Com verba nos últimos 3 dias" : "Sem verba recente"}
                          />
                          <span className="font-mono font-semibold">
                            {v.page === "/" ? "raiz" : v.page.replace("/", "")}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-right">{v.spend > 0 ? formatCurrency(v.spend) : "—"}</td>
                      <td className="p-2 text-right text-muted-foreground">{v.sessions_count || "—"}</td>
                      <td className="p-2 text-right font-semibold">{v.leads_count}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {v.ctl != null ? formatCurrency(v.ctl) : "—"}
                      </td>
                      <td className="p-2 text-right font-semibold text-cyan-300">{v.mql_count}</td>
                      <td className="p-2 text-right">
                        {v.cost_per_mql != null ? formatCurrency(v.cost_per_mql) : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">{v.meetings_count || "—"}</td>
                      <td className="p-2 text-right">{v.meetings_attended_count || "—"}</td>
                      <td className="p-2 text-right">
                        {v.cost_per_meeting != null ? formatCurrency(v.cost_per_meeting) : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {v.meeting_rate != null ? `${(v.meeting_rate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-2 text-right font-semibold text-green-400">
                        {v.sales_count || 0}
                        {v.sales_count > 0 && (
                          <span className="block text-[9px] text-muted-foreground font-normal">
                            {v.sales_assessoria_count} assess.
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {v.win_rate != null ? `${(v.win_rate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-2 text-right">{v.cac != null ? formatCurrency(v.cac) : "—"}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {v.cac_sprint != null ? formatCurrency(v.cac_sprint) : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {v.cac_assessoria != null ? formatCurrency(v.cac_assessoria) : "—"}
                      </td>
                      <td className="p-2 text-right">
                        {v.leads_5_10k_count || "—"}
                        {v.cost_per_5_10k != null && (
                          <span className="block text-[9px] text-muted-foreground">
                            {formatCurrency(v.cost_per_5_10k)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <TaxaQualificacao score={v.avg_lead_score} />
                      </td>
                      <td className="p-2 text-right">
                        {v.conv_page != null ? `${(v.conv_page * 100).toFixed(1)}%` : "—"}
                        {v.sessions_count > 0 && (
                          <span className="block text-[9px] text-muted-foreground">
                            {v.quiz_views_count}/{v.sessions_count}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {v.conv_quiz != null ? `${(v.conv_quiz * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {v.conv_total != null ? `${(v.conv_total * 100).toFixed(1)}%` : "—"}
                        {v.conv_total_mql != null && (
                          <span className="block text-[9px] text-muted-foreground font-normal">
                            MQL {(v.conv_total_mql * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {v.revenue > 0 ? formatCurrency(v.revenue) : "—"}
                      </td>
                      <td className={`p-2 text-right font-semibold ${(v.roas ?? 0) >= 1 ? "text-green-400" : "text-muted-foreground"}`}>
                        {v.roas != null ? `${v.roas.toFixed(1)}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance por Campanha — a leitura de cima, antes do criativo */}
      {(data?.campaigns_performance?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance por Campanha
              <span className="text-sm font-normal text-muted-foreground">
                ({data!.campaigns_performance!.length})
              </span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              As mesmas métricas do criativo, somadas por campanha. Taxas são recalculadas sobre o
              total da campanha, nunca média das taxas dos criativos.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr className="text-muted-foreground">
                    <th className="text-left p-2 min-w-[220px]">Campanha</th>
                    <th className="text-right p-2">Spend</th>
                    <th className="text-right p-2">LPV</th>
                    <th className="text-right p-2">Leads</th>
                    <th className="text-right p-2" title="Custo por lead">CTL</th>
                    <th className="text-right p-2">MQL</th>
                    <th className="text-right p-2" title="Custo por MQL">CPMQL</th>
                    <th className="text-right p-2" title="Reuniões agendadas">Agend.</th>
                    <th className="text-right p-2" title="Reuniões realizadas">Realiz.</th>
                    <th className="text-right p-2" title="Custo por reunião realizada">R$/Reun.</th>
                    <th className="text-right p-2" title="MQL que viraram reunião">Tx.Agend</th>
                    <th className="text-right p-2">Vendas</th>
                    <th className="text-right p-2" title="Vendas por reunião realizada">Win%</th>
                    <th className="text-right p-2" title="Custo de aquisição por venda">CAC</th>
                    <th className="text-right p-2" title="CAC das vendas de Sprint">CAC-S</th>
                    <th className="text-right p-2" title="CAC das vendas de assessoria">CAC-A</th>
                    <th className="text-right p-2" title="Leads que declararam de R$ 5 a 10 mil, e o custo por eles">5–10k / CP</th>
                    <th className="text-right p-2" title="Nota média (0–100) dos leads que a campanha trouxe. Separa volume de qualidade.">Tx.Qualif.</th>
                    <th className="text-right p-2" title="Sessões que entraram no quiz">Conv.Pág</th>
                    <th className="text-right p-2" title="Quem entrou no quiz e virou lead">Conv.Quiz</th>
                    <th className="text-right p-2" title="Sessões que viraram lead (e MQL embaixo)">Conv.Total</th>
                    <th className="text-right p-2" title="Faturamento da campanha">Receita</th>
                    <th className="text-right p-2" title="Receita ÷ mídia">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.campaigns_performance!.map((c) => (
                    <tr key={c.campaign} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.is_active ? "bg-green-500" : "bg-muted-foreground/40"}`}
                            title={c.is_active ? "Com gasto nos últimos 3 dias" : "Sem gasto recente"}
                          />
                          <span className="truncate max-w-[240px] font-medium" title={c.campaign}>
                            {c.campaign}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {c.creatives_count} criativo{c.creatives_count === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="p-2 text-right">{formatCurrency(c.spend)}</td>
                      <td className="p-2 text-right text-muted-foreground">{c.landing_page_views || "—"}</td>
                      <td className="p-2 text-right font-semibold">{c.leads_count}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {c.ctl != null ? formatCurrency(c.ctl) : "—"}
                      </td>
                      <td className="p-2 text-right font-semibold text-cyan-300">{c.mql_count}</td>
                      <td className="p-2 text-right">
                        {c.cost_per_mql != null ? formatCurrency(c.cost_per_mql) : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">{c.meetings_count || "—"}</td>
                      <td className="p-2 text-right">{c.meetings_attended_count || "—"}</td>
                      <td className="p-2 text-right">
                        {c.cost_per_meeting != null ? formatCurrency(c.cost_per_meeting) : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {c.meeting_rate != null ? `${(c.meeting_rate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-2 text-right font-semibold text-green-400">
                        {c.sales_count || 0}
                        {c.sales_count > 0 && (
                          <span className="block text-[9px] text-muted-foreground font-normal">
                            {c.sales_assessoria_count} assess.
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {c.win_rate != null ? `${(c.win_rate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-2 text-right">{c.cac != null ? formatCurrency(c.cac) : "—"}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {c.cac_sprint != null ? formatCurrency(c.cac_sprint) : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {c.cac_assessoria != null ? formatCurrency(c.cac_assessoria) : "—"}
                      </td>
                      <td className="p-2 text-right">
                        {c.leads_5_10k_count || "—"}
                        {c.cost_per_5_10k != null && (
                          <span className="block text-[9px] text-muted-foreground">
                            {formatCurrency(c.cost_per_5_10k)}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <TaxaQualificacao score={c.avg_lead_score} />
                      </td>
                      <td className="p-2 text-right">
                        {c.conv_page != null ? `${(c.conv_page * 100).toFixed(1)}%` : "—"}
                        {c.sessions_count > 0 && (
                          <span className="block text-[9px] text-muted-foreground">
                            {c.quiz_views_count}/{c.sessions_count}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        {c.conv_quiz != null ? `${(c.conv_quiz * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {c.conv_total != null ? `${(c.conv_total * 100).toFixed(1)}%` : "—"}
                        {c.conv_total_mql != null && (
                          <span className="block text-[9px] text-muted-foreground font-normal">
                            MQL {(c.conv_total_mql * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {c.revenue > 0 ? formatCurrency(c.revenue) : "—"}
                      </td>
                      <td className={`p-2 text-right font-semibold ${(c.roas ?? 0) >= 1 ? "text-green-400" : "text-muted-foreground"}`}>
                        {c.roas != null ? `${c.roas.toFixed(1)}x` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Performance por Criativo
              <span className="text-sm font-normal text-muted-foreground">({creatives.length})</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {somarCriativos ? "· somado por criativo (junta contas)" : "· uma linha por conta × anúncio"}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={somarCriativos ? "secondary" : "ghost"}
                size="sm"
                className="text-[10px] h-7"
                onClick={() => setSomarCriativos((v) => !v)}
                title={
                  "Junta numa linha só todas as contas em que o mesmo criativo rodou. " +
                  "Desligado por padrão: somar contas em silêncio foi o defeito corrigido em 18/09/2026 " +
                  "(o Luis-Nathan V3 aparecia com R$ 176,75 por MQL, número que não existia em conta nenhuma). " +
                  "Ligue quando a pergunta for sobre o CRIATIVO, não sobre a conta."
                }
              >
                <Layers className="w-3 h-3 mr-1" />
                {somarCriativos ? "Separar por conta" : "Somar por criativo"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] h-7"
                onClick={() => setColumnOrder([...DEFAULT_COLUMN_ORDER])}
                title="Restaurar ordem padrão das colunas"
              >
                <GripVertical className="w-3 h-3 mr-1" />
                Resetar colunas
              </Button>
            </div>
          </div>
          {somarCriativos && (
            <p className="text-[10px] text-amber-400 mt-1">
              Modo soma: cada linha pode juntar anúncios de contas diferentes. Gasto, leads, MQL e HQL somam;
              CAC, ROAS e todas as taxas são recalculados sobre os totais (nunca médias de taxas). A etiqueta
              “Σ N contas” marca as linhas que estão somando mais de uma conta.
            </p>
          )}
          {data?.fuso?.divergencia && (
            <p className="text-[10px] text-amber-400 mt-1">
              Fuso divergente: o gasto da Meta é contado no dia da CONTA e os leads no fuso do filtro
              ({data.fuso.offset_filtro_min / 60}h de UTC). Contas fora disso:{" "}
              {data.fuso.contas.filter((f) => f.divergente).map((f) => `${f.account_name || f.ad_account_id} (${f.fuso_usado})`).join(", ")}.
              Gasto e leads podem estar falando de dias diferentes nas bordas do período.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {creatives.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">
              Nenhum criativo encontrado no período. Verifique se os leads possuem utm_content preenchido.
            </p>
          ) : (
            (() => {
              type ColDef = {
                id: ColumnId;
                label: string;
                title?: string;
                width: string;
                sortField?: string;
                align?: "left" | "right";
                draggable?: boolean;
                renderCell: (c: CreativeData, ctx: { isBestCpmql2: boolean; i: number }) => JSX.Element;
              };
              const COLUMN_DEFS: Record<ColumnId, ColDef> = {
                creative: {
                  id: "creative", label: "Conta / Criativo", width: "14%", align: "left", draggable: false,
                  title:
                    "A linha é o par CONTA × ANÚNCIO. Até 18/09/2026 a tabela agrupava por NOME e " +
                    "fundia até 24 anúncios de 3 contas numa linha só — o Luis-Nathan V3 aparecia com " +
                    "R$ 176,75 por MQL, que não existia em conta nenhuma (as reais eram 255,50 / 150,16 / 180,14).",
                  renderCell: (c, { i }) => (
                    <div className="flex items-center gap-1">
                      <Circle className={`w-2 h-2 flex-shrink-0 ${c.is_active ? "fill-green-500 text-green-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                      {i < 3 && c.mql_count > 0 && (
                        <Star className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <EtiquetaDaConta c={c} />
                        {c.campaigns.length > 0 && (
                          <p className="text-[8px] text-muted-foreground truncate" title={c.campaigns.join(", ")}>
                            {c.campaigns.join(", ")}
                          </p>
                        )}
                        <p className="font-medium truncate text-[10px]" title={c.creative_label}>{c.creative_label}</p>
                        <code
                          className="text-[8px] text-muted-foreground truncate block"
                          title={c.ad_id ? `ad_id ${c.ad_id}` : c.creative_key}
                        >
                          {c.ad_id ? c.ad_id : c.creative_key}
                        </code>
                      </div>
                    </div>
                  ),
                },
                spend: {
                  id: "spend", label: "Spend", width: "5%", sortField: "spend",
                  renderCell: (c) => <>{formatCurrency(c.spend)}</>,
                },
                lpv: {
                  id: "lpv", label: "LPV", width: "5%", sortField: "landing_page_views",
                  title: "Landing Page Views e custo por LPV (Spend ÷ LPV)",
                  renderCell: (c) => {
                    const cpLpv = c.landing_page_views > 0 ? c.spend / c.landing_page_views : null;
                    return (
                      <span className="text-sky-400">
                        {c.landing_page_views > 0 ? (
                          <>
                            <div className="font-semibold">{formatNumber(c.landing_page_views)}</div>
                            {cpLpv !== null && (
                              <div className="text-[9px] text-muted-foreground">{formatCurrency(cpLpv)}</div>
                            )}
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </span>
                    );
                  },
                },
                conv_page: {
                  id: "conv_page", label: "Conv.Pág", width: "5%", sortField: "conv_page",
                  title: "Conversão da PÁGINA: entraram no quiz ÷ sessões × 100 (tracking próprio, não o LPV do Meta)",
                  renderCell: (c) => {
                    const sess = c.sessions_count || 0;
                    const quiz = c.quiz_views_count || 0;
                    const pct = sess > 0 ? (quiz / sess) * 100 : null;
                    if (pct === null) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span className="text-cyan-400">
                        <div className="font-semibold">{pct.toFixed(1)}%</div>
                        <div className="text-[9px] text-muted-foreground">{quiz}/{sess}</div>
                      </span>
                    );
                  },
                },
                conv_quiz: {
                  id: "conv_quiz", label: "Conv.Quiz", width: "5%", sortField: "conv_quiz",
                  title: "Conversão do QUIZ: leads ÷ entraram no quiz × 100",
                  renderCell: (c) => {
                    const quiz = c.quiz_views_count || 0;
                    const pct = quiz > 0 ? (c.leads_count / quiz) * 100 : null;
                    if (pct === null) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span className="text-violet-400">
                        <div className="font-semibold">{pct.toFixed(1)}%</div>
                        <div className="text-[9px] text-muted-foreground">{c.leads_count}/{quiz}</div>
                      </span>
                    );
                  },
                },
                conv_total: {
                  id: "conv_total", label: "Conv.Total", width: "6%", sortField: "conv_total",
                  title: "Funil inteiro: leads ÷ sessões × 100. Embaixo, sessão → MQL",
                  renderCell: (c) => {
                    const sess = c.sessions_count || 0;
                    const pct = sess > 0 ? (c.leads_count / sess) * 100 : null;
                    const pctMql = sess > 0 ? (c.mql_count / sess) * 100 : null;
                    if (pct === null) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span className="text-emerald-400">
                        <div className="font-semibold">{pct.toFixed(1)}%</div>
                        {pctMql !== null && (
                          <div className="text-[9px] text-muted-foreground">MQL {pctMql.toFixed(1)}%</div>
                        )}
                      </span>
                    );
                  },
                },
                leads: {
                  id: "leads", label: "Leads", width: "6%", sortField: "leads_count",
                  renderCell: (c) => <div className="font-semibold">{c.leads_count}</div>,
                },
                ctl: {
                  id: "ctl", label: "CTL", width: "5%", sortField: "ctl",
                  title: "Click-To-Lead: Leads ÷ Cliques no anúncio × 100",
                  renderCell: (c) => {
                    const ctl = c.clicks > 0 ? (c.leads_count / c.clicks) * 100 : null;
                    return (
                      <span className="text-emerald-300">
                        {ctl !== null ? (
                          <>
                            <div className="font-semibold">{ctl.toFixed(2)}%</div>
                            <div className="text-[9px] text-muted-foreground">{formatNumber(c.clicks)} cliques</div>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </span>
                    );
                  },
                },
                mql_cpmql: {
                  id: "mql_cpmql", label: "MQL", width: "7%", sortField: "mql_count",
                  title: "MQL: contagem · %MQL (Leads → MQL) · CPMQL (Spend ÷ MQL)",
                  renderCell: (c, { isBestCpmql2 }) => (
                    <div className={isBestCpmql2 ? "text-green-400" : ""}>
                      <div className="font-semibold text-green-400">{c.mql_count}</div>
                      <div className="text-[9px] text-muted-foreground">{formatPercent(c.mql_rate)}</div>
                      <div className={`text-[9px] ${isBestCpmql2 ? "font-bold text-green-400" : "text-muted-foreground"}`}>{formatCurrency(c.cost_per_mql)}</div>
                    </div>
                  ),
                },
                qualified_5_10k: {
                  id: "qualified_5_10k", label: "5–10k\n/ CP", width: "7%", sortField: "qualified_count",
                  title: "Leads com faturamento de R$ 5 mil a R$ 10 mil e custo por lead",
                  renderCell: (c) => (
                    <span className="text-amber-300">
                      {c.qualified_count > 0 ? (
                        <>
                          <div className="font-semibold">{c.qualified_count}</div>
                          <div className="text-muted-foreground text-[9px]">{formatCurrency(c.cost_per_qualified)}</div>
                        </>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                score: {
                  id: "score", label: "Tx.Qualif.", width: "6%", sortField: "avg_lead_score",
                  title:
                    "Nota média (0–100) dos leads desta linha, NA RÉGUA DA VERSÃO dominante. " +
                    "Quiz (v2.3) e formulário curto (v3-form) não são a mesma régua — a mesma faixa " +
                    "de faturamento dá 43,8 no quiz e 20,0 no formulário — então elas nunca entram " +
                    "na mesma média. Quando a linha tem as duas, a segunda aparece embaixo.",
                  renderCell: (c) => <NotaPorVersao c={c} />,
                },
                meetings: {
                  id: "meetings", label: "Reun.", width: "5%", sortField: "meetings_count",
                  renderCell: (c) => (
                    <span className="text-orange-400">
                      {c.meetings_count > 0 ? (
                        <><div className="font-semibold">{c.meetings_count}</div><div className="text-[9px] text-muted-foreground">{c.meetings_attended_count} real.</div></>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                cost_meeting: {
                  id: "cost_meeting", label: "R$/Reun.", width: "6%", sortField: "cost_meeting",
                  title: "Custo por reunião REALIZADA (Spend ÷ reuniões que aconteceram). É a métrica de decisão nº 2. Embaixo, o custo por reunião agendada",
                  renderCell: (c) => {
                    const real = c.meetings_attended_count > 0 ? c.spend / c.meetings_attended_count : null;
                    const ag = c.meetings_count > 0 ? c.spend / c.meetings_count : null;
                    if (real === null && ag === null) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span className="text-amber-400">
                        <div className="font-semibold">{real !== null ? formatCurrency(real) : "—"}</div>
                        {ag !== null && (
                          <div className="text-[9px] text-muted-foreground">ag. {formatCurrency(ag)}</div>
                        )}
                      </span>
                    );
                  },
                },
                booking_rate: {
                  id: "booking_rate", label: "Tx.Agend", width: "5%", sortField: "booking_rate",
                  title: "Taxa de agendamento: Reuniões / MQLs",
                  renderCell: (c) => {
                    const r = creativeExtras.get(chaveDaLinha(c))?.bookingRate;
                    if (r === null || r === undefined) return <span className="text-muted-foreground">—</span>;
                    const cls = r >= 0.5 ? "text-emerald-400" : r >= 0.25 ? "text-amber-400" : "text-muted-foreground";
                    return <span className={`font-semibold ${cls}`}>{(r * 100).toFixed(0)}%</span>;
                  },
                },
                call_conv: {
                  id: "call_conv", label: "Conv.Call", width: "5%", sortField: "call_conv_rate",
                  title: "Conversão de chamada: Vendas Assessoria / Reuniões",
                  renderCell: (c) => {
                    const r = creativeExtras.get(chaveDaLinha(c))?.callConvRate;
                    if (r === null || r === undefined) return <span className="text-muted-foreground">—</span>;
                    const cls = r >= 0.5 ? "text-emerald-400" : r >= 0.2 ? "text-amber-400" : "text-muted-foreground";
                    return <span className={`font-semibold ${cls}`}>{(r * 100).toFixed(0)}%</span>;
                  },
                },
                sales_cac: {
                  id: "sales_cac", label: "Vendas\n/ CAC", width: "7%", sortField: "sales_count",
                  title: "Vendas · CAC · Ciclo médio (dias)",
                  renderCell: (c) => {
                    const ext = creativeExtras.get(chaveDaLinha(c));
                    return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-right w-full hover:underline text-emerald-400">
                          <div className="font-semibold">{c.sales_count}</div>
                          {c.cac !== null && <div className="text-emerald-300/70 text-[9px]">{formatCurrency(c.cac)}</div>}
                          {ext && ext.cycleDays !== null && (
                            <div className="text-emerald-200/60 text-[9px]">{ext.cycleDays.toFixed(1)}d</div>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-3" align="end">
                        <p className="text-xs font-semibold mb-2">Vendas por Tipo</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>Geral:</span><span className="font-bold text-emerald-400">{c.sales_count}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-300">Sprint:</span><span className="font-bold text-emerald-300">{c.sales_sprint_count || 0}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-500">Assessoria:</span><span className="font-bold text-emerald-500">{c.sales_assessoria_count || 0}</span></div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    );
                  },
                },
                cac_sprint: {
                  id: "cac_sprint", label: "CAC-S", width: "5%", sortField: "cac_sprint",
                  title: "CAC Sprint: Spend / Vendas Sprint",
                  renderCell: (c) => (
                    <span className="text-emerald-300">
                      {c.sales_sprint_count > 0 ? (
                        <><div className="font-semibold">{c.sales_sprint_count}</div><div className="text-[9px]">{formatCurrency(creativeExtras.get(chaveDaLinha(c))?.cacSprint ?? null)}</div></>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                cac_assessoria: {
                  id: "cac_assessoria", label: "CAC/\nVendas-A", width: "5%", sortField: "cac_assessoria",
                  title: "CAC Assessoria: Spend / Vendas Assessoria",
                  renderCell: (c) => (
                    <span className="text-emerald-500">
                      {c.sales_assessoria_count > 0 ? (
                        <><div className="font-semibold">{c.sales_assessoria_count}</div><div className="text-[9px]">{formatCurrency(creativeExtras.get(chaveDaLinha(c))?.cacAssessoria ?? null)}</div></>
                      ) : <span className="text-muted-foreground">0</span>}
                    </span>
                  ),
                },
                win_rate: {
                  id: "win_rate", label: "Win%", width: "4.5%", sortField: "win_rate",
                  title: "Win Rate: Vendas / MQLs",
                  renderCell: (c) => {
                    const w = creativeExtras.get(chaveDaLinha(c))?.winRate;
                    if (w === null || w === undefined) return <span className="text-muted-foreground">—</span>;
                    const cls = w >= 0.3 ? "text-emerald-400" : w >= 0.1 ? "text-emerald-300" : "text-emerald-200/60";
                    return <span className={`font-semibold ${cls}`}>{(w * 100).toFixed(0)}%</span>;
                  },
                },
                revenue: {
                  id: "revenue", label: "FPC", width: "6%", sortField: "revenue",
                  renderCell: (c) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-right w-full hover:underline text-emerald-400">
                          <div className="font-semibold">{formatCurrency(c.revenue)}</div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-3" align="end">
                        <p className="text-xs font-semibold mb-2">Faturamento por Tipo</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>Geral:</span><span className="font-bold text-emerald-400">{formatCurrency(c.revenue)}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-300">Sprint:</span><span className="font-bold text-emerald-300">{formatCurrency(c.revenue_sprint || 0)}</span></div>
                          <div className="flex justify-between"><span className="text-emerald-500">Assessoria:</span><span className="font-bold text-emerald-500">{formatCurrency(c.revenue_assessoria || 0)}</span></div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ),
                },
                roas: {
                  id: "roas", label: "ROAS", width: "4.5%", sortField: "roas",
                  renderCell: (c) => (
                    <span className="font-bold">
                      {c.roas !== null ? <span className={c.roas >= 1 ? "text-emerald-400" : "text-emerald-200/50"}>{c.roas.toFixed(1)}x</span> : "—"}
                    </span>
                  ),
                },
              };
              const orderedCols = columnOrder.map((id) => COLUMN_DEFS[id]).filter(Boolean);
              return (
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="text-[10px] [&_th]:h-12 [&_th]:align-middle [&_th]:px-1 [&_th]:py-2 [&_th]:font-semibold [&_th]:leading-tight">
                  {orderedCols.map((col) => {
                    const isDraggable = col.draggable !== false;
                    const isDragOver = draggedCol && draggedCol !== col.id;
                    return (
                      <TableHead
                        key={col.id}
                        className={`${col.align === "left" ? "" : "text-right"} ${col.sortField ? "cursor-pointer hover:text-foreground" : ""} ${isDragOver ? "bg-primary/10" : ""}`}
                        style={{ width: col.width }}
                        title={col.title}
                        draggable={isDraggable}
                        onDragStart={(e) => {
                          if (!isDraggable) return;
                          setDraggedCol(col.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => { if (isDraggable) e.preventDefault(); }}
                        onDrop={(e) => {
                          if (!isDraggable || !draggedCol) return;
                          e.preventDefault();
                          moveColumn(draggedCol, col.id);
                          setDraggedCol(null);
                        }}
                        onDragEnd={() => setDraggedCol(null)}
                        onClick={() => col.sortField && handleSort(col.sortField)}
                      >
                        <span className={`inline-flex items-center gap-1 ${col.align === "left" ? "" : "justify-end w-full"}`}>
                          {isDraggable && (
                            <GripVertical
                              className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <span className="whitespace-pre-line text-center">{col.label}</span>
                          {col.sortField && <SortIcon field={col.sortField} />}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatives.map((c, i) => {
                  // Comparação pela LINHA: com duas linhas do mesmo criativo em
                  // contas diferentes, comparar por `creative_key` pintaria as
                  // duas como "a melhor".
                  const isBestMql = topMql && chaveDaLinha(c) === chaveDaLinha(topMql) && c.mql_count > 0;
                  const isBestCpmql2 = bestCpmql && chaveDaLinha(c) === chaveDaLinha(bestCpmql);
                  const isBestRevenue = topRevenue && chaveDaLinha(c) === chaveDaLinha(topRevenue) && c.revenue > 0;
                  return (
                    <TableRow
                      key={chaveDaLinha(c)}
                      className={`cursor-pointer hover:bg-muted/50 ${isBestMql ? "bg-green-500/5" : ""} ${isBestRevenue ? "bg-emerald-500/5" : ""}`}
                      onClick={() => setDrillCreative(c)}
                    >
                      {orderedCols.map((col) => (
                        <TableCell
                          key={col.id}
                          className={`${col.id === "creative" ? "px-1" : "text-right px-1"} text-[10px] py-1.5`}
                        >
                          {col.renderCell(c, { isBestCpmql2: !!isBestCpmql2, i })}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Data Quality */}
      {dq && (
        <Card className="border-yellow-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Qualidade dos Dados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Leads com creative_key</p>
                <p className="font-bold">
                  {dq.leads_with_creative}/{dq.leads_total}
                  <span className="text-muted-foreground ml-1">
                    ({dq.leads_total > 0 ? ((dq.leads_with_creative / dq.leads_total) * 100).toFixed(0) : 0}%)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Spend mapeado</p>
                <p className="font-bold">
                  {formatCurrency(dq.spend_mapped)} / {formatCurrency(dq.spend_total)}
                  <span className="text-muted-foreground ml-1">
                    ({dq.spend_total > 0 ? ((dq.spend_mapped / dq.spend_total) * 100).toFixed(0) : 0}%)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Leads sem UTMs</p>
                <p className="font-bold">{dq.leads_without_utms}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Vendas sem creative_key</p>
                <p className="font-bold">{dq.sales_without_creative}</p>
              </div>
              <div>
                <p
                  className="text-muted-foreground"
                  title="Leads que chegaram com a macro da Meta sem substituir ({{ad.id}}): clique em PRÉVIA de anúncio dentro do Gerenciador. Não é tráfego pago nem orgânico — fica num balde próprio, fora das duas contas."
                >
                  Prévia do Gerenciador
                </p>
                <p className={`font-bold ${(dq.leads_previa_gerenciador ?? 0) > 0 ? "text-purple-300" : ""}`}>
                  {dq.leads_previa_gerenciador ?? 0}
                </p>
              </div>
              {dq.identidade_por_metodo && (
                <div className="col-span-2">
                  <p
                    className="text-muted-foreground"
                    title="Como cada LINHA da tabela foi identificada. ad_id e utm_content_id são os caminhos fortes; nome_unico, nome_na_conta e nome_por_gasto resolveram pelo NOME do criativo (nesta ordem de confiança); sem_anuncio é o balde de quem trouxe nome sem anúncio correspondente."
                  >
                    Linhas por método de identificação
                  </p>
                  <p className="font-bold text-[11px]">
                    {Object.entries(dq.identidade_por_metodo)
                      .sort((a, b) => b[1] - a[1])
                      .map(([m, n]) => `${m}: ${n}`)
                      .join(" · ")}
                  </p>
                </div>
              )}
            </div>
            {dq.spend_total > 0 && dq.spend_mapped < dq.spend_total && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                {((1 - dq.spend_mapped / dq.spend_total) * 100).toFixed(0)}% do gasto não pôde ser atribuído a criativos por falta de UTMs/naming.
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* Drill-down Dialog */}
      <Dialog open={!!drillCreative} onOpenChange={(open) => !open && setDrillCreative(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {drillCreative && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Circle className={`w-3 h-3 ${drillCreative.is_active ? "fill-green-500 text-green-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                  {drillCreative.creative_label}
                  <Badge variant="outline" className={`text-[10px] ${drillCreative.is_active ? "border-green-500/50 text-green-400" : "border-muted text-muted-foreground"}`}>
                    {drillCreative.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  {drillCreative.creative_source_field === "fallback" && (
                    <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">fallback</Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Key metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Leads</p>
                    <p className="text-lg font-bold">{drillCreative.leads_count}</p>
                  </div>
                  <div className="p-3 bg-green-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">MQL</p>
                    <p className="text-lg font-bold text-green-400">{drillCreative.mql_count}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">%MQL</p>
                    <p className="text-lg font-bold">{formatPercent(drillCreative.mql_rate)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">
                      Lead Score · {rotuloVersaoScore(drillCreative.score_versao_dominante)}
                    </p>
                    <p className={`text-lg font-bold ${
                      drillCreative.avg_lead_score == null ? "" :
                      drillCreative.score_versao_dominante === "v3-form" ? "text-muted-foreground" :
                      drillCreative.avg_lead_score >= 75 ? "text-emerald-400" :
                      drillCreative.avg_lead_score >= 50 ? "text-amber-400" :
                      drillCreative.avg_lead_score >= 25 ? "text-blue-400" :
                      "text-muted-foreground"
                    }`}>
                      {drillCreative.avg_lead_score ?? "—"}<span className="text-xs text-muted-foreground">/100</span>
                    </p>
                    {/* As outras réguas, NUNCA somadas à de cima. */}
                    {Object.entries(drillCreative.score_por_versao ?? {})
                      .filter(([v]) => v !== drillCreative.score_versao_dominante)
                      .map(([v, x]) => (
                        <p key={v} className="text-[10px] text-muted-foreground">
                          {x.media}/100 · {rotuloVersaoScore(v)} ({x.n})
                        </p>
                      ))}
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Spend</p>
                    <p className="text-lg font-bold">{formatCurrency(drillCreative.spend)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">CPMQL</p>
                    <p className="text-lg font-bold">{formatCurrency(drillCreative.cost_per_mql)}</p>
                  </div>
                  <div className="p-3 bg-orange-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Reuniões</p>
                    <p className="text-lg font-bold text-orange-400">{drillCreative.meetings_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_meeting)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Small</p>
                    <p className="text-lg font-bold">{drillCreative.tier_small_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_small)}</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Medium</p>
                    <p className="text-lg font-bold text-blue-400">{drillCreative.tier_medium_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_medium)}</p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Large</p>
                    <p className="text-lg font-bold text-amber-400">{drillCreative.tier_large_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_tier_large)}</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Enterprise</p>
                    <p className="text-lg font-bold text-purple-400">{drillCreative.tier_enterprise_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_enterprise)}</p>
                  </div>
                  <div className="p-3 bg-pink-500/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Enterprise+</p>
                    <p className="text-lg font-bold text-pink-400">{drillCreative.tier_enterprise_plus_count}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(drillCreative.cost_per_enterprise_plus)}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">ROAS</p>
                    <p className="text-lg font-bold">{drillCreative.roas !== null ? `${drillCreative.roas.toFixed(2)}x` : "—"}</p>
                  </div>
                </div>

                {/* Leads by stage */}
                {Object.keys(drillCreative.leads_by_stage).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase">Distribuição por Estágio</h4>
                    <div className="space-y-1">
                      {Object.entries(drillCreative.leads_by_stage).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                        <div key={stage} className="flex items-center justify-between text-sm">
                          <span>{stage}</span>
                          <span className="font-mono">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campaigns */}
                {drillCreative.campaigns.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase">Campanhas associadas</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {drillCreative.campaigns.map(c => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerts */}
                <div className="space-y-2">
                  {drillCreative.spend > 0 && drillCreative.leads_count === 0 && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
                      <AlertTriangle className="w-4 h-4 inline mr-1" /> Existe gasto mas nenhum lead atribuído.
                    </div>
                  )}
                  {drillCreative.leads_count > 0 && drillCreative.spend === 0 && (
                    <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-300">
                      <AlertTriangle className="w-4 h-4 inline mr-1" /> Leads atribuídos mas sem gasto registrado.
                    </div>
                  )}
                </div>

                {/* Identidade da linha: ID manda, nome é apresentação. */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>Conta:</strong>{" "}
                    {drillCreative.account_name || drillCreative.ad_account_id || "não determinada"}
                    {drillCreative.ad_account_id && drillCreative.account_name
                      ? ` (${drillCreative.ad_account_id})`
                      : ""}
                  </p>
                  <p><strong>ad_id:</strong> {drillCreative.ad_id || "—"}</p>
                  <p><strong>Identificado por:</strong> {drillCreative.identidade_metodo || "—"}</p>
                  <p><strong>Creative Key:</strong> {drillCreative.creative_key}</p>
                  <p><strong>Fonte:</strong> {drillCreative.creative_source_field}</p>
                  {drillCreative.last_activity && (
                    <p><strong>Última atividade:</strong> {new Date(drillCreative.last_activity).toLocaleDateString("pt-BR")}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Sale Dialog */}
      <Dialog open={showAddSale} onOpenChange={(open) => {
        setShowAddSale(open);
        if (!open) setSelectedLeadId(null);
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* De qual funil veio. Fica no topo porque muda o resto do
                formulário: indicação e social selling não passam pelo quiz e
                por isso não têm lead para escolher. */}
            <div>
              <label className="text-sm text-muted-foreground">Origem da venda *</label>
              <Select
                value={saleForm.origem}
                onValueChange={(v) => {
                  const origem = v as Origem;
                  setSaleForm(p => ({ ...p, origem }));
                  // Trocar para um funil sem formulário limpa o lead escolhido:
                  // manter a seleção anexaria a venda a um criativo que não a
                  // gerou, e o custo por venda daquele criativo cairia sozinho.
                  if (precisaNomeManual(origem)) setSelectedLeadId(null);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {ORIGENS.find(o => o.value === saleForm.origem)?.hint}
              </p>
            </div>

            {precisaNomeManual(saleForm.origem) ? (
              <div>
                <label className="text-sm text-muted-foreground">Nome do cliente *</label>
                <Input
                  placeholder="Quem comprou"
                  value={saleForm.lead_nome}
                  onChange={e => setSaleForm(p => ({ ...p, lead_nome: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Esta venda não passou pelo formulário, então não existe lead no sistema.
                  O CRM de social selling vai preencher esta parte no futuro.
                </p>
              </div>
            ) : (
              <LeadSearchPicker
                leads={leadsList}
                loading={leadsLoading}
                selectedId={selectedLeadId}
                onSelect={setSelectedLeadId}
                label="Lead (opcional)"
              />
            )}

            {!precisaNomeManual(saleForm.origem) && selectedSaleLead && (
              <div className="p-3 rounded-md bg-accent/20 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criativo:</span>
                  <span className="font-medium">{selectedSaleLead.utm_content || "Sem criativo (Direct)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier:</span>
                  <Badge variant="outline" className="text-[10px]">{selectedSaleLead.tier || "—"}</Badge>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground">Produto *</label>
              <Select value={saleForm.sale_type} onValueChange={(v) => setSaleForm(p => ({ ...p, sale_type: v as "sprint" | "assessoria" | "parceria" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sprint">Sprint</SelectItem>
                  <SelectItem value="assessoria">Assessoria Completa</SelectItem>
                  <SelectItem value="parceria">Assessoria Parceria (comissão)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Parceria não tem contrato: a Champion ganha comissão sobre o
                resultado do cliente. Esconder receita, pagamento e recebido não
                é economia de tela — é impedir que um campo esquecido vire
                faturamento previsto que nunca vai existir. */}
            {saleForm.sale_type === "parceria" ? (
              <div className="border border-amber-500/25 bg-amber-500/5 rounded-lg p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-amber-300">Venda por comissão</p>
                  <p className="text-[11px] text-muted-foreground">
                    Sem TCV, sem parcela e sem caixa no fechamento. Ela conta como contrato
                    fechado e fica fora do ticket médio e da projeção de receita.
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Comissão (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 10"
                    value={saleForm.commission_pct}
                    onChange={e => setSaleForm(p => ({ ...p, commission_pct: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Percentual acordado sobre o resultado do cliente. Opcional, mas é o
                    único número que descreve o acordo.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-sm text-muted-foreground">Receita (R$) *</label>
                <Input type="number" step="0.01" placeholder="5000.00" value={saleForm.revenue} onChange={e => setSaleForm(p => ({ ...p, revenue: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-1">Valor total do contrato (TCV).</p>
              </div>
            )}
            {saleForm.sale_type !== "parceria" && (
            <div>
              <label className="text-sm text-muted-foreground">Forma de pagamento *</label>
              <Select
                value={saleForm.payment_type}
                onValueChange={(v) => {
                  const pt = v as "tcv_total" | "pix_parcelado" | "recorrencia";
                  setSaleForm(p => ({
                    ...p,
                    payment_type: pt,
                    amount_received: pt === "tcv_total" ? p.revenue : p.amount_received,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcv_total">TCV à vista (total)</SelectItem>
                  <SelectItem value="pix_parcelado">Pix parcelado</SelectItem>
                  <SelectItem value="recorrencia">Recorrência (mensal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}
            {saleForm.sale_type !== "parceria" && saleForm.payment_type === "pix_parcelado" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Nº de parcelas</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="12"
                    value={saleForm.installments_count}
                    onChange={e => {
                      const count = e.target.value;
                      setSaleForm(p => {
                        const c = parseInt(count);
                        const v = parseFloat(p.installment_value);
                        const revenue = !isNaN(c) && !isNaN(v) ? String(+(c * v).toFixed(2)) : p.revenue;
                        return { ...p, installments_count: count, revenue };
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Valor da parcela (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="500.00"
                    value={saleForm.installment_value}
                    onChange={e => {
                      const val = e.target.value;
                      setSaleForm(p => {
                        const c = parseInt(p.installments_count);
                        const v = parseFloat(val);
                        const revenue = !isNaN(c) && !isNaN(v) ? String(+(c * v).toFixed(2)) : p.revenue;
                        return { ...p, installment_value: val, revenue };
                      });
                    }}
                  />
                </div>
              </div>
            )}
            {saleForm.sale_type !== "parceria" && saleForm.payment_type === "recorrencia" && (
              <div>
                <label className="text-sm text-muted-foreground">Valor mensal (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="2000.00"
                  value={saleForm.installment_value}
                  onChange={e => {
                    const val = e.target.value;
                    setSaleForm(p => ({ ...p, installment_value: val, revenue: val || p.revenue }));
                  }}
                />
                <p className="text-[10px] text-muted-foreground mt-1">TCV considera apenas o valor mensal.</p>
              </div>
            )}
            {saleForm.sale_type !== "parceria" && (
            <div>
              <label className="text-sm text-muted-foreground">Já recebido (R$)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={saleForm.amount_received}
                onChange={e => setSaleForm(p => ({ ...p, amount_received: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Quanto já entrou na conta. O restante fica como "a receber".</p>
            </div>
            )}
            {saleForm.sale_type === "sprint" && (
              <div>
                <label className="text-sm text-muted-foreground">Quantos sprints (nível) *</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ex: 4"
                  value={saleForm.sprint_levels}
                  onChange={e => setSaleForm(p => ({ ...p, sprint_levels: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  O Sprint é vendido por nível: "Sprint nível 4" são 4 sprints e 16 ads. Sem isso a
                  venda conta como uma só e o ticket do produto sai errado.
                </p>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Meses de entrega</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 6"
                value={saleForm.delivery_months}
                onChange={e => setSaleForm(p => ({ ...p, delivery_months: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Duração do contrato. Junto com os criativos, define o custo de entrega.</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Criativos contratados</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 150"
                value={saleForm.ads_contracted}
                onChange={e => setSaleForm(p => ({ ...p, ads_contracted: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Total de ads do contrato. A 4 ganchos por body: 150 ads em 3 meses = 50/mês = 12 bodys/mês = 36 no total.</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Bodys por mês</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 25"
                value={saleForm.bodies_per_month}
                onChange={e => setSaleForm(p => ({ ...p, bodies_per_month: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Preencha quando o contrato foi fechado em bodys ("25B mês"). Se os criativos acima estiverem preenchidos, eles mandam.</p>
            </div>
            {saleForm.sale_type !== "parceria" && (
              <div>
                <label className="text-sm text-muted-foreground">E-mail do cliente</label>
                <Input
                  type="email"
                  placeholder="cliente@email.com"
                  value={saleForm.cliente_email}
                  onChange={e => setSaleForm(p => ({ ...p, cliente_email: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {saleForm.sale_type === "assessoria"
                    ? "Preenchido, o cliente já nasce no Hub como Assessoria de Criativos e recebe o acesso ao portal neste e-mail. O copy se escolhe no Hub."
                    : "Preenchido, o cliente já nasce no Hub como Sprint, na Etapa 1 (Briefing)."}
                </p>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input placeholder="Notas adicionais" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer *</label>
              <Select value={saleForm.closer} onValueChange={(v) => setSaleForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Miguel">Miguel</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                  <SelectItem value={CLOSER_DUPLA}>Caio e Rodger (call em dupla)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAddSale}
              disabled={
                savingSale ||
                !saleForm.revenue ||
                (precisaNomeManual(saleForm.origem)
                  ? !saleForm.lead_nome.trim()
                  : !selectedLeadId)
              }
              className="w-full"
            >
              {savingSale ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Registrar Venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DetalheReuniao
        reuniao={reuniaoDetalhe}
        aoFechar={() => setReuniaoDetalhe(null)}
        rotuloPagina={headlineLabel}
        autor={pessoaDesteAparelho() || reuniaoDetalhe?.closer || "Caio"}
        aoSalvarMotivo={(id, categoria, detalhe, por) => {
          const patch = {
            motivo_categoria: categoria,
            motivo_detalhe: detalhe,
            motivo_por: por,
            motivo_at: new Date().toISOString(),
          };
          setMeetingsList(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
          setReuniaoDetalhe(r => (r && r.id === id ? { ...r, ...patch } : r));
          avisarAoVivo({ tipo: "reuniao", acao: "atualizada", por });
        }}
      />

      {/* Add Meeting Dialog */}
      <Dialog open={showAddMeeting} onOpenChange={(open) => {
        setShowAddMeeting(open);
        if (!open) setMeetingSelectedLeadId(null);
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Reunião</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Origem da reunião *</label>
              <Select
                value={meetingForm.origem}
                onValueChange={(v) => {
                  const origem = v as Origem;
                  setMeetingForm(p => ({ ...p, origem }));
                  if (precisaNomeManual(origem)) setMeetingSelectedLeadId(null);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {ORIGENS.find(o => o.value === meetingForm.origem)?.hint}
              </p>
            </div>

            {precisaNomeManual(meetingForm.origem) ? (
              <div>
                <label className="text-sm text-muted-foreground">Nome do lead *</label>
                <Input
                  placeholder="Com quem é a call"
                  value={meetingForm.lead_nome}
                  onChange={e => setMeetingForm(p => ({ ...p, lead_nome: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Este lead não passou pelo formulário, então não existe no sistema.
                </p>
              </div>
            ) : (
              <LeadSearchPicker
                leads={leadsList}
                loading={leadsLoading}
                selectedId={meetingSelectedLeadId}
                onSelect={setMeetingSelectedLeadId}
              />
            )}

            {/* Auto-filled info */}
            {!precisaNomeManual(meetingForm.origem) && selectedMeetingLead && (
              <div className="p-3 rounded-md bg-accent/20 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criativo:</span>
                  <span className="font-medium">{selectedMeetingLead.utm_content || "Sem criativo (Direct)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mercado:</span>
                  <span>{selectedMeetingLead.mercado}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tier:</span>
                  <Badge variant="outline" className="text-[10px]">{selectedMeetingLead.tier || "—"}</Badge>
                </div>
              </div>
            )}

            {/* ── Processo Abóbora ────────────────────────────────────────
                O que o SDR precisa ter descoberto antes de a call chegar ao
                closer. A reunião não é registrada sem isso, aqui e no backend:
                validação que mora só na tela não é validação. */}
            <div className="border border-orange-500/25 bg-orange-500/5 rounded-lg p-3 space-y-4">
              <div>
                <p className="text-sm font-semibold text-orange-300">Processo Abóbora</p>
                <p className="text-[11px] text-muted-foreground">
                  Obrigatório. A reunião só entra no sistema com estas respostas preenchidas.
                </p>
              </div>

              {PERGUNTAS_ABOBORA.map((q) => {
                if (q.soQuandoNaoDecide && meetingForm.abobora_decide !== "nao") return null;
                return (
                  <div key={q.campo}>
                    <label className="text-xs font-medium text-foreground leading-snug block">
                      {q.titulo}
                    </label>
                    {q.ajuda && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{q.ajuda}</p>
                    )}
                    {q.tipo === "simnao" ? (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {(["sim", "nao"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setMeetingForm(p => ({ ...p, abobora_decide: v }))}
                            className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                              meetingForm.abobora_decide === v
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:border-primary/60"
                            }`}
                          >
                            {v === "sim" ? "Sim, ele decide" : "Não, depende de outra pessoa"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        rows={2}
                        className="mt-2 text-sm"
                        placeholder="Resposta"
                        value={meetingForm[q.campo] as string}
                        onChange={e => setMeetingForm(p => ({ ...p, [q.campo]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}

              {faltasDoAbobora.length > 0 && (
                <p className="text-[11px] text-amber-400">
                  Falta responder: {faltasDoAbobora.join(", ")}.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input placeholder="Notas adicionais" value={meetingForm.notes} onChange={e => setMeetingForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Data e hora da call</label>
              <Input
                type="datetime-local"
                value={meetingForm.scheduled_at}
                onChange={e => setMeetingForm(p => ({ ...p, scheduled_at: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A reunião entra como <strong>agendada</strong>. Marque realizada ou no-show depois que ela acontecer.
                Precisa de <strong>3 horas</strong> de distância de outra call do mesmo closer.
              </p>
              {/* Obrigatória. Sem a data da call não existe evento no Google,
                  não dá para checar as 3 horas, e "realizada" passa a contar no
                  dia em que foi MARCADA, não no dia em que aconteceu — que é o
                  que embaralha a meta do mês. Hoje 27 das 29 reuniões do banco
                  estão sem esta data. */}
              {!meetingForm.scheduled_at && (
                <p className="mt-1 text-[11px] text-amber-400">
                  Obrigatória: é ela que cria o evento na agenda e que define em que mês a
                  reunião conta como realizada.
                </p>
              )}
              {(() => {
                const choque = choqueDeAgenda(meetingForm.scheduled_at, meetingForm.closer);
                if (!choque) return null;
                return (
                  <p className="mt-2 flex gap-2 text-[11px] text-rose-400 border border-rose-500/25 bg-rose-500/5 rounded p-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Menos de 3h da call de {choque.closer || "closer"} em{" "}
                      {choque.scheduled_at ? format(new Date(choque.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : "?"}
                      {choque.notes ? ` (${choque.notes.split(" — ")[0]})` : ""}.
                    </span>
                  </p>
                );
              })()}
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer *</label>
              <Select value={meetingForm.closer} onValueChange={(v) => setMeetingForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                  <SelectItem value={CLOSER_DUPLA}>Caio e Rodger (call em dupla)</SelectItem>
                </SelectContent>
              </Select>
              {meetingForm.closer && (
                CLOSER_CALENDARS[meetingForm.closer] ? (
                  <a
                    href={CLOSER_CALENDARS[meetingForm.closer]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Calendar className="w-3 h-3" /> Abrir agenda do {meetingForm.closer}
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Link da agenda do {meetingForm.closer} a definir.</p>
                )
              )}
            </div>
            <Button
              onClick={handleAddMeeting}
              disabled={
                savingMeeting ||
                faltasDoAbobora.length > 0 ||
                !meetingForm.scheduled_at ||
                !!choqueDeAgenda(meetingForm.scheduled_at, meetingForm.closer) ||
                (precisaNomeManual(meetingForm.origem)
                  ? !meetingForm.lead_nome.trim()
                  : !meetingSelectedLeadId)
              }
              className="w-full"
            >
              {savingMeeting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Agendar Reunião
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Sale Dialog */}
      <Dialog open={!!editingSale} onOpenChange={(open) => !open && setEditingSale(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Origem da venda *</label>
              <Select
                value={editSaleForm.origem}
                onValueChange={(v) => setEditSaleForm(p => ({ ...p, origem: v as Origem }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGENS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Só mídia paga entra na conta de custo por venda e na atribuição por criativo.
              </p>
            </div>
            {precisaNomeManual(editSaleForm.origem) && (
              <div>
                <label className="text-sm text-muted-foreground">Nome do cliente</label>
                <Input
                  placeholder="Quem comprou"
                  value={editSaleForm.lead_nome}
                  onChange={e => setEditSaleForm(p => ({ ...p, lead_nome: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Produto *</label>
              <Select value={editSaleForm.sale_type} onValueChange={(v) => setEditSaleForm(p => ({ ...p, sale_type: v as "sprint" | "assessoria" | "parceria" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sprint">Sprint</SelectItem>
                  <SelectItem value="assessoria">Assessoria Completa</SelectItem>
                  <SelectItem value="parceria">Assessoria Parceria (comissão)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Receita (R$) *</label>
              <Input type="number" step="0.01" value={editSaleForm.revenue} onChange={e => setEditSaleForm(p => ({ ...p, revenue: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground mt-1">Valor total do contrato (TCV).</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Forma de pagamento *</label>
              <Select
                value={editSaleForm.payment_type}
                onValueChange={(v) => setEditSaleForm(p => ({ ...p, payment_type: v as "tcv_total" | "pix_parcelado" | "recorrencia" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcv_total">TCV à vista (total)</SelectItem>
                  <SelectItem value="pix_parcelado">Pix parcelado</SelectItem>
                  <SelectItem value="recorrencia">Recorrência (mensal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editSaleForm.payment_type === "pix_parcelado" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Nº de parcelas</label>
                  <Input
                    type="number"
                    min="1"
                    value={editSaleForm.installments_count}
                    onChange={e => {
                      const count = e.target.value;
                      setEditSaleForm(p => {
                        const c = parseInt(count);
                        const v = parseFloat(p.installment_value);
                        const revenue = !isNaN(c) && !isNaN(v) ? String(+(c * v).toFixed(2)) : p.revenue;
                        return { ...p, installments_count: count, revenue };
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Valor da parcela (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editSaleForm.installment_value}
                    onChange={e => {
                      const val = e.target.value;
                      setEditSaleForm(p => {
                        const c = parseInt(p.installments_count);
                        const v = parseFloat(val);
                        const revenue = !isNaN(c) && !isNaN(v) ? String(+(c * v).toFixed(2)) : p.revenue;
                        return { ...p, installment_value: val, revenue };
                      });
                    }}
                  />
                </div>
              </div>
            )}
            {editSaleForm.payment_type === "recorrencia" && (
              <div>
                <label className="text-sm text-muted-foreground">Valor mensal (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editSaleForm.installment_value}
                  onChange={e => {
                    const val = e.target.value;
                    setEditSaleForm(p => ({ ...p, installment_value: val, revenue: val || p.revenue }));
                  }}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Já recebido (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={editSaleForm.amount_received}
                onChange={e => setEditSaleForm(p => ({ ...p, amount_received: e.target.value }))}
              />
            </div>
            {editSaleForm.sale_type === "sprint" && (
              <div>
                <label className="text-sm text-muted-foreground">Quantos sprints (nível)</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ex: 4"
                  value={editSaleForm.sprint_levels}
                  onChange={e => setEditSaleForm(p => ({ ...p, sprint_levels: e.target.value }))}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  "Sprint nível 4" são 4 sprints e 16 ads.
                </p>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Meses de entrega</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={editSaleForm.delivery_months}
                onChange={e => setEditSaleForm(p => ({ ...p, delivery_months: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Duração do contrato. Junto com os criativos, define o custo de entrega.</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Criativos contratados</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 150"
                value={editSaleForm.ads_contracted}
                onChange={e => setEditSaleForm(p => ({ ...p, ads_contracted: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Total de ads do contrato. A 4 ganchos por body: 150 ads em 3 meses = 50/mês = 12 bodys/mês = 36 no total.</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Bodys por mês</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 25"
                value={editSaleForm.bodies_per_month}
                onChange={e => setEditSaleForm(p => ({ ...p, bodies_per_month: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Preencha quando o contrato foi fechado em bodys ("25B mês"). Se os criativos acima estiverem preenchidos, eles mandam.</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input value={editSaleForm.notes} onChange={e => setEditSaleForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer *</label>
              <Select value={editSaleForm.closer} onValueChange={(v) => setEditSaleForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                  <SelectItem value={CLOSER_DUPLA}>Caio e Rodger (call em dupla)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Reembolso. Fica aqui, e não num botão de excluir: apagar a venda
                sumia com a atribuição do criativo, deixava a reunião sem
                desfecho e não respondia por que a venda não se sustentou. */}
            <div className={`border rounded-lg p-3 space-y-3 ${editSaleForm.refunded_at ? "border-rose-500/40 bg-rose-500/5" : "border-border"}`}>
              <div>
                <p className="text-sm font-semibold">{editSaleForm.refunded_at ? "Venda reembolsada" : "Reembolso"}</p>
                <p className="text-[11px] text-muted-foreground">
                  Preencher a data tira a venda da receita, do TCV, do caixa, da meta e do CAC.
                  Ela continua no histórico do criativo. Apagar a data desfaz.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">Data do reembolso</label>
                  <Input type="date" value={editSaleForm.refunded_at} onChange={e => setEditSaleForm(p => ({ ...p, refunded_at: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Valor devolvido (R$)</label>
                  <Input type="number" step="0.01" placeholder={editSaleForm.amount_received || "0.00"} value={editSaleForm.refund_amount} onChange={e => setEditSaleForm(p => ({ ...p, refund_amount: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Por que devolveu</label>
                <Input placeholder="Nas palavras de quem atendeu" value={editSaleForm.refund_reason} onChange={e => setEditSaleForm(p => ({ ...p, refund_reason: e.target.value }))} />
              </div>
            </div>
            <Button onClick={handleEditSale} disabled={savingEditSale} className="w-full">
              {savingEditSale ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Dialog */}
      <Dialog open={!!editingMeeting} onOpenChange={(open) => !open && setEditingMeeting(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Reunião</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* De quem é esta reunião, em destaque e sem depender da observação.
                O criativo e a página vêm junto porque são o que liga a call ao
                anúncio que a gerou — e é essa ligação que o painel usa para
                dizer qual criativo produz reunião. */}
            {editingMeeting && (
              <div className="p-3 rounded-md bg-accent/20 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Lead:</span>
                  <span className="font-medium text-right">
                    {editingMeeting.lead_nome_resolvido || "sem lead no sistema"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Criativo:</span>
                  <span className="text-right">{editingMeeting.utm_content || editingMeeting.creative_key || "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Página:</span>
                  <span className="text-right">
                    {editingMeeting.headline_path ? headlineLabel(editingMeeting.headline_path) : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Origem:</span>
                  <span className="text-right">{ROTULO_ORIGEM[editingMeeting.origem || "midia_paga"]}</span>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Observação</label>
              <Input
                placeholder="Só a observação. O nome do lead está acima."
                value={editMeetingForm.notes}
                onChange={e => setEditMeetingForm(p => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Closer</label>
              <Select value={editMeetingForm.closer} onValueChange={(v) => setEditMeetingForm(p => ({ ...p, closer: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o closer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Caio">Caio</SelectItem>
                  <SelectItem value="Rodger">Rodger</SelectItem>
                  <SelectItem value={CLOSER_DUPLA}>Caio e Rodger (call em dupla)</SelectItem>
                </SelectContent>
              </Select>
              {editMeetingForm.closer && (
                CLOSER_CALENDARS[editMeetingForm.closer] ? (
                  <a
                    href={CLOSER_CALENDARS[editMeetingForm.closer]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Calendar className="w-3 h-3" /> Abrir agenda do {editMeetingForm.closer}
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Link da agenda do {editMeetingForm.closer} a definir.</p>
                )
              )}
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Data e hora da call</label>
              <Input
                type="datetime-local"
                value={editMeetingForm.scheduled_at}
                onChange={e => setEditMeetingForm(p => ({ ...p, scheduled_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Situação</label>
              <Select value={editMeetingForm.status} onValueChange={(v) => setEditMeetingForm(p => ({ ...p, status: v as MeetingStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada — ainda vai acontecer</SelectItem>
                  <SelectItem value="realizada">Realizada — a pessoa apareceu</SelectItem>
                  <SelectItem value="no_show">No-show — a pessoa faltou</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Só realizada e no-show entram na taxa de comparecimento. Enquanto estiver agendada, a reunião fica fora da conta.
              </p>
            </div>
            {/* Abóbora das reuniões já registradas. Só é enviado quando alguém
                mexe: reunião anterior a 03/09/2026 não tem essas respostas e
                nunca vai ter, e o backend recusaria a edição inteira se elas
                fossem junto vazias em toda gravada. */}
            <div className="border border-orange-500/25 bg-orange-500/5 rounded-lg p-3 space-y-4">
              <p className="text-sm font-semibold text-orange-300">Processo Abóbora</p>
              {PERGUNTAS_ABOBORA.map((q) => {
                if (q.soQuandoNaoDecide && editMeetingForm.abobora_decide !== "nao") return null;
                return (
                  <div key={q.campo}>
                    <label className="text-xs font-medium text-foreground leading-snug block">{q.titulo}</label>
                    {q.tipo === "simnao" ? (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {(["sim", "nao"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setEditMeetingForm(p => ({ ...p, abobora_decide: v }))}
                            className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                              editMeetingForm.abobora_decide === v
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:border-primary/60"
                            }`}
                          >
                            {v === "sim" ? "Sim, ele decide" : "Não, depende de outra pessoa"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        rows={2}
                        className="mt-2 text-sm"
                        value={editMeetingForm[q.campo] as string}
                        onChange={e => setEditMeetingForm(p => ({ ...p, [q.campo]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
              {aboboraTocadoNaEdicao && faltasNoAbobora(editMeetingForm).length > 0 && (
                <p className="text-[11px] text-amber-400">
                  Falta responder: {faltasNoAbobora(editMeetingForm).join(", ")}.
                </p>
              )}
            </div>

            <Button
              onClick={handleEditMeeting}
              disabled={savingEditMeeting || (aboboraTocadoNaEdicao && faltasNoAbobora(editMeetingForm).length > 0)}
              className="w-full"
            >
              {savingEditMeeting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
