import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  Target,
  Lightbulb,
  Flame,
  Star,
  BarChart3,
  ArrowUpRight,
  Eye,
  Zap,
  Brain,
  Crosshair,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getTierFromFaturamento } from "@/lib/leadScoring";

interface Lead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  investimento_faixa: string | null;
  dor_desejo: string;
  lido: boolean;
  created_at: string;
  email: string | null;
  empresa: string | null;
  segmento: string | null;
  faturamento_faixa: string | null;
  trafego_faixa: string | null;
  ticket_faixa: string | null;
  gargalo: string | null;
  objetivo: string | null;
  timing: string | null;
  orcamento_faixa: string | null;
  tier: string | null;
  score: number | null;
  ip_address: string | null;
  is_duplicate_ip: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
  sdr_override: string | null;
  decisor: boolean | null;
  raw_answers_json: Record<string, unknown> | null;
}

interface LeadReportsTabProps {
  leads: Lead[];
  loading: boolean;
}

const MQL_FATURAMENTO = [
  "De R$ 10 mil a R$ 20 mil", "De R$ 20 mil a R$ 30 mil", "De R$ 30 mil a R$ 50 mil",
  "De R$ 50 mil a R$ 75 mil", "De R$ 75 mil a R$ 100 mil", "De R$ 100 mil a R$ 150 mil",
  "De R$ 150 mil a R$ 200 mil", "De R$ 200 mil a R$ 300 mil", "De R$ 300 mil a R$ 500 mil",
  "De R$ 500 mil a R$ 750 mil", "De R$ 750 mil a R$ 1 milhão", "De R$ 1 milhão a R$ 2 milhões",
  "De R$ 2 milhões a R$ 3 milhões", "De R$ 3 milhões a R$ 5 milhões", "De R$ 5 milhões a R$ 10 milhões",
  "Acima de R$ 10 milhões",
  "R$ 8k – 20k", "R$ 20k – 50k", "R$ 50k – 100k",
];

function isMql(lead: Lead): boolean {
  if (lead.sdr_override === "Rodger") return true;
  return MQL_FATURAMENTO.includes(lead.investimento_faixa || "");
}

// ── Semantic pain classifier ──────────────────────────────────────
// Groups free-text pain/desire answers into meaningful categories
// by detecting keywords, synonyms and intent patterns.

interface PainCategory {
  label: string;
  patterns: RegExp[];
}

