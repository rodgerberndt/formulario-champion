import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, ChevronRight, Layers, Loader2, RefreshCw } from "lucide-react";
import {
  TODAS,
  SELECAO_INICIAL,
  agregar,
  ctrDeLink,
  dentroDaSelecao,
  filhos,
  nivelDosFilhos,
  opcoes,
  selecionar,
  type Agregado,
  type Anuncio,
  type LeadResumo,
  type Nivel,
  type Selecao,
} from "@/lib/desempenhoConta";

/**
 * Desempenho por conta → campanha → conjunto → anúncio → lead.
 *
 * Mídia (Meta) e qualidade (sistema) lado a lado, no mesmo recorte, e amarrados
 * por ID. O mesmo nome de anúncio roda em três contas desde 12/09/2026; somar
 * por nome juntaria os três braços do experimento. Ver src/lib/desempenhoConta.ts.
 */

interface Conta {
  ad_account_id: string;
  account_name: string | null;
  currency: string | null;
  sync_enabled: boolean | null;
}

interface Resposta {
  /** O corte do quiz (73). Chave antiga, mantida; o corte real é por versão. */
  limiar_hql: number;
  /** Corte por versão de score: { "v2.3": 73, "v3-form": 67 }. */
  limiares_hql?: Record<string, number>;
  contas: Conta[];
  anuncios: Anuncio[];
  leads: LeadResumo[];
  leads_sem_id: number;
  leads_sem_conta: number;
  /** Leads com macro literal da Meta no `ad_id`: prévia do Gerenciador, não tráfego. */
  leads_previa?: number;
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<unknown>;
  startISO?: string | null;
  endISO?: string | null;
  startDateOnly?: string | null;
  endDateOnly?: string | null;
}

