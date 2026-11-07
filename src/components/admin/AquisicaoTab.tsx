import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  agregar,
  type Agregado,
  type Anuncio,
  type LeadResumo,
} from "@/lib/desempenhoConta";

/**
 * Aquisição — a cascata do funil de mídia, de sessão a venda.
 *
 * A aba responde uma pergunta só: onde a verba morre. Por isso ela é UMA
 * cascata, e não um mosaico de indicadores — cada etapa lida contra a anterior
 * e contra o topo, porque taxa sem denominador não decide nada.
 *
 * ── O MQL é o denominador da casa (regra do Rodger, reafirmada em 24/09) ────
 * Comparação de criativo, de página e de conjunto se faz por MQL (faturamento
 * declarado a partir de R$ 10 mil), nunca por lead total. Lead total mistura
 * quem nunca poderia comprar com quem pode, e o criativo que ganha no lead
 * total costuma ser o que perde no caixa. CTR, CPC e custo por lead ficam como
 * diagnóstico — aparecem, mas não decidem.
 */

interface RespostaTopo {
  total: number;
  descartadas: number;
  crawler_meta: number;
  escritorio: number;
  sem_ip: number;
  gente: number;
  gente_quiz: number;
  gente_completou: number;
  regra?: { ip_escritorio?: string };
}

interface RespostaDesempenho {
  anuncios?: Anuncio[];
  leads?: LeadResumo[];
}

interface DiaRitmo {
  dia: string;
  spend: number;
  leads: number;
  mql: number;
  hql: number;
  sql: number;
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<unknown>;
  startISO?: string;
  endISO?: string;
  startDateOnly?: string;
  endDateOnly?: string;
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const inteiro = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));
const custo = (spend: number, n: number) => (n > 0 && spend > 0 ? brl(spend / n) : "—");

/**
 * Taxa, ou "—" quando não há denominador.
 *
 * Zero no denominador não vira 0% nem 100%: vira ausência. Um funil que mostra
 * "0%" onde não mediu nada faz a etapa parecer quebrada em vez de não medida.
 */
const taxa = (a: number, b: number | null): string =>
  b !== null && b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—";

/** As cores da cascata, e o que cada uma significa. */
type Tom = "neutro" | "mql" | "hql" | "humano";

const TOM: Record<Tom, { texto: string; barra: string; borda: string }> = {
  // Etapa que ninguém controla direto: tráfego chegando, formulário andando.
  neutro: { texto: "text-foreground", barra: "bg-muted-foreground/40", borda: "border-border/60" },
  // Amarelo é o denominador da casa. Grita mais que o resto de propósito.
  mql: { texto: "text-amber-300", barra: "bg-amber-400", borda: "border-amber-500/40" },
  hql: { texto: "text-emerald-400", barra: "bg-emerald-400", borda: "border-emerald-500/40" },
  // Azul marca tudo que depende de alguém agir. Separar por cor deixa visível,
  // de longe, em qual metade do funil o problema está.
  humano: { texto: "text-sky-400", barra: "bg-sky-400", borda: "border-sky-500/40" },
};

interface Etapa {
  nome: string;
  valor: number | null;
  /** Contra a etapa anterior. `null` quando a anterior não foi medida. */
  anterior: number | null;
  tom: Tom;
  /** Quando o denominador natural é zero, contra quem a etapa foi lida. */
  baseAlternativa?: string;
  nota?: string;
}

function CardEtapa({ e, topo }: { e: Etapa; topo: number | null }) {
  const t = TOM[e.tom];
  // A barra é a conversão contra a etapa anterior, travada em 100%: etapa maior
  // que a anterior é impossível, e deixar a barra estourar a caixa
  // transformaria o defeito num gráfico bonito.
  const prop = e.valor !== null && e.anterior ? Math.min(1, e.valor / e.anterior) : 0;
  return (
    <div className={`rounded-xl border bg-card p-3 min-w-0 flex flex-col gap-1.5 ${t.borda}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight min-h-[26px]">
        {e.nome}
      </p>
      <p className={`text-[26px] leading-none font-bold tabular-nums ${t.texto}`}>
        {e.valor === null ? "—" : inteiro(e.valor)}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">
        {e.valor === null
          ? "não medido"
          : `${taxa(e.valor, e.anterior)} ${e.baseAlternativa ? `de ${e.baseAlternativa}` : "da anterior"}`}
      </p>
      <p className="text-[10px] text-muted-foreground/60 leading-tight">
        {e.valor === null || topo === null ? "—" : `${taxa(e.valor, topo)} do topo`}
      </p>
      <span className="flex-grow" />
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full rounded-full ${t.barra}`} style={{ width: `${(prop * 100).toFixed(1)}%` }} />
      </div>
      {e.nota && <p className="text-[10px] text-amber-300/90 leading-tight">{e.nota}</p>}
    </div>
  );
}

