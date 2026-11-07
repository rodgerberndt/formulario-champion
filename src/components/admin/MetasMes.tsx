// A projeção do mês, dentro de Métricas Criativos.
//
// A pergunta que este bloco responde não é "quanto por cento da meta", e sim
// "estamos à frente ou atrás do ritmo". Percentual da meta cheia no dia 10 não
// informa nada; o que informa é comparar o realizado com o quanto já deveria
// estar feito a esta altura. Por isso cada barra tem duas marcas: o preenchido
// (realizado) e o traço (esperado até hoje).
//
// Desde 03/09/2026 este bloco NÃO é mais o lugar de olhar meta de período: cada
// KPI do painel carrega a própria meta, rateada para o intervalo filtrado. Aqui
// sobra a única pergunta que o filtro não responde — como o MÊS inteiro vai
// terminar se o ritmo de hoje continuar.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, AlertTriangle } from "lucide-react";

interface Linha {
  chave: string;
  rotulo: string;
  dono: string;
  formato: "moeda" | "numero";
  meta: number | null;
  /** A meta como está em `commercial_goals`, sem o arredondamento para cima. */
  meta_bruta: number | null;
  realizado: number;
  esperado: number | null;
  pct: number | null;
  /**
   * Só em `reunioes_agendadas` (17/09/2026). `realizado` desta linha conta
   * apenas as calls que o TIME marcou; estas duas dizem o total e quantas o
   * próprio lead marcou sozinho em /agendar. Sem isso a linha some com as
   * automáticas e o total desaparece da tela.
   */
  realizado_total?: number;
  realizado_auto?: number;
}

interface Semana {
  inicio: string;
  fim: string;
  rotulo_inicio: string;
  rotulo_fim: string;
  dias_uteis: number;
  dias_corridos: number;
  peso: number;
  corrente: boolean;
  passada: boolean;
  linhas: Record<string, { meta: number | null; esperado: number | null; realizado: number }>;
}

interface Metas {
  month: string;
  hoje: string;
  tem_meta: boolean;
  observacao: string | null;
  progresso: { uteis: number; corridos: number };
  linhas: Linha[];
  semanas: Semana[];
  avisos: string[];
}

const diaMes = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

const fmt = (v: number, formato: "moeda" | "numero") =>
  formato === "moeda"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : v.toLocaleString("pt-BR", { maximumFractionDigits: v % 1 === 0 ? 0 : 1 });

/** Barra com o realizado preenchido e um traço no ritmo esperado. */
function Barra({ realizado, meta, esperado }: { realizado: number; meta: number | null; esperado: number | null }) {
  if (!meta || meta <= 0) return null;
  const pct = Math.max(0, Math.min(100, (realizado / meta) * 100));
  const marca = esperado == null ? null : Math.max(0, Math.min(100, (esperado / meta) * 100));
  const atras = esperado != null && realizado < esperado;
  return (
    <div className="relative h-1.5 w-full bg-muted mt-2 mb-1">
      <div
        className={`absolute inset-y-0 left-0 ${atras ? "bg-amber-500" : "bg-emerald-500"}`}
        style={{ width: `${pct}%` }}
      />
      {marca != null && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 bg-foreground/60"
          style={{ left: `${marca}%` }}
          title="ritmo esperado até hoje"
        />
      )}
    </div>
  );
}