const PAIN_CATEGORIES: PainCategory[] = [
  {
    label: "Delegar / Ganhar tempo",
    patterns: [
      /deleg/i, /ganhar (mais )?tempo/i, /falta de tempo/i, /sem tempo/i,
      /sobrecarregad/i, /braço/i, /n[aã]o consig(o|ue) fazer tudo/i,
      /equipe.*criat/i, /ter.*algu[eé]m/i, /profissional.*que/i,
      /parar de.*faz/i, /tirar.*d[eao]s? (minhas?|meu)/i,
      /n[aã]o (d[aá]|tenho) (conta|tempo)/i, /opera(r|ção).*sozin/i,
      /quero.*focar/i, /liber(ar|dade)/i, /sair do operacional/i,
      /ter mais tempo/i, /terceiriz/i,
    ],
  },
  {
    label: "Escalar operação",
    patterns: [
      /escal(ar|a)/i, /crescer/i, /crescimento/i, /aumentar.*faturamento/i,
      /próximo.*nível/i, /pr[oó]ximo.*patamar/i, /expandir/i,
      /faturar.*mais/i, /dobrar/i, /triplicar/i, /ir.*pra.*frente/i,
      /alavanc/i, /destravar/i, /estagna/i, /preso.*mesmo/i, /platô/i,
    ],
  },
  {
    label: "Qualidade dos leads / Leads ruins",
    patterns: [
      /qualidade.*lead/i, /lead.*ruim/i, /lead.*frio/i, /lead.*desqualificad/i,
      /gerar.*lead.*melhor/i, /qualifica(r|ção).*lead/i, /perfil.*lead/i,
      /lead.*n[aã]o.*compra/i, /n[aã]o.*converte/i, /muito.*lead.*pouc/i,
      /volume.*sem.*qualidade/i, /lead.*lixo/i, /lead.*barato/i,
    ],
  },
  {
    label: "Criativos que convertem",
    patterns: [
      /criat(ivo|iva)/i, /an[uú]ncio/i, /ad(s)?\b/i, /arte.*converte/i,
      /v[ií]deo.*vend/i, /hook/i, /gancho/i, /thumb/i, /thumbnail/i,
      /visual.*convert/i, /imagem.*perform/i, /creative/i,
      /testar.*mais.*oferta/i, /testar.*criat/i, /variar.*criat/i,
      /n[aã]o.*sab(e|o).*o que.*post/i, /conteúdo.*convert/i,
    ],
  },
  {
    label: "Copy / Comunicação / Oferta",
    patterns: [
      /copy/i, /comunica(ção|r)/i, /mensagem/i, /texto.*vend/i,
      /headline/i, /promessa/i, /proposta.*valor/i, /oferta/i,
      /argumento/i, /script/i, /ângulo/i, /abordagem/i,
      /n[aã]o.*sab(e|o).*o que.*fal(ar|o)/i, /posicionamento/i,
    ],
  },
  {
    label: "Custo alto de aquisição / CAC",
    patterns: [
      /cac/i, /cpa/i, /custo.*aquisi/i, /custo.*por.*lead/i,
      /gastando.*muito/i, /caro.*demais/i, /custo.*alto/i,
      /investimento.*alto.*sem/i, /pagando.*caro/i, /gastar.*menos/i,
      /reduzir.*custo/i, /diminuir.*gasto/i, /otimizar.*custo/i,
    ],
  },
  {
    label: "ROI / Retorno / Lucro",
    patterns: [
      /\broi\b/i, /\broas\b/i, /retorno/i, /lucr(o|atividade)/i,
      /rentabilidade/i, /margem/i, /n[aã]o.*t(em|á).*lucr/i,
      /ganh(ar|o).*mais.*dinheiro/i, /resultado.*financ/i,
      /faturar.*com.*lucro/i, /ter.*lucro/i,
    ],
  },
  {
    label: "Vendas / Fechamento / Comercial",
    patterns: [
      /vend(a|er|as)/i, /comercial/i, /closer/i, /fechamento/i,
      /fechar.*mais/i, /taxa.*convers[aã]o/i, /converter.*lead/i,
      /transform(ar|o).*lead.*em.*client/i, /n[aã]o.*consig(o|ue).*vend/i,
      /processo.*de.*vend/i, /script.*vend/i,
    ],
  },
  {
    label: "Funil / Estratégia de conversão",
    patterns: [
      /funil/i, /estrat[eé]g/i, /etapa/i, /jornada/i,
      /p[aá]gina.*convers/i, /landing.*page/i, /lp\b/i,
      /quiz.*converte/i, /webinar/i, /lançamento/i,
      /método/i, /playbook/i, /framework/i,
    ],
  },
  {
    label: "Tráfego pago / Mídia",
    patterns: [
      /tr[aá]fego/i, /m[ií]dia.*paga/i, /facebook.*ads/i, /meta.*ads/i,
      /google.*ads/i, /campanha.*paga/i, /gestor.*tr[aá]fego/i,
      /pixel/i, /segmenta(ção|r)/i, /p[uú]blico/i, /audiência/i,
      /investir.*em.*tr[aá]fego/i, /come[çc]ar.*tr[aá]fego/i,
    ],
  },
  {
    label: "Previsibilidade / Consistência",
    patterns: [
      /previs/i, /consist[eê]n/i, /inst[aá]vel/i, /irregular/i,
      /altos.*e.*baixos/i, /montanha.*russa/i, /depend(e|o).*da.*sorte/i,
      /recorr[eê]n/i, /est[aá]vel/i, /constante/i,
      /um.*m[eê]s.*bom.*outro/i, /depende.*do.*mês/i,
    ],
  },
  {
    label: "Equipe / Time / Contratação",
    patterns: [
      /equipe/i, /\btime\b/i, /contrat(ar|ação)/i, /funcion[aá]rio/i,
      /colaborador/i, /gestor/i, /designer/i, /editor/i,
      /montar.*equipe/i, /encontrar.*profissional/i,
      /n[aã]o.*acho.*gente/i, /boa.*equipe/i,
    ],
  },
  {
    label: "Marca / Autoridade / Posicionamento",
    patterns: [
      /marca/i, /branding/i, /autoridade/i, /reconhecimento/i,
      /ser.*refer[eê]ncia/i, /destac(ar|o).*no.*mercado/i,
      /diferencia(r|ção)/i, /identidade/i, /presença/i,
    ],
  },
  {
    label: "Organização / Processo / Gestão",
    patterns: [
      /organiza(r|ção)/i, /processo/i, /gest[aã]o/i, /sistema/i,
      /bagun[çc]/i, /ca[oó]tic/i, /estrutur/i, /padroniz/i,
      /indicador/i, /m[eé]trica/i, /dashboard/i, /controle/i,
    ],
  },
  {
    label: "Validar produto / Encontrar nicho",
    patterns: [
      /valid(ar|ação)/i, /encontr(ar|o).*nicho/i, /test(ar|e).*produto/i,
      /qual.*nicho/i, /escolher.*mercado/i, /nicho.*certo/i,
      /ideia.*que.*funciona/i, /viabilidade/i, /product.*market/i,
      /come[çc](ar|o)/i, /iniciar/i, /do.*zero/i,
    ],
  },
  {
    label: "Diversificar canais / Orgânico",
    patterns: [
      /diversific/i, /canal.*novo/i, /org[aâ]nic/i, /youtube/i,
      /tiktok/i, /instagram.*org/i, /conte[uú]do/i,
      /n[aã]o.*depender.*s[oó].*de/i, /depend[eê]ncia.*de.*um.*canal/i,
    ],
  },
];