function Custo({ rotulo, valor, base, forte }: { rotulo: string; valor: string; base: string; forte?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-4 min-w-0 ${forte ? "border-amber-500/40" : "border-border/60"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${forte ? "text-amber-300" : ""}`}>{valor}</p>
      <p className="text-[10px] text-muted-foreground/80 mt-2 leading-snug border-t border-border/50 pt-2">{base}</p>
    </div>
  );
}

function Regua({
  rotulo, valor, limite, estourada,
}: { rotulo: string; valor: string; limite: string; estourada: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 flex items-center gap-4 ${
        estourada ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"
      }`}
    >
      <p className={`text-4xl font-bold tabular-nums ${estourada ? "text-red-400" : "text-emerald-400"}`}>{valor}</p>
      <div className="w-px self-stretch bg-border/60" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{rotulo}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{limite}</p>
        <p className={`text-[11px] font-semibold mt-1 ${estourada ? "text-red-400" : "text-emerald-400"}`}>
          {estourada ? "estourada" : "dentro"}
        </p>
      </div>
    </div>
  );
}

/** KPI grande do topo. O `destaque` vira card sólido — é o número do jogo. */
function Kpi({
  rotulo, valor, sub, nota, tom, destaque,
}: {
  rotulo: string; valor: string; sub?: string; nota?: string;
  tom?: "mql" | "hql"; destaque?: boolean;
}) {
  if (destaque) {
    return (
      <div className="rounded-xl bg-emerald-400 text-emerald-950 p-4 flex flex-col">
        <p className="text-[11px] uppercase tracking-wider font-bold opacity-80">{rotulo}</p>
        <p className="text-5xl font-bold tabular-nums leading-none mt-2">{valor}</p>
        {sub && <p className="text-xs font-semibold mt-2">{sub}</p>}
        {nota && <p className="text-[11px] mt-2 border-t border-emerald-950/25 pt-2 leading-snug">{nota}</p>}
      </div>
    );
  }
  const cor = tom === "mql" ? "text-amber-300" : tom === "hql" ? "text-emerald-400" : "";
  const borda = tom === "mql" ? "border-amber-500/40" : tom === "hql" ? "border-emerald-500/30" : "border-border/60";
  return (
    <div className={`rounded-xl border bg-card p-4 flex flex-col ${borda}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{rotulo}</p>
      <p className={`text-[40px] font-bold tabular-nums leading-none mt-2 ${cor}`}>{valor}</p>
      {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
      {nota && (
        <p className="text-[11px] text-muted-foreground/80 mt-2 border-t border-border/50 pt-2 leading-snug">{nota}</p>
      )}
    </div>
  );
}

interface LinhaRitmo {
  rotulo: string;
  dias: number;
  spend: number;
  leads: number;
  mql: number;
  hql: number;
}

/**
 * Um corte do período com a AMOSTRA à vista.
 *
 * O melhor dia é destacado só quando houve HQL nele; destacar o menor custo
 * entre cortes que não produziram nada seria eleger um vencedor por acaso.
 */
function TabelaRitmo({ titulo, linhas }: { titulo: string; linhas: LinhaRitmo[] }) {
  const melhor = linhas
    .filter((l) => l.hql > 0 && l.spend > 0)
    .sort((a, b) => a.spend / a.hql - b.spend / b.hql)[0];
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{titulo}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50">
            <th className="text-left font-medium py-1"> </th>
            <th className="text-right font-medium">dias</th>
            <th className="text-right font-medium">gasto</th>
            <th className="text-right font-medium">leads</th>
            <th className="text-right font-medium">MQL</th>
            <th className="text-right font-medium">HQL</th>
            <th className="text-right font-medium">R$/HQL</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr
              key={l.rotulo}
              className={`border-b border-border/30 ${melhor && l.rotulo === melhor.rotulo ? "bg-emerald-500/10" : ""}`}
            >
              <td className="py-1 font-medium">{l.rotulo}</td>
              <td className="text-right tabular-nums text-muted-foreground">{l.dias}</td>
              <td className="text-right tabular-nums">{brl(l.spend)}</td>
              <td className="text-right tabular-nums">{inteiro(l.leads)}</td>
              <td className="text-right tabular-nums text-amber-300">{inteiro(l.mql)}</td>
              <td className="text-right tabular-nums text-emerald-400">{inteiro(l.hql)}</td>
              <td className="text-right tabular-nums">{custo(l.spend, l.hql)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AquisicaoTab({
  fetchAdminData, startISO, endISO, startDateOnly, endDateOnly,
}: Props) {
  const [topo, setTopo] = useState<RespostaTopo | null>(null);
  const [desempenho, setDesempenho] = useState<RespostaDesempenho | null>(null);
  const [ritmo, setRitmo] = useState<DiaRitmo[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params: Record<string, string> = {};
      if (startISO) params.from = startISO;
      if (endISO) params.to = endISO;
      const paramsDesempenho = { ...params };
      if (startDateOnly) paramsDesempenho.from_date = startDateOnly;
      if (endDateOnly) paramsDesempenho.to_date = endDateOnly;

      // As duas leituras são independentes e uma não invalida a outra: se o
      // topo falhar, a cascata ainda vale do lead para baixo, que é onde mora
      // a decisão de verba. Um `Promise.all` derrubaria as duas juntas.
      const [t, d, r] = await Promise.allSettled([
        startISO && endISO ? fetchAdminData("/aquisicao-topo", params) : Promise.resolve(null),
        fetchAdminData("/contas-desempenho", paramsDesempenho),
        startDateOnly && endDateOnly
          ? fetchAdminData("/aquisicao-ritmo", { from_date: startDateOnly, to_date: endDateOnly })
          : Promise.resolve(null),
      ]);
      if (t.status === "fulfilled" && t.value) setTopo(t.value as RespostaTopo);
      else setTopo(null);
      if (r.status === "fulfilled" && r.value) setRitmo((r.value as { dias?: DiaRitmo[] }).dias ?? null);
      else setRitmo(null);
      if (d.status === "fulfilled") setDesempenho(d.value as RespostaDesempenho);
      else throw d.reason;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [fetchAdminData, startISO, endISO, startDateOnly, endDateOnly]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const a: Agregado = useMemo(
    () => agregar(desempenho?.anuncios ?? [], desempenho?.leads ?? []),
    [desempenho],
  );

  const etapas: Etapa[] = useMemo(() => {
    const gente = topo?.gente ?? null;
    const quiz = topo?.gente_quiz ?? null;
    const completou = topo?.gente_completou ?? null;
    // O SQL nasceu em 24/09 e começa zerado. Enquanto ninguém marcar, a reunião
    // não pode ser lida contra ele: dividir por zero devolveria "—" e a etapa
    // seguinte pareceria quebrada. Cai para o HQL e DIZ que caiu.
    const baseReuniao = a.sql > 0 ? a.sql : a.hql;
    return [
      { nome: "Sessões de gente", valor: gente, anterior: gente, tom: "neutro" },
      { nome: "Chegou ao formulário", valor: quiz, anterior: gente, tom: "neutro" },
      { nome: "Completou", valor: completou, anterior: quiz, tom: "neutro" },
      {
        nome: "Virou lead", valor: a.leads, anterior: completou, tom: "neutro",
        // Lead maior que completou é impossível por construção, e quando
        // acontece é lead entrando sem sessão ligada. Dizer isso na própria
        // etapa evita que a taxa acima de 100% seja lida como desempenho.
        nota: completou !== null && a.leads > completou
          ? `${a.leads - completou} lead(s) sem sessão ligada`
          : undefined,
      },
      { nome: "MQL 10k+", valor: a.mql, anterior: a.leads, tom: "mql" },
      { nome: "HQL (corte do score)", valor: a.hql, anterior: a.mql, tom: "hql" },
      // A primeira etapa em que alguém julga. Tudo acima dela sai de regra
      // automática sobre o que a pessoa declarou; daqui para baixo é operação.
      {
        nome: "SQL · comercial aceitou", valor: a.sql, anterior: a.hql, tom: "humano",
        nota: a.sql === 0 && a.hql > 0 ? "ninguém marcou ainda" : undefined,
      },
      {
        nome: "Reunião marcada", valor: a.reunioes, anterior: baseReuniao, tom: "humano",
        baseAlternativa: a.sql > 0 ? undefined : "HQL",
      },
      { nome: "Reunião realizada", valor: a.shows, anterior: a.reunioes, tom: "humano" },
      { nome: "Venda", valor: a.vendas, anterior: a.shows, tom: "hql" },
    ];
  }, [topo, a]);

  /**
   * Uma linha por campanha.
   *
   * Campanha é o nível em que a verba é decidida — é onde se liga, se desliga e
   * se muda orçamento. O anúncio diz qual criativo funciona; a campanha diz
   * para onde o dinheiro foi. Faltava, e sem ela a aba mostrava o total e o
   * anúncio, pulando justamente o degrau onde a decisão acontece.
   */
  const campanhas = useMemo(() => {
    const anuncios = desempenho?.anuncios ?? [];
    const leads = desempenho?.leads ?? [];
    const nomes = new Map<string, string>();
    for (const an of anuncios) {
      if (an.campaign_id) nomes.set(an.campaign_id, an.campaign_name || an.campaign_id);
    }
    const chaves = new Set<string>([...nomes.keys()]);
    const linhas = [...chaves].map((id) => ({
      id,
      nome: nomes.get(id) || id,
      agg: agregar(
        anuncios.filter((x) => x.campaign_id === id),
        leads.filter((l) => l.campaign_id === id),
      ),
    }));
    // Ordena por gasto: a primeira linha da tabela é onde mais dinheiro entrou,
    // que é a pergunta que se faz primeiro ao abrir a tela.
    linhas.sort((x, y) => y.agg.spend - x.agg.spend);

    // A LINHA QUE SALVA A TABELA DE MENTIR (medido em 24/09: 117 de 169 leads
    // sem `campaign_id`).
    //
    // Sem ela, campanha sem lead atribuído aparece com zero — e zero se lê como
    // "não funcionou", quando o que houve foi perda de atribuição. Mostrar os
    // órfãos numa linha própria é o que impede alguém desligar uma campanha por
    // um número que ela nunca teve chance de produzir.
    const orfaos = leads.filter((l) => !l.campaign_id || !nomes.has(l.campaign_id));
    if (orfaos.length) {
      linhas.push({ id: "__sem_campanha__", nome: "(lead sem campanha atribuída)", agg: agregar([], orfaos) });
    }
    return linhas;
  }, [desempenho]);

  /** Quanto da leitura por campanha é confiável: leads com campanha ÷ leads. */
  const coberturaCampanha = useMemo(() => {
    const leads = desempenho?.leads ?? [];
    if (!leads.length) return null;
    return leads.filter((l) => l.campaign_id).length / leads.length;
  }, [desempenho]);

  /**
   * O mesmo período cortado por dia da semana e por semana do mês.
   *
   * Cuidado de leitura embutido: cada corte carrega quantos DIAS entraram nele.
   * Uma terça sem HQL em 9 terças e 21 leads não prova que terça é ruim — prova
   * que a amostra é pequena. Por isso a tela mostra o número de dias e o de
   * leads ao lado do custo, e não só o custo.
   */
  const cortes = useMemo(() => {
    if (!ritmo?.length) return null;
    const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const vazio = () => ({ dias: 0, spend: 0, leads: 0, mql: 0, hql: 0 });
    const semana = DOW.map(vazio);
    const doMes = [vazio(), vazio(), vazio(), vazio()];
    for (const d of ritmo) {
      // `T12:00` e não meia-noite: a data crua vira um Date em UTC, e à
      // meia-noite qualquer fuso negativo joga o dia para trás.
      const data = new Date(`${d.dia}T12:00:00`);
      const alvo = [semana[data.getDay()], doMes[Math.min(3, Math.floor((data.getDate() - 1) / 7))]];
      for (const s of alvo) {
        s.dias += 1; s.spend += d.spend; s.leads += d.leads; s.mql += d.mql; s.hql += d.hql;
      }
    }
    return {
      semana: semana.map((s, i) => ({ rotulo: DOW[i], ...s })),
      doMes: doMes.map((s, i) => ({ rotulo: ["1ª (1-7)", "2ª (8-14)", "3ª (15-21)", "4ª (22-fim)"][i], ...s })),
    };
  }, [ritmo]);

  const topoDaCascata = topo?.gente ?? null;
  const cacSobreTcv = a.receita > 0 ? (a.spend / a.receita) * 100 : null;
  const roas = a.spend > 0 ? a.receita / a.spend : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Aquisição</CardTitle>
            {/* O filtro de período é o do topo do painel e vale para a aba
                inteira. Repetir o seletor aqui criaria dois filtros para a
                mesma pergunta; o que faltava era DIZER qual está valendo. */}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {startDateOnly && endDateOnly
                ? `${startDateOnly.split("-").reverse().join("/")} a ${endDateOnly.split("-").reverse().join("/")}`
                : "período do filtro do topo"}
              {ritmo?.length ? ` · ${ritmo.length} dias com registro` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {erro && (
            <p className="text-xs text-red-400 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
              {erro}
            </p>
          )}

          {/* Quem foi descartado do topo, e por quê. Filtro que não se vê é
              filtro que ninguém confere. */}
          {topo && (
            <p className="text-[11px] text-muted-foreground rounded-md border border-border/60 px-3 py-2">
              <span className="font-semibold text-foreground">{inteiro(topo.descartadas)}</span> de{" "}
              {inteiro(topo.total)} sessões fora da conta (
              {taxa(topo.descartadas, topo.total)}): crawler da Meta {inteiro(topo.crawler_meta)} ·
              escritório {inteiro(topo.escritorio)}
              {topo.sem_ip > 0 && (
                <> · {inteiro(topo.sem_ip)} sessões sem IP continuam contando como gente, por não haver prova de robô</>
              )}
            </p>
          )}
          {!topo && !carregando && (
            <p className="text-[11px] text-amber-300/90 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              Topo do funil não carregou: a cascata começa no lead. Sessão, formulário e conclusão
              aparecem como "—" em vez de zero.
            </p>
          )}

          {/* KPIs. MQL vem antes de HQL e de venda de propósito: é o número que
              a casa usa para comparar criativo e variante. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* Venda em card sólido: a hierarquia da casa (14/08) põe a venda
                com maior ticket antes de tudo, e a tela tem que dizer isso sem
                o leitor precisar saber a regra. Só ganha o sólido quando houve
                venda — um card verde gritando zero celebra o vazio. */}
            <Kpi
              rotulo="Vendas — o jogo"
              valor={inteiro(a.vendas)}
              sub={a.vendas > 0
                ? `${brl(a.receita)} de TCV · ticket médio ${brl(a.receita / a.vendas)}`
                : "nenhuma venda de mídia no período"}
              nota="Criativo com MQL caro que vende ganha de MQL barato que não vende."
              destaque={a.vendas > 0}
            />
            <Kpi
              rotulo="MQL 10k+"
              valor={inteiro(a.mql)}
              tom="mql"
              sub={`${custo(a.spend, a.mql)} por MQL · ${taxa(a.mql, a.leads)} dos leads`}
              nota="É o denominador de análise da casa: criativo e variante se comparam por MQL, nunca por lead total."
            />
            <Kpi
              rotulo="HQL"
              valor={inteiro(a.hql)}
              tom="hql"
              sub={`${custo(a.spend, a.hql)} por HQL · ${taxa(a.hql, a.mql)} dos MQL`}
              nota="Custo por HQL detecta deterioração. Não decide escala: múltiplo unitário não diz se o caixa cresce."
            />
            <Kpi
              rotulo="Investimento"
              valor={brl(a.spend)}
              sub={`${inteiro(a.impressions)} impressões${
                a.link_clicks !== null ? ` · CTR link ${(((a.link_clicks || 0) / (a.link_impressions || 1)) * 100).toFixed(2).replace(".", ",")}%` : ""
              }`}
              nota={a.link_clicks === null ? "CTR de link ainda não sincronizado neste período." : undefined}
            />
          </div>

          {/* Cascata */}
          <div>
            <div className="flex items-baseline gap-3 mb-3 border-b border-border/50 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wider">Cascata</p>
              <p className="text-[11px] text-muted-foreground">
                cada etapa contra a anterior e contra o topo · cinza é tráfego, amarelo é o
                denominador, verde é qualidade, azul depende de alguém agir
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2">
              {etapas.map((e) => (
                <CardEtapa key={e.nome} e={e} topo={topoDaCascata} />
              ))}
            </div>
          </div>

          {/* Custos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
              Custo por etapa
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Custo
                rotulo="Custo por lead"
                valor={custo(a.spend, a.leads)}
                base="diagnóstico: mistura quem pode comprar com quem não pode"
              />
              <Custo
                rotulo="Custo por MQL 10k+"
                valor={custo(a.spend, a.mql)}
                base="é por aqui que a verba se lê, não pelo lead total"
                forte
              />
              <Custo
                rotulo="Custo por HQL"
                valor={custo(a.spend, a.hql)}
                base="detecta deterioração; não decide escala sozinho"
              />
              <Custo
                rotulo="Custo por reunião realizada"
                valor={custo(a.spend, a.shows)}
                base={`${inteiro(a.shows)} realizadas de ${inteiro(a.reunioes)} marcadas · pega o no-show`}
              />
              <Custo
                rotulo="CAC de mídia"
                valor={custo(a.spend, a.vendas)}
                base="só mídia; falta o custo comercial para virar CAC total"
              />
            </div>
          </div>

          {/* Por campanha — onde a verba é decidida */}
          {campanhas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
                Por campanha · ordenado por gasto
              </p>
              {coberturaCampanha !== null && coberturaCampanha < 0.9 && (
                <p className="text-[11px] text-amber-300/90 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-2">
                  Só <strong>{(coberturaCampanha * 100).toFixed(0)}%</strong> dos leads têm campanha
                  atribuída. Campanha com gasto alto e zero lead nesta tabela provavelmente perdeu a
                  atribuição, não o resultado — confira na linha "(lead sem campanha atribuída)"
                  antes de desligar qualquer coisa.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/50">
                      <th className="text-left font-medium py-1.5">Campanha</th>
                      <th className="text-right font-medium">Gasto</th>
                      <th className="text-right font-medium">Leads</th>
                      <th className="text-right font-medium">MQL</th>
                      <th className="text-right font-medium">R$/MQL</th>
                      <th className="text-right font-medium">HQL</th>
                      <th className="text-right font-medium">R$/HQL</th>
                      <th className="text-right font-medium">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campanhas.map((c) => (
                      <tr
                        key={c.id}
                        className={`border-b border-border/30 ${c.id === "__sem_campanha__" ? "text-amber-300/90 italic" : ""}`}
                      >
                        <td className="py-1.5 pr-2 max-w-[260px] truncate" title={c.nome}>{c.nome}</td>
                        <td className="text-right tabular-nums">{brl(c.agg.spend)}</td>
                        <td className="text-right tabular-nums">{inteiro(c.agg.leads)}</td>
                        <td className="text-right tabular-nums text-amber-300">{inteiro(c.agg.mql)}</td>
                        <td className="text-right tabular-nums">{custo(c.agg.spend, c.agg.mql)}</td>
                        <td className="text-right tabular-nums text-emerald-400">{inteiro(c.agg.hql)}</td>
                        <td className="text-right tabular-nums">{custo(c.agg.spend, c.agg.hql)}</td>
                        <td className="text-right tabular-nums">{inteiro(c.agg.vendas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ritmo: quais dias e quais semanas rendem */}
          {cortes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
                Ritmo · onde o HQL aparece dentro do período
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TabelaRitmo titulo="Por dia da semana" linhas={cortes.semana} />
                <TabelaRitmo titulo="Por semana do mês" linhas={cortes.doMes} />
              </div>
              <p className="text-[10px] text-muted-foreground/80 mt-2">
                A coluna "dias" é a amostra. Um dia da semana sem HQL em poucas ocorrências não
                prova que o dia é ruim — prova que ainda não houve volume para decidir. Leia o
                custo por HQL junto com o número de leads, nunca sozinho.
              </p>
            </div>
          )}

          {/* Réguas da casa */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
              Réguas da casa · critério do Full Sales, não benchmark de fora
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Regua
                rotulo="CAC de mídia sobre TCV"
                valor={cacSobreTcv === null ? "—" : `${cacSobreTcv.toFixed(1).replace(".", ",")}%`}
                limite="Teto da casa: 10%"
                estourada={cacSobreTcv !== null && cacSobreTcv > 10}
              />
              <Regua
                rotulo="ROAS de mídia paga"
                valor={roas === null ? "—" : `${roas.toFixed(2).replace(".", ",")}x`}
                limite="Piso para escalar: 10x"
                estourada={roas !== null && roas < 10}
              />
            </div>
          </div>

          {etapas.some((e) => e.nota) && (
            <p className="text-[11px] text-amber-300/90 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Lead maior que "Completou" é impossível por construção: são leads sem sessão ligada.
                Enquanto isso não fechar, leitura por criativo herda o mesmo buraco.
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