export default function MetasMes({ month }: { month?: string }) {
  const [dados, setDados] = useState<Metas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { fetchAdmin } = await import("@/lib/adminAuth");
      const base = import.meta.env.VITE_SUPABASE_URL;
      const q = month ? `?month=${month}` : "";
      const res = await fetchAdmin(`${base}/functions/v1/admin-data/metas${q}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setDados(j);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar metas");
    } finally {
      setCarregando(false);
    }
  }, [month]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando metas…
      </CardContent></Card>
    );
  }
  if (erro || !dados) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Metas indisponíveis: {erro}</CardContent></Card>;
  }

  const [ano, mes] = dados.month.split("-");
  const nomeMes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"][Number(mes) - 1];
  const futuro = dados.hoje < `${dados.month}-01`;

  return (
    <Card className="border-emerald-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <Target className="w-4 h-4" /> Projeção de {nomeMes} de {ano}
          </span>
          <span className="flex items-center gap-2">
            {!dados.tem_meta && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">sem meta cadastrada</Badge>}
            {futuro && <Badge variant="outline" className="text-[10px]">o mês ainda não começou</Badge>}
            <span className="text-[11px] font-normal text-muted-foreground">
              {(dados.progresso.uteis * 100).toFixed(0)}% dos dias úteis
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {dados.avisos.map((a) => (
          <div key={a} className="flex gap-2 text-xs text-amber-400 border border-amber-500/25 bg-amber-500/5 p-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {a}
          </div>
        ))}

        {/* Mês */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          {dados.linhas.map((l) => {
            const atras = l.esperado != null && l.realizado < l.esperado;
            return (
              <div key={l.chave}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{l.rotulo}</p>
                <p className="text-lg font-bold leading-tight">
                  {fmt(l.realizado, l.formato)}
                  {l.meta != null && (
                    <span className="text-[11px] font-normal text-muted-foreground"> de {fmt(l.meta, l.formato)}</span>
                  )}
                </p>
                <Barra realizado={l.realizado} meta={l.meta} esperado={l.esperado} />
                <p className="text-[10px] text-muted-foreground">
                  {l.meta == null ? (
                    <span>sem meta · {l.dono}</span>
                  ) : (
                    <>
                      <span className={atras ? "text-amber-400" : "text-emerald-400"}>
                        {((l.pct ?? 0) * 100).toFixed(0)}% da meta
                      </span>
                      {l.esperado != null && <span> · esperado {fmt(l.esperado, l.formato)}</span>}
                    </>
                  )}
                </p>
                {/* Reuniões agendadas: o número grande é o do time. O total e a
                    fatia automática continuam visíveis aqui — some-los seria
                    esconder calls que existem de verdade na agenda. */}
                {l.realizado_total != null && (
                  <p className="text-[10px] text-muted-foreground/80">
                    {fmt(l.realizado_total, l.formato)} no total ·{" "}
                    <span className="text-cyan-400">{fmt(l.realizado_auto ?? 0, l.formato)} pelo lead</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Cascata semana a semana.
            Tirada por um momento em 03/09/2026, quando a meta passou a andar ao
            lado de cada KPI, e devolvida no mesmo dia: o KPI responde "como
            estou AGORA", e esta tabela responde "como o mês se distribui" — que
            é a conversa de planejamento, não a de acompanhamento.

            A semana vai de SÁBADO A SEXTA, e o rótulo mostra o intervalo real em
            vez de só os dias úteis. Esconder o fim de semana aqui seria mentir
            justamente onde ele mais pesa: domingo é o maior dia de MQL. */}
        <div className="border-t border-border/50 pt-4 overflow-x-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Semana a semana
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium py-1">Semana (sáb a sex)</th>
                <th className="text-right font-medium">Dias</th>
                <th className="text-right font-medium">Mídia</th>
                <th className="text-right font-medium">MQL</th>
                <th className="text-right font-medium">Agend.</th>
                <th className="text-right font-medium">Realiz.</th>
                <th className="text-right font-medium">TCV</th>
              </tr>
            </thead>
            <tbody>
              {dados.semanas.map((sem) => (
                <tr
                  key={sem.inicio}
                  className={`border-t border-border/40 ${sem.corrente ? "bg-emerald-500/5" : sem.passada ? "opacity-60" : ""}`}
                >
                  <td className="py-1.5 whitespace-nowrap">
                    {diaMes(sem.inicio)} a {diaMes(sem.fim)}
                    {sem.corrente && <span className="ml-2 text-[9px] text-emerald-400 uppercase">atual</span>}
                  </td>
                  <td className="text-right text-muted-foreground whitespace-nowrap">
                    {sem.dias_corridos}
                    <span className="text-[10px]"> · {sem.dias_uteis} úteis</span>
                  </td>
                  {(["midia", "mql", "reunioes_agendadas", "reunioes_realizadas", "tcv_total"] as const).map((k) => {
                    const linha = sem.linhas[k];
                    const formato: "moeda" | "numero" = k === "midia" || k === "tcv_total" ? "moeda" : "numero";
                    // Semana futura não mostra realizado: zero ali é ruído, não
                    // é atraso. O que importa numa semana que não começou é a
                    // meta, e é só ela que aparece.
                    const futura = !sem.corrente && !sem.passada;
                    // Na semana CORRENTE o realizado é parcial, e compará-lo com
                    // a meta cheia fazia o sábado parecer desastre. A cor passa a
                    // sair do esperado ATÉ HOJE dentro da semana, do mesmo jeito
                    // que o traço faz nas barras do mês.
                    const temRitmo = sem.corrente && linha?.esperado != null;
                    const atrasada = temRitmo && (linha?.realizado ?? 0) < (linha!.esperado as number);
                    return (
                      <td
                        key={k}
                        className="text-right tabular-nums whitespace-nowrap"
                        title={temRitmo ? `esperado até agora: ${fmt(linha!.esperado as number, formato)}` : undefined}
                      >
                        {!futura && (
                          <span className={temRitmo ? (atrasada ? "text-amber-400" : "text-emerald-400") : undefined}>
                            {fmt(linha?.realizado ?? 0, formato)}
                          </span>
                        )}
                        {linha?.meta != null && (
                          <span className="text-muted-foreground">
                            {futura ? "" : " / "}{fmt(linha.meta, formato)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted-foreground mt-2">
            A soma das semanas fecha o mês exatamente. Uma semana leva um a mais que a
            outra porque o resto do arredondamento tem que cair em algum lugar.
          </p>
        </div>

        {/* ROAS — a meta-pedra escolhida pelo Rodger em 16/09/2026.
            "Agora a gente quer gerar lucro", e a régua da casa (Full Sales) é
            escalar só com ROAS acima de 10.

            DUAS COISAS APARECEM JUNTAS AQUI, DE PROPÓSITO.

            ROAS é uma RAZÃO e lucro é uma DIFERENÇA. O jeito mais fácil de
            bater ROAS 10 é GASTAR MENOS: a razão melhora e o lucro encolhe.
            Medido em 16/09: a venda típica já nasce com ROAS 9,9 (ticket
            R$ 21 mil ÷ CAC de mídia R$ 2.130), então o 10 descreve o presente.
            Com ROAS fixo em 9,9, uma venda no mês dá −R$ 16 mil e três dão
            +R$ 6,5 mil — mesmo ROAS, resultados opostos.

            Por isso o ROAS vem com o PISO DE VOLUME ao lado: quantos contratos
            de assessoria o mês precisa para pagar o custo fixo. Bater o ROAS
            sem bater o piso é encolher com elegância. */}
        {(() => {
          const midia = dados.linhas.find((l) => l.chave === "midia");
          const tcv = dados.linhas.find((l) => l.chave === "tcv_total");
          const contratos = dados.linhas.find((l) => l.chave === "contratos_assessoria");
          if (!midia || !tcv) return null;
          const ALVO_ROAS = 10;
          // PREMISSAS, não fatos — e marcadas como tal na tela.
          // Custo fixo: faixa de R$ 30 a 38 mil indicada pelo Rodger em 16/09;
          // uso o meio. O valor do painel (R$ 27.342,91) é anterior às
          // contratações de setembro.
          // Margem por assessoria: R$ 11.305 = ticket 21.000 − entrega
          // (25 bodies × 6 meses × R$ 43,17) − comissões (6,25% do recebido +
          // 1% do TCV) − CAC de mídia R$ 2.130. Medida sobre as 14 vendas de
          // jul a set.
          const CUSTO_FIXO = 34000;
          const MARGEM_ASSESSORIA = 11305;
          const roas = midia.realizado > 0 ? tcv.realizado / midia.realizado : null;
          const piso = Math.ceil(CUSTO_FIXO / MARGEM_ASSESSORIA);
          const feitos = contratos?.realizado ?? 0;
          const resultado = feitos * MARGEM_ASSESSORIA - CUSTO_FIXO;
          return (
            <div className="border-t border-border/50 pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Lucro
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ROAS do mês</p>
                  <p className="text-lg font-bold leading-tight">
                    {roas != null ? `${roas.toFixed(1).replace(".", ",")}x` : "—"}
                    <span className="text-[11px] font-normal text-muted-foreground"> de {ALVO_ROAS}x</span>
                  </p>
                  <Barra realizado={roas ?? 0} meta={ALVO_ROAS} esperado={ALVO_ROAS} />
                  <p className="text-[10px] text-muted-foreground">TCV ÷ mídia · régua da casa</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Piso para pagar o fixo
                  </p>
                  <p className="text-lg font-bold leading-tight">
                    {fmt(feitos, "numero")}
                    <span className="text-[11px] font-normal text-muted-foreground"> de {piso} contratos</span>
                  </p>
                  <Barra realizado={feitos} meta={piso} esperado={null} />
                  <p className="text-[10px] text-muted-foreground">premissa: fixo {fmt(CUSTO_FIXO, "moeda")}/mês</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Resultado estimado
                  </p>
                  <p className={`text-lg font-bold leading-tight ${resultado >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    {fmt(resultado, "moeda")}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {fmt(feitos, "numero")} × {fmt(MARGEM_ASSESSORIA, "moeda")} de margem − fixo
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                ROAS é razão, lucro é diferença: gastar menos melhora o ROAS e encolhe o lucro. Por isso o piso
                de contratos anda junto. Margem e custo fixo são <strong>premissas</strong> — a margem saiu das 14
                vendas de jul a set (entrega, comissões e CAC de mídia descontados), e o fixo é o meio da faixa de
                R$ 30 a 38 mil. Imposto ainda não entra nesta conta.
              </p>
            </div>
          );
        })()}

        {/* Ticket implícito da meta.
            A meta de contratos e a de TCV são o mesmo alvo visto de dois
            ângulos, e o Rodger deixou claro qual manda: a intenção é chegar na
            RECEITA. Uma venda maior compensa uma venda a menos, e sem este
            número ninguém enxerga isso — fica todo mundo perseguindo contagem.
            Por isso ele aparece ao lado do que já foi feito, não sozinho. */}
        {(() => {
          const contratos = dados.linhas.find((l) => l.chave === "contratos_assessoria");
          const tcv = dados.linhas.find((l) => l.chave === "tcv_assessoria");
          if (!contratos?.meta || !tcv?.meta) return null;
          // A meta CADASTRADA, não a arredondada para cima. `contratos` está
          // gravado como 10,5: dividir por 11 dizia que o ticket alvo era
          // R$ 20.024 quando a cascata que originou a meta assume R$ 20.978.
          const contratosMeta = contratos.meta_bruta ?? contratos.meta;
          const tcvMeta = tcv.meta_bruta ?? tcv.meta;
          if (!contratosMeta || !tcvMeta) return null;
          const implicito = tcvMeta / contratosMeta;
          const real = contratos.realizado > 0 ? tcv.realizado / contratos.realizado : null;
          return (
            <div className="border-t border-border/50 pt-3">
              <p className="text-[11px] text-muted-foreground">
                Para bater o TCV de assessoria com {fmt(contratosMeta, "numero")} contratos, o
                ticket médio precisa ser <strong className="text-foreground">{fmt(implicito, "moeda")}</strong>.
                {real != null && (
                  <>
                    {" "}O ticket do mês está em{" "}
                    <strong className={real >= implicito ? "text-emerald-400" : "text-amber-400"}>
                      {fmt(real, "moeda")}
                    </strong>
                    {real >= implicito
                      ? " — acima do necessário, então menos contratos ainda fecham a receita."
                      : " — abaixo, então a receita exige mais contratos do que a meta prevê."}
                  </>
                )}
              </p>
            </div>
          );
        })()}

        {dados.observacao && (
          <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-3">{dados.observacao}</p>
        )}
      </CardContent>
    </Card>
  );
}