function classifyDor(dor: string): string {
  if (!dor || !dor.trim()) return "Não informado";
  const text = dor.toLowerCase().trim();

  // Test each category — pick the first match (categories ordered by priority)
  for (const cat of PAIN_CATEGORIES) {
    if (cat.patterns.some(p => p.test(text))) {
      return cat.label;
    }
  }

  // Fallback: return a cleaned short version of the original text
  const trimmed = dor.trim();
  return trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed;
}

// Keep the raw version for display in detail views
function normalizeDor(dor: string): string {
  if (!dor) return "Não informado";
  const trimmed = dor.trim();
  return trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
}

function normalizeMercado(m: string): string {
  if (!m) return "Não informado";
  const lower = m.toLowerCase().trim();
  if (lower.includes("afiliado") && lower.includes("nutra")) return "Afiliado Nutra Gringa";
  if (lower.includes("afiliado")) return "Afiliado BR";
  if (lower.includes("infoproduto") || lower.includes("info produto")) return "Infoproduto";
  if (lower.includes("e-commerce") || lower.includes("ecommerce")) return "E-commerce";
  if (lower.includes("dropshipping") || lower.includes("drop")) return "Dropshipping";
  if (lower.includes("saas") || lower.includes("software")) return "SaaS / Software";
  if (lower.includes("serviço") || lower.includes("consultoria")) return "Serviços / Consultoria";
  if (lower.includes("agência") || lower.includes("agencia")) return "Agência";
  if (lower.includes("nutra") || lower.includes("encapsulado")) return "Nutra / Encapsulado Produtor";
  if (lower.includes("igaming")) return "Igaming";
  if (lower.includes("x1") || lower.includes("whatsapp")) return "X1 WhatsApp";
  if (lower.includes("hot")) return "Hot";
  if (lower.includes("lowticket") || lower.includes("low ticket")) return "Lowticket";
  return m.trim();
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

function topN<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

interface RankItem {
  label: string;
  total: number;
  mqls: number;
  mqlRate: string;
  pctOfTotal: string;
  pctOfMql: string;
}

function buildRanking(leads: Lead[], mqls: Lead[], getter: (l: Lead) => string): RankItem[] {
  const totalMap: Record<string, number> = {};
  const mqlMap: Record<string, number> = {};
  leads.forEach(l => { const k = getter(l); totalMap[k] = (totalMap[k] || 0) + 1; });
  mqls.forEach(l => { const k = getter(l); mqlMap[k] = (mqlMap[k] || 0) + 1; });

  return Object.keys(totalMap)
    .map(label => ({
      label,
      total: totalMap[label],
      mqls: mqlMap[label] || 0,
      mqlRate: pct(mqlMap[label] || 0, totalMap[label]),
      pctOfTotal: pct(totalMap[label], leads.length),
      pctOfMql: pct(mqlMap[label] || 0, mqls.length),
    }))
    .sort((a, b) => b.mqls - a.mqls || b.total - a.total);
}

interface ICProfile {
  name: string;
  mercado: string;
  estagio: string;
  faturamento: string;
  dores: string[];
  mqlCount: number;
  totalCount: number;
  mqlRate: string;
}

function detectICPs(mqls: Lead[]): ICProfile[] {
  const combos: Record<string, Lead[]> = {};
  mqls.forEach(l => {
    const key = `${normalizeMercado(l.mercado)}|||${l.estagio_negocio || "N/A"}|||${l.investimento_faixa || "N/A"}`;
    if (!combos[key]) combos[key] = [];
    combos[key].push(l);
  });

  return Object.entries(combos)
    .filter(([, arr]) => arr.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 5)
    .map(([key, arr]) => {
      const [mercado, estagio, faturamento] = key.split("|||");
      const dorCount: Record<string, number> = {};
      arr.forEach(l => {
        const d = classifyDor(l.dor_desejo);
        if (d !== "Não informado") dorCount[d] = (dorCount[d] || 0) + 1;
      });
      const topDores = Object.entries(dorCount).sort(([, a], [, b]) => b - a).slice(0, 3).map(([d]) => d);

      const estagioShort = estagio.includes("Escala") ? "em escala" :
        estagio.includes("Pré-escala") ? "em pré-escala" :
        estagio.includes("Validação") ? "validando" :
        estagio.includes("Iniciando") ? "iniciando" : estagio;
      const name = `${mercado} ${estagioShort}`;

      return {
        name,
        mercado,
        estagio: estagio === "N/A" ? "Não informado" : estagio,
        faturamento: faturamento === "N/A" ? "Não informado" : faturamento,
        dores: topDores,
        mqlCount: arr.length,
        totalCount: arr.length,
        mqlRate: "100%",
      };
    });
}

function generateInsights(leads: Lead[], mqls: Lead[]): string[] {
  const insights: string[] = [];
  if (!leads.length) return ["Nenhum lead no período selecionado."];

  const mercadoRank = buildRanking(leads, mqls, l => normalizeMercado(l.mercado));
  if (mercadoRank[0]?.mqls > 0) {
    insights.push(`O mercado que mais gera MQL no período é "${mercadoRank[0].label}" com ${mercadoRank[0].mqls} MQL(s) (${mercadoRank[0].mqlRate} de taxa).`);
  }

  const dorRank = buildRanking(leads, mqls, l => classifyDor(l.dor_desejo));
  const topDorMql = dorRank.find(d => d.label !== "Não informado" && d.mqls > 0);
  if (topDorMql) {
    insights.push(`A dor dominante entre MQLs é: "${topDorMql.label}" (${topDorMql.pctOfMql} dos MQLs).`);
  }

  const fatRank = buildRanking(leads, mqls, l => l.investimento_faixa || "Não informado");
  const bestFat = fatRank.filter(f => f.total >= 2 && f.mqls > 0).sort((a, b) => parseFloat(b.mqlRate) - parseFloat(a.mqlRate))[0];
  if (bestFat) {
    insights.push(`Leads com faturamento "${bestFat.label}" possuem a melhor taxa de qualificação: ${bestFat.mqlRate}.`);
  }

  const srcRank = buildRanking(leads, mqls, l => l.utm_source || "Direto");
  const bestSrc = srcRank.filter(s => s.mqls > 0).sort((a, b) => parseFloat(b.mqlRate) - parseFloat(a.mqlRate))[0];
  if (bestSrc) {
    insights.push(`A origem mais valiosa em qualidade é "${bestSrc.label}" com taxa de MQL de ${bestSrc.mqlRate}.`);
  }

  const estRank = buildRanking(leads, mqls, l => l.estagio_negocio || "Não informado");
  const topEst = estRank.find(e => e.mqls > 0 && e.label !== "Não informado");
  if (topEst) {
    insights.push(`Existe concentração de MQL em leads no estágio "${topEst.label}" (${topEst.pctOfMql} dos MQLs).`);
  }

  if (leads.length > 0) {
    insights.push(`Taxa geral de MQL no período: ${pct(mqls.length, leads.length)} (${mqls.length} de ${leads.length} leads).`);
  }

  const icps = detectICPs(mqls);
  if (icps[0]) {
    insights.push(`O perfil mais promissor do período é "${icps[0].name}" com ${icps[0].mqlCount} MQLs.`);
  }

  return insights.slice(0, 10);
}

function generateCreativeSuggestions(leads: Lead[], mqls: Lead[]): string[] {
  const suggestions: string[] = [];
  const mercadoRank = buildRanking(leads, mqls, l => normalizeMercado(l.mercado));
  const dorRank = buildRanking(leads, mqls, l => classifyDor(l.dor_desejo));
  const estRank = buildRanking(leads, mqls, l => l.estagio_negocio || "Não informado");

  const topMercado = mercadoRank[0];
  const topDor = dorRank.find(d => d.label !== "Não informado");
  const topEst = estRank.find(e => e.label !== "Não informado" && e.mqls > 0);

  if (topDor && topMercado) {
    suggestions.push(`Criar criativo sobre "${topDor.label}" para o mercado "${topMercado.label}"`);
  }
  if (topEst) {
    suggestions.push(`Criar anúncio específico para leads em estágio "${topEst.label}"`);
  }

  const icps = detectICPs(mqls);
  if (icps[0]) {
    suggestions.push(`Criar gancho para o ICP "${icps[0].name}"`);
  }
  if (topDor) {
    suggestions.push(`Explorar promessa relacionada à dor "${topDor.label}"`);
  }

  const crossMap: Record<string, number> = {};
  mqls.forEach(l => {
    const k = `${normalizeMercado(l.mercado)} + ${classifyDor(l.dor_desejo)}`;
    crossMap[k] = (crossMap[k] || 0) + 1;
  });
  const topCross = Object.entries(crossMap).sort(([, a], [, b]) => b - a)[0];
  if (topCross && topCross[1] >= 2) {
    suggestions.push(`Criar copy em cima da combinação "${topCross[0]}" (${topCross[1]} MQLs)`);
  }

  return suggestions.slice(0, 6);
}

const PAGE_SIZE = 20;

export default function LeadReportsTab({ leads, loading }: LeadReportsTabProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [mercadoFilter, setMercadoFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [faturamentoFilter, setFaturamentoFilter] = useState("all");
  const [estagioFilter, setEstagioFilter] = useState("all");

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (s: string) => setCollapsedSections(prev => {
    const n = new Set(prev);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (statusFilter === "mql" && !isMql(l)) return false;
      if (statusFilter === "common" && isMql(l)) return false;
      if (mercadoFilter !== "all" && normalizeMercado(l.mercado) !== mercadoFilter) return false;
      if (sourceFilter !== "all" && (l.utm_source || "Direto") !== sourceFilter) return false;
      if (faturamentoFilter !== "all" && (l.investimento_faixa || "Não informado") !== faturamentoFilter) return false;
      if (estagioFilter !== "all" && (l.estagio_negocio || "Não informado") !== estagioFilter) return false;
      return true;
    });
  }, [leads, statusFilter, mercadoFilter, sourceFilter, faturamentoFilter, estagioFilter]);

  const mqls = useMemo(() => filtered.filter(isMql), [filtered]);

  const uniqueMercados = useMemo(() => [...new Set(leads.map(l => normalizeMercado(l.mercado)))].sort(), [leads]);
  const uniqueSources = useMemo(() => [...new Set(leads.map(l => l.utm_source || "Direto"))].sort(), [leads]);
  const uniqueFaturamentos = useMemo(() => [...new Set(leads.map(l => l.investimento_faixa || "Não informado"))].filter(Boolean).sort(), [leads]);
  const uniqueEstagios = useMemo(() => [...new Set(leads.map(l => l.estagio_negocio || "Não informado"))].filter(Boolean).sort(), [leads]);

  const mercadoRank = useMemo(() => buildRanking(filtered, mqls, l => normalizeMercado(l.mercado)), [filtered, mqls]);
  const dorRank = useMemo(() => buildRanking(filtered, mqls, l => classifyDor(l.dor_desejo)), [filtered, mqls]);
  const fatRank = useMemo(() => buildRanking(filtered, mqls, l => l.investimento_faixa || "Não informado"), [filtered, mqls]);
  const estRank = useMemo(() => buildRanking(filtered, mqls, l => l.estagio_negocio || "Não informado"), [filtered, mqls]);
  const srcRank = useMemo(() => buildRanking(filtered, mqls, l => l.utm_source || "Direto"), [filtered, mqls]);
  const campaignRank = useMemo(() => buildRanking(filtered, mqls, l => l.utm_campaign || "Direto"), [filtered, mqls]);

  const icps = useMemo(() => detectICPs(mqls), [mqls]);
  const insights = useMemo(() => generateInsights(filtered, mqls), [filtered, mqls]);
  const creativeSuggestions = useMemo(() => generateCreativeSuggestions(filtered, mqls), [filtered, mqls]);

  const topMercado = mercadoRank[0]?.label || "—";
  const topDor = dorRank.find(d => d.label !== "Não informado")?.label || "—";
  const topIcp = icps[0]?.name || "—";
  const topMqlSource = srcRank.filter(s => s.mqls > 0).sort((a, b) => b.mqls - a.mqls)[0]?.label || "—";

  const dorMercadoMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    mqls.forEach(l => {
      const m = normalizeMercado(l.mercado);
      const d = classifyDor(l.dor_desejo);
      if (d === "Não informado") return;
      if (!matrix[m]) matrix[m] = {};
      matrix[m][d] = (matrix[m][d] || 0) + 1;
    });
    const rows: { mercado: string; dor: string; count: number }[] = [];
    Object.entries(matrix).forEach(([m, dors]) => {
      Object.entries(dors).forEach(([d, c]) => rows.push({ mercado: m, dor: d, count: c }));
    });
    return rows.sort((a, b) => b.count - a.count).slice(0, 15);
  }, [mqls]);

  const tableLeads = useMemo(() => {
    let arr = [...filtered];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      arr = arr.filter(l =>
        l.nome_completo.toLowerCase().includes(q) ||
        l.whatsapp.includes(q) ||
        l.instagram.toLowerCase().includes(q) ||
        l.mercado.toLowerCase().includes(q) ||
        (l.dor_desejo || "").toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortCol === "created_at") { va = a.created_at; vb = b.created_at; }
      else if (sortCol === "nome") { va = a.nome_completo.toLowerCase(); vb = b.nome_completo.toLowerCase(); }
      else if (sortCol === "mercado") { va = a.mercado; vb = b.mercado; }
      else if (sortCol === "tier") { va = getTierFromFaturamento(a.investimento_faixa); vb = getTierFromFaturamento(b.investimento_faixa); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, searchQuery, sortCol, sortDir]);

  const totalPages = Math.ceil(tableLeads.length / PAGE_SIZE);
  const pagedLeads = tableLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const exportCSV = useCallback(() => {
    const headers = ["Data", "Nome", "WhatsApp", "Instagram", "E-mail", "Mercado", "Estágio", "Faturamento", "Dor/Desejo", "Tier", "MQL", "UTM Source", "UTM Campaign", "UTM Content"];
    const rows = tableLeads.map(l => [
      format(new Date(l.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      l.nome_completo, l.whatsapp, l.instagram, l.email || "", normalizeMercado(l.mercado),
      l.estagio_negocio || "", l.investimento_faixa || "", `"${(l.dor_desejo || "").replace(/"/g, '""')}"`,
      getTierFromFaturamento(l.investimento_faixa), isMql(l) ? "Sim" : "Não",
      l.utm_source || "", l.utm_campaign || "", l.utm_content || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-leads-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tableLeads]);

  const SectionHeader = ({ id, icon: Icon, title, subtitle }: { id: string; icon: React.ElementType; title: string; subtitle?: string }) => (
    <div
      className="flex items-center justify-between cursor-pointer group mb-4"
      onClick={() => toggleSection(id)}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {collapsedSections.has(id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronUp className="w-5 h-5 text-muted-foreground" />}
    </div>
  );

  const RankingTable = ({ data, maxRows = 8 }: { data: RankItem[]; maxRows?: number }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">#</TableHead>
            <TableHead className="text-xs">Categoria</TableHead>
            <TableHead className="text-xs text-right">Total</TableHead>
            <TableHead className="text-xs text-right">MQLs</TableHead>
            <TableHead className="text-xs text-right">Taxa MQL</TableHead>
            <TableHead className="text-xs text-right">% do Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topN(data, maxRows).map((item, i) => (
            <TableRow key={item.label}>
              <TableCell className="text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="text-sm font-medium max-w-[200px] truncate">{item.label}</TableCell>
              <TableCell className="text-sm text-right">{item.total}</TableCell>
              <TableCell className="text-sm text-right">
                <span className={item.mqls > 0 ? "text-green-400 font-semibold" : "text-muted-foreground"}>{item.mqls}</span>
              </TableCell>
              <TableCell className="text-sm text-right">{item.mqlRate}</TableCell>
              <TableCell className="text-sm text-right text-muted-foreground">{item.pctOfTotal}</TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  const BarChartBlock = ({ data, title }: { data: RankItem[]; title: string }) => {
    const chartData = topN(data, 8).map(d => ({ name: d.label.length > 20 ? d.label.slice(0, 20) + "…" : d.label, Total: d.total, MQLs: d.mqls }));
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(235, 50%, 16%)" />
                <XAxis type="number" tick={{ fill: "hsl(230, 15%, 60%)", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(230, 15%, 60%)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(235, 60%, 7%)", border: "1px solid hsl(235, 50%, 16%)", borderRadius: 8, color: "hsl(40, 10%, 95%)" }} />
                <Bar dataKey="Total" fill="hsl(238, 90%, 55%)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="MQLs" fill="hsl(42, 90%, 58%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Relatórios Lead
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Análise estratégica dos leads do quiz para identificar dores, padrões de MQL, ICPs e oportunidades de novos criativos.
        </p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os leads</SelectItem>
                <SelectItem value="mql">Apenas MQL</SelectItem>
                <SelectItem value="common">Lead comum</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mercadoFilter} onValueChange={v => { setMercadoFilter(v); setPage(1); }}>
              <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Mercado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos mercados</SelectItem>
                {uniqueMercados.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={v => { setSourceFilter(v); setPage(1); }}>
              <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas origens</SelectItem>
                {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={faturamentoFilter} onValueChange={v => { setFaturamentoFilter(v); setPage(1); }}>
              <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Faturamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos faturamentos</SelectItem>
                {uniqueFaturamentos.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={estagioFilter} onValueChange={v => { setEstagioFilter(v); setPage(1); }}>
              <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Estágio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos estágios</SelectItem>
                {uniqueEstagios.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{filtered.length}</p>
                <p className="text-[11px] text-muted-foreground">Total de Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><Target className="w-5 h-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-green-400">{mqls.length}</p>
                <p className="text-[11px] text-muted-foreground">Total de MQLs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10"><TrendingUp className="w-5 h-5 text-secondary" /></div>
              <div>
                <p className="text-2xl font-bold text-secondary">{pct(mqls.length, filtered.length)}</p>
                <p className="text-[11px] text-muted-foreground">Taxa de MQL</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Flame className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-sm font-bold truncate max-w-[140px]">{topMercado}</p>
                <p className="text-[11px] text-muted-foreground">Mercado #1</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10"><Zap className="w-5 h-5 text-red-400" /></div>
              <div>
                <p className="text-xs font-bold truncate max-w-[140px]" title={topDor}>{topDor.length > 40 ? topDor.slice(0, 40) + "…" : topDor}</p>
                <p className="text-[11px] text-muted-foreground">Dor #1</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10"><Crosshair className="w-5 h-5 text-purple-400" /></div>
              <div>
                <p className="text-xs font-bold truncate max-w-[140px]" title={topIcp}>{topIcp.length > 40 ? topIcp.slice(0, 40) + "…" : topIcp}</p>
                <p className="text-[11px] text-muted-foreground">ICP Dominante</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><ArrowUpRight className="w-5 h-5 text-blue-400" /></div>
              <div>
                <p className="text-sm font-bold truncate max-w-[140px]">{topMqlSource}</p>
                <p className="text-[11px] text-muted-foreground">Origem #1 MQL</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10"><Star className="w-5 h-5 text-secondary" /></div>
              <div>
                <p className="text-sm font-bold">{dorRank.filter(d => d.label !== "Não informado").length}</p>
                <p className="text-[11px] text-muted-foreground">Dores Únicas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-secondary/30 bg-gradient-to-br from-secondary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-5 h-5 text-secondary" /> Insights Automáticos do Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-secondary mt-0.5">→</span>
                <p>{ins}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <SectionHeader id="overview" icon={BarChart3} title="Visão Geral dos Leads" subtitle="Distribuição geral do volume por dimensão" />
        {!collapsedSections.has("overview") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BarChartBlock data={mercadoRank} title="Leads por Mercado" />
            <BarChartBlock data={srcRank} title="Leads por Origem" />
            <BarChartBlock data={fatRank} title="Leads por Faturamento" />
            <BarChartBlock data={estRank} title="Leads por Estágio" />
          </div>
        )}
      </div>

      <div>
        <SectionHeader id="mql" icon={Target} title="Análise de MQL" subtitle="Perfis que mais geram MQL — não apenas volume" />
        {!collapsedSections.has("mql") && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top Mercados → MQL</CardTitle></CardHeader>
                <CardContent><RankingTable data={mercadoRank} /></CardContent>
              </Card>
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top Origens → MQL</CardTitle></CardHeader>
                <CardContent><RankingTable data={srcRank} /></CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top Faturamento → MQL</CardTitle></CardHeader>
                <CardContent><RankingTable data={fatRank} /></CardContent>
              </Card>
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top Estágio → MQL</CardTitle></CardHeader>
                <CardContent><RankingTable data={estRank} /></CardContent>
              </Card>
            </div>
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top Campanhas → MQL</CardTitle></CardHeader>
              <CardContent><RankingTable data={campaignRank} /></CardContent>
            </Card>
          </div>
        )}
      </div>

      <div>
        <SectionHeader id="pains" icon={Flame} title="Mapa de Dores dos Leads" subtitle="As maiores dores dos leads de forma estratégica" />
        {!collapsedSections.has("pains") && (
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking de Dores Principais</CardTitle></CardHeader>
              <CardContent>
                <RankingTable data={dorRank.filter(d => d.label !== "Não informado")} maxRows={12} />
              </CardContent>
            </Card>
            <BarChartBlock data={dorRank.filter(d => d.label !== "Não informado")} title="Dores por Volume e MQL" />
            {dorMercadoMatrix.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Cruzamento Mercado × Dor (MQLs)</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Mercado</TableHead>
                          <TableHead className="text-xs">Dor</TableHead>
                          <TableHead className="text-xs text-right">MQLs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dorMercadoMatrix.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{row.mercado}</TableCell>
                            <TableCell className="text-sm max-w-[250px] truncate">{row.dor}</TableCell>
                            <TableCell className="text-sm text-right">
                              <Badge variant="outline" className="text-secondary border-secondary/30">{row.count}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionHeader id="icps" icon={Crosshair} title="ICPs Ideais" subtitle="Perfis mais valiosos identificados automaticamente" />
        {!collapsedSections.has("icps") && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {icps.length > 0 ? icps.map((icp, i) => (
              <Card key={i} className="border-secondary/20 bg-gradient-to-br from-secondary/5 to-transparent">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-secondary/20 text-secondary border-secondary/30 text-xs">ICP #{i + 1}</Badge>
                  </div>
                  <CardTitle className="text-base">{icp.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-muted/30 rounded">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mercado</p>
                      <p className="font-medium text-xs">{icp.mercado}</p>
                    </div>
                    <div className="p-2 bg-muted/30 rounded">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estágio</p>
                      <p className="font-medium text-xs">{icp.estagio}</p>
                    </div>
                    <div className="p-2 bg-muted/30 rounded">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Faturamento</p>
                      <p className="font-medium text-xs">{icp.faturamento}</p>
                    </div>
                    <div className="p-2 bg-muted/30 rounded">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">MQLs</p>
                      <p className="font-medium text-xs text-green-400">{icp.mqlCount}</p>
                    </div>
                  </div>
                  {icp.dores.length > 0 && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Principais Dores</p>
                      {icp.dores.map((d, j) => (
                        <p key={j} className="text-xs text-muted-foreground">• {d}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )) : (
              <Card className="col-span-full border-border/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Dados insuficientes para identificar ICPs (mínimo 2 MQLs com mesmo perfil)</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionHeader id="creatives" icon={Lightbulb} title="Oportunidades de Criativos" subtitle="Insights práticos para marketing e criação" />
        {!collapsedSections.has("creatives") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Sugestões de Ângulos Criativos</CardTitle>
              </CardHeader>
              <CardContent>
                {creativeSuggestions.length > 0 ? (
                  <div className="space-y-3">
                    {creativeSuggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-muted/20 rounded-lg">
                        <span className="text-primary text-sm mt-0.5">💡</span>
                        <p className="text-sm">{s}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados suficientes para sugestões</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Dores para Explorar em Criativos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topN(dorRank.filter(d => d.label !== "Não informado"), 6).map((d, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                      <span className="text-sm truncate max-w-[200px]">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{d.total}x</Badge>
                        {d.mqls > 0 && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">{d.mqls} MQL</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Mercados para Campanhas Específicas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topN(mercadoRank, 6).map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                      <span className="text-sm">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{m.total} leads</span>
                        <Badge className="bg-secondary/20 text-secondary border-secondary/30 text-xs">{m.mqlRate} MQL</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Combinações Mercado + Dor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topN(dorMercadoMatrix, 6).map((row, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{row.mercado}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.dor}</p>
                      </div>
                      <Badge variant="outline" className="text-xs ml-2">{row.count}x</Badge>
                    </div>
                  ))}
                  {dorMercadoMatrix.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Sem dados</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <div>
        <SectionHeader id="table" icon={Eye} title="Tabela Analítica de Leads" subtitle="Busca, ordenação e exportação" />
        {!collapsedSections.has("table") && (
          <Card className="border-border/50">
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex items-center gap-2 flex-1">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar nome, whatsapp, mercado, dor..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }} className="h-9" />
                </div>
                <Button variant="outline" size="sm" onClick={exportCSV} className="h-9">
                  <Download className="w-4 h-4 mr-1" /> Exportar CSV
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("created_at")}>
                        Data {sortCol === "created_at" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("nome")}>
                        Nome {sortCol === "nome" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("mercado")}>
                        Mercado {sortCol === "mercado" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="text-xs">Estágio</TableHead>
                      <TableHead className="text-xs">Faturamento</TableHead>
                      <TableHead className="text-xs">Dor</TableHead>
                      <TableHead className="text-xs cursor-pointer" onClick={() => handleSort("tier")}>
                        Tier {sortCol === "tier" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="text-xs">MQL</TableHead>
                      <TableHead className="text-xs">Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLeads.map(lead => (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedLead(lead)}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(lead.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm font-medium max-w-[120px] truncate">{lead.nome_completo}</TableCell>
                        <TableCell className="text-xs">{normalizeMercado(lead.mercado)}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{lead.estagio_negocio || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{lead.investimento_faixa || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate" title={lead.dor_desejo}>{classifyDor(lead.dor_desejo)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${getTierFromFaturamento(lead.investimento_faixa) === "Enterprise+" || getTierFromFaturamento(lead.investimento_faixa) === "Enterprise" ? "border-secondary/50 text-secondary" : ""}`}>
                            {getTierFromFaturamento(lead.investimento_faixa)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isMql(lead) ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Sim</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Não</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{lead.utm_source || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {pagedLeads.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">Nenhum lead encontrado</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">{tableLeads.length} leads · Página {page}/{totalPages}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedLead.nome_completo}
                  {isMql(selectedLead) && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">MQL</Badge>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "WhatsApp", value: selectedLead.whatsapp },
                    { label: "Instagram", value: selectedLead.instagram },
                    { label: "E-mail", value: selectedLead.email },
                    { label: "Empresa", value: selectedLead.empresa },
                    { label: "Mercado", value: normalizeMercado(selectedLead.mercado) },
                    { label: "Estágio", value: selectedLead.estagio_negocio },
                    { label: "Faturamento", value: selectedLead.investimento_faixa },
                    { label: "Tier", value: getTierFromFaturamento(selectedLead.investimento_faixa) },
                    { label: "Data", value: format(new Date(selectedLead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) },
                    { label: "Score", value: selectedLead.score?.toString() },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="p-2 bg-muted/30 rounded">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-medium">{value}</p>
                    </div>
                  ) : null)}
                </div>

                {selectedLead.dor_desejo && (
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Dor / Desejo</p>
                    <p className="text-sm">{selectedLead.dor_desejo}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Origem / UTMs</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedLead.utm_source && <Badge variant="outline" className="text-[10px]">source: {selectedLead.utm_source}</Badge>}
                    {selectedLead.utm_campaign && <Badge variant="outline" className="text-[10px]">campaign: {selectedLead.utm_campaign}</Badge>}
                    {selectedLead.utm_content && <Badge variant="outline" className="text-[10px]">content: {selectedLead.utm_content}</Badge>}
                    {selectedLead.utm_medium && <Badge variant="outline" className="text-[10px]">medium: {selectedLead.utm_medium}</Badge>}
                    {!selectedLead.utm_source && <span className="text-xs text-muted-foreground">Tráfego direto</span>}
                  </div>
                </div>

                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-[10px] text-primary uppercase tracking-wider mb-2 flex items-center gap-1"><Brain className="w-3 h-3" /> Leitura Estratégica</p>
                  <div className="space-y-1 text-sm">
                    <p>• <strong>Categoria da dor:</strong> {classifyDor(selectedLead.dor_desejo)}</p>
                    <p>• <strong>Dor original:</strong> {normalizeDor(selectedLead.dor_desejo)}</p>
                    {icps.length > 0 && (
                      <p>• <strong>ICP mais próximo:</strong> {
                        icps.find(ic => ic.mercado === normalizeMercado(selectedLead.mercado))?.name || icps[0].name
                      }</p>
                    )}
                    <p>• <strong>Qualificação:</strong> {isMql(selectedLead) ? "MQL — lead qualificado" : "Lead comum — não atinge critério de MQL"}</p>
                  </div>
                </div>

                {(selectedLead.gargalo || selectedLead.objetivo || selectedLead.timing || selectedLead.segmento || selectedLead.trafego_faixa) && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dados Adicionais</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Gargalo", value: selectedLead.gargalo },
                        { label: "Objetivo", value: selectedLead.objetivo },
                        { label: "Timing", value: selectedLead.timing },
                        { label: "Segmento", value: selectedLead.segmento },
                        { label: "Tráfego", value: selectedLead.trafego_faixa },
                        { label: "Ticket", value: selectedLead.ticket_faixa },
                        { label: "Orçamento", value: selectedLead.orcamento_faixa },
                      ].map(({ label, value }) => value ? (
                        <div key={label} className="p-2 bg-muted/20 rounded text-xs">
                          <span className="text-muted-foreground">{label}: </span>
                          <span className="font-medium">{value}</span>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