const ROTULO_NIVEL: Record<Nivel, string> = {
  conta: "Conta",
  campanha: "Campanha",
  conjunto: "Conjunto",
  anuncio: "Anúncio",
};
const TODAS_ROTULO: Record<Nivel, string> = {
  conta: "Todas as contas",
  campanha: "Todas as campanhas",
  conjunto: "Todos os conjuntos",
  anuncio: "Todos os anúncios",
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const inteiro = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));
const custo = (spend: number, n: number) => (n > 0 && spend > 0 ? brl(spend / n) : "—");
const taxa = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");
// O CTR de link pode ser desconhecido, e desconhecido não é 0%: enquanto o
// histórico do `ad_spend` não for re-sincronizado, o período pode não ter o
// campo. A tela diz "—" nesse caso em vez de inventar um número redondo.
const porcento = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}%`);
function Kpi({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub?: string; destaque?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{rotulo}</p>
      <p className={`text-base font-semibold tabular-nums ${destaque ?? ""}`}>{valor}</p>
      {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
        {titulo}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Indicadores({ a }: { a: Agregado }) {
  const roas = a.spend > 0 ? `${(a.receita / a.spend).toFixed(2).replace(".", ",")}x` : "—";
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <Grupo titulo="Mídia (Meta)">
        <Kpi rotulo="Gasto" valor={brl(a.spend)} />
        <Kpi rotulo="Impressões" valor={inteiro(a.impressions)} />
        <Kpi rotulo="CPM" valor={a.impressions > 0 ? brl((a.spend / a.impressions) * 1000) : "—"} />
        <Kpi
          rotulo="CTR link"
          valor={porcento(ctrDeLink(a))}
          sub={a.link_clicks === null
            ? "período sem o campo sincronizado"
            : `${inteiro(a.link_clicks)} cliques no link`}
        />
        <Kpi rotulo="CPC link" valor={a.link_clicks ? custo(a.spend, a.link_clicks) : "—"} sub={`${inteiro(a.clicks)} cliques totais`} />
        <Kpi rotulo="Leads (Meta)" valor={inteiro(a.meta_leads)} sub={`${inteiro(a.lpv)} LPV`} />
      </Grupo>
      <Grupo titulo="Qualidade (sistema)">
        <Kpi rotulo="Leads" valor={inteiro(a.leads)} sub={`Custo/Lead ${custo(a.spend, a.leads)}`} />
        <Kpi rotulo="MQL" valor={inteiro(a.mql)} sub={`Custo/MQL ${custo(a.spend, a.mql)}`} />
        <Kpi rotulo="MQL/Lead" valor={taxa(a.mql, a.leads)} />
        <Kpi rotulo="HQL" valor={inteiro(a.hql)} sub={`Custo/HQL ${custo(a.spend, a.hql)}`} destaque={a.hql > 0 ? "text-emerald-400" : undefined} />
        <Kpi rotulo="HQL/MQL" valor={taxa(a.hql, a.mql)} />
      </Grupo>
      <Grupo titulo="Comercial (sistema)">
        <Kpi rotulo="Reuniões" valor={inteiro(a.reunioes)} />
        <Kpi rotulo="Shows" valor={inteiro(a.shows)} sub={taxa(a.shows, a.reunioes)} />
        <Kpi rotulo="Vendas" valor={inteiro(a.vendas)} />
        <Kpi rotulo="Receita" valor={brl(a.receita)} />
        <Kpi rotulo="ROAS" valor={roas} />
      </Grupo>
    </div>
  );
}

export default function DesempenhoPorConta({ fetchAdminData, startISO, endISO, startDateOnly, endDateOnly }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<Selecao>(SELECAO_INICIAL);

  // OS SELETORES SOBEM PARA A BARRA FIXA DO TOPO, ao lado de "Todas as páginas"
  // e "Todos os criativos" — pedido em 16/09/2026. Eles são filtro de contexto
  // igual aos outros dois, e viviam no meio da aba: trocar de conta exigia rolar
  // até o card e depois rolar de volta para ler o que mudou.
  //
  // O slot é criado por AdminAnalytics. Enquanto ele não existir, os seletores
  // continuam desenhados dentro do card — fallback que também cobre o caso de
  // este bloco ser usado em outra tela.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let vivo = true;
    const procurar = () => {
      if (!vivo) return;
      const el = document.getElementById("admin-header-filters-slot");
      if (el) setHeaderSlot(el);
      else requestAnimationFrame(procurar);
    };
    requestAnimationFrame(procurar);
    return () => {
      vivo = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params: Record<string, string> = {};
      if (startISO) params.from = startISO;
      if (endISO) params.to = endISO;
      if (startDateOnly) params.from_date = startDateOnly;
      if (endDateOnly) params.to_date = endDateOnly;
      const r = (await fetchAdminData("/contas-desempenho", params)) as Resposta;
      setDados(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [fetchAdminData, startISO, endISO, startDateOnly, endDateOnly]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const anuncios = dados?.anuncios ?? [];
  const leads = dados?.leads ?? [];

  const noEscopo = useMemo(
    () => ({
      anuncios: anuncios.filter((a) => dentroDaSelecao(a, selecao)),
      leads: leads.filter((l) => dentroDaSelecao(l, selecao)),
    }),
    [anuncios, leads, selecao],
  );
  const total = useMemo(() => agregar(noEscopo.anuncios, noEscopo.leads), [noEscopo]);
  const nivelFilho = nivelDosFilhos(selecao);
  const linhasFilhas = useMemo(() => filhos(anuncios, leads, selecao), [anuncios, leads, selecao]);

  const contasSemSync = useMemo(() => {
    const ativas = new Set(anuncios.map((a) => a.ad_account_id).concat(leads.map((l) => l.ad_account_id)));
    return (dados?.contas ?? []).filter((c) => ativas.has(c.ad_account_id) && !c.sync_enabled);
  }, [dados, anuncios, leads]);

  const escolher = (nivel: Nivel, valor: string) => setSelecao((s) => selecionar(s, nivel, valor));

  // Seletores encadeados: mudar um nível zera os de baixo. Desenhados uma vez e
  // colocados no topo ou no card, conforme o slot exista.
  const seletores = (
    <>
      {(["conta", "campanha", "conjunto", "anuncio"] as Nivel[]).map((nivel) => {
        const lista = opcoes(anuncios, selecao, nivel);
        const ativo = selecao[nivel] !== TODAS;
        return (
          <Select key={nivel} value={selecao[nivel]} onValueChange={(v) => escolher(nivel, v)}>
            <SelectTrigger
              className={`h-8 text-xs ${headerSlot ? "w-[160px]" : "w-full"} ${
                ativo ? "border-primary/60" : "text-muted-foreground"
              }`}
              title={ROTULO_NIVEL[nivel]}
            >
              <SelectValue placeholder={TODAS_ROTULO[nivel]} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>{TODAS_ROTULO[nivel]}</SelectItem>
              {lista.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
    </>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="w-5 h-5" />
              Desempenho por conta
              <span className="text-sm font-normal text-muted-foreground">conta → campanha → conjunto → anúncio</span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Mídia da Meta e qualidade do sistema no mesmo recorte, amarrados pelo ID do anúncio — nunca pelo nome.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {erro && (
          <div className="flex gap-2 text-xs text-destructive border border-destructive/30 bg-destructive/5 p-2 rounded">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Não foi possível carregar: {erro}</span>
          </div>
        )}

        {!headerSlot && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">{seletores}</div>
        )}
        {headerSlot && createPortal(seletores, headerSlot)}

        {carregando && !dados ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Indicadores a={total} />

            {nivelFilho && (
              <div className="rounded-md border border-border/60 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">{ROTULO_NIVEL[nivelFilho]}</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">CPM</TableHead>
                      <TableHead className="text-right">CTR link</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Custo/Lead</TableHead>
                      <TableHead className="text-right">MQL</TableHead>
                      <TableHead className="text-right">Custo/MQL</TableHead>
                      <TableHead className="text-right">HQL</TableHead>
                      <TableHead className="text-right">Custo/HQL</TableHead>
                      <TableHead className="text-right">HQL/MQL</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasFilhas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center text-xs text-muted-foreground py-6">
                          Nenhum gasto nem lead com ID de anúncio neste período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      linhasFilhas.map((f) => {
                        const a = f.agregado;
                        return (
                          <TableRow
                            key={f.chave}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => escolher(nivelFilho, f.chave)}
                          >
                            <TableCell className="font-medium">
                              <span className="line-clamp-2">{f.rotulo}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{brl(a.spend)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {a.impressions > 0 ? brl((a.spend / a.impressions) * 1000) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{porcento(ctrDeLink(a))}</TableCell>
                            <TableCell className="text-right tabular-nums">{inteiro(a.leads)}</TableCell>
                            <TableCell className="text-right tabular-nums">{custo(a.spend, a.leads)}</TableCell>
                            <TableCell className="text-right tabular-nums">{inteiro(a.mql)}</TableCell>
                            <TableCell className="text-right tabular-nums">{custo(a.spend, a.mql)}</TableCell>
                            <TableCell className={`text-right tabular-nums ${a.hql > 0 ? "text-emerald-400 font-semibold" : ""}`}>
                              {inteiro(a.hql)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{custo(a.spend, a.hql)}</TableCell>
                            <TableCell className="text-right tabular-nums">{taxa(a.hql, a.mql)}</TableCell>
                            <TableCell className="text-right tabular-nums">{inteiro(a.vendas)}</TableCell>
                            <TableCell className="text-right tabular-nums">{brl(a.receita)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {a.spend > 0 ? `${(a.receita / a.spend).toFixed(2).replace(".", ",")}x` : "—"}
                            </TableCell>
                            <TableCell className="w-6">
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* A tabela de leads individuais saiu daqui em 16/09/2026: este bloco
                responde "qual anúncio/conta entrega qualidade por quanto", e a
                lista nominal de leads é conversa da aba Leads, onde o score
                agora aparece por lead. As CONTAGENS (Leads, MQL, HQL) ficam:
                sem elas não existe custo por HQL, que é o número que decide o
                teste das contas. */}
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>
                Gasto em reais, convertido do dólar pela cotação do dia em que a Meta foi sincronizada. Alcance e
                frequência não são gravados pelo sincronizador, por isso não aparecem aqui.
              </p>
              <p>
                MQL segue a mesma regra do restante do painel. HQL é score gravado no lead acima do corte da VERSÃO
                dele — {dados?.limiares_hql?.["v2.3"] ?? dados?.limiar_hql ?? 73} para quem veio pelo quiz (e para todo
                o histórico) e {dados?.limiares_hql?.["v3-form"] ?? 67} para quem veio pelo formulário curto, que só
                pergunta faturamento e mercado. É o mesmo critério do evento HighQualityLead enviado à Meta.
                Reuniões, vendas e receita são dos leads que chegaram no período, mesmo que a venda tenha vindo
                depois; venda reembolsada não conta.
              </p>
              {(dados?.leads_sem_id ?? 0) > 0 && (
                <p className="text-amber-400">
                  {dados!.leads_sem_id} lead(s) do período não têm ID de anúncio (orgânico, indicação, ou tráfego sem os
                  parâmetros de ID) e ficam fora desta visão.
                </p>
              )}
              {(dados?.leads_sem_conta ?? 0) > 0 && (
                <p className="text-amber-400">
                  {dados!.leads_sem_conta} lead(s) têm ID de anúncio, mas a conta dele não foi encontrada no gasto
                  sincronizado. Aparecem como "Conta não identificada".
                </p>
              )}
              {(dados?.leads_previa ?? 0) > 0 && (
                <p className="text-purple-300">
                  {dados!.leads_previa} lead(s) chegaram com a macro da Meta sem substituir (<code>{"{{ad.id}}"}</code>):
                  clique em PRÉVIA de anúncio dentro do Gerenciador. Não é tráfego pago nem orgânico, e por isso ficam
                  fora desta visão em vez de virar uma conta fantasma.
                </p>
              )}
              {contasSemSync.length > 0 && (
                <p className="text-amber-400">
                  Sem sincronização de gasto: {contasSemSync.map((c) => c.account_name ?? c.ad_account_id).join(", ")}. Os
                  leads delas aparecem, o gasto fica zerado.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
