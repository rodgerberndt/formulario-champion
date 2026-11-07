// Meta do mês contra o realizado, com quebra por semana e ritmo esperado.
//
// Três decisões que valem para tudo aqui:
//
// 1. A SEMANA DE VENDA VAI DE SÁBADO A SEXTA. O fim de semana abre a semana, não
//    fecha a anterior: o tráfego roda de segunda a segunda, e o MQL que cai no
//    sábado e no domingo é combustível para a semana que está começando. Em 30 e
//    31/08 isso valeu 8 MQL, que pela regra antiga morriam numa semana já
//    fechada.
//
// 2. A META SE DIVIDE POR DIA, com PESO por dia da semana — não por "dia útil
//    sim, fim de semana não". Setembro tem semanas de 3, 4 e 5 dias úteis e um
//    feriado no dia 7; dividir por semanas iguais faria o time achar que está
//    atrasado na primeira semana e folgado na quarta.
//
// 3. O FIM DE SEMANA NÃO É ZERO. Isto estava errado até 03/09/2026, quando o
//    Rodger apontou: o tráfego roda de segunda a segunda, então cai MQL no
//    sábado e no domingo, e o Miguel agenda reunião no fim de semana.
//
//    Medido em 120 dias (86 dias úteis, 34 de fim de semana):
//
//      MQL          1,65/dia útil  ·  1,82/dia de fim de semana  → peso 1,00
//      Reunião ag.  0,28/dia útil  ·  0,15/dia de fim de semana  → peso 0,50
//      Reunião rea. 0,19/dia útil  ·  0,15/dia de fim de semana  → peso 0,75
//      Venda        0,14/dia útil  ·  0,03/dia de fim de semana  → peso 0,25
//
//    DOMINGO é o maior dia de MQL da semana (37 contra a média de 28 nos dias
//    úteis). Tratar fim de semana como zero fazia a meta de sábado ser zero com
//    MQL entrando, e o painel mostrava percentual infinito.
//
//    Os pesos de reunião e venda saem de amostras pequenas (29 e 13 eventos) e
//    estão arredondados de propósito: precisão de dois decimais aqui seria
//    invenção. Revisar quando o histórico crescer.
//
// 4. FERIADO conta como fim de semana, não como dia inexistente. No feriado o
//    tráfego roda igual e o comercial para — que é exatamente a diferença que
//    o peso descreve.

import { isRealizada } from "./meetings.ts";

const FUSO_BR_MS = 3 * 60 * 60 * 1000;

/**
 * Feriados nacionais. Ampliar conforme o ano avança.
 *
 * Em 16/09/2026 a lista ia só de setembro a dezembro de 2026: todo mês anterior
 * era exibido sem feriado nenhum, e a partir de 01/01/2027 TODO feriado passaria
 * a contar como dia útil — a meta diária desses dias subiria indevidamente e o
 * "esperado até hoje" ficaria maior que o devido. Faltavam também os móveis.
 *
 * Os móveis saem da Páscoa: 05/04/2026 e 28/03/2027. Carnaval é 48 e 47 dias
 * antes, Sexta-Feira Santa 2 dias antes, Corpus Christi 60 dias depois.
 *
 * Os que caem em sábado ou domingo ficam na lista de propósito: `ehDiaUtil` já
 * os trata como não úteis pelo dia da semana, e mantê-los evita ter que conferir
 * o calendário de novo a cada ano.
 */
const FERIADOS = new Set([
  // 2026
  "2026-01-01", // Confraternização
  "2026-02-16", "2026-02-17", // Carnaval
  "2026-04-03", // Sexta-Feira Santa
  "2026-04-21", // Tiradentes
  "2026-05-01", // Trabalho
  "2026-06-04", // Corpus Christi
  "2026-09-07", // Independência
  "2026-10-12", // Padroeira
  "2026-11-02", // Finados
  "2026-11-15", // República
  "2026-11-20", // Consciência Negra
  "2026-12-25", // Natal
  // 2027
  "2027-01-01", // Confraternização
  "2027-02-08", "2027-02-09", // Carnaval
  "2027-03-26", // Sexta-Feira Santa
  "2027-04-21", // Tiradentes
  "2027-05-01", // Trabalho
  "2027-05-27", // Corpus Christi
  "2027-09-07", // Independência
  "2027-10-12", // Padroeira
  "2027-11-02", // Finados
  "2027-11-15", // República
  "2027-11-20", // Consciência Negra
  "2027-12-25", // Natal
]);

/** Data civil brasileira (YYYY-MM-DD) de um timestamp UTC. */
export function dataBr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - FUSO_BR_MS).toISOString().slice(0, 10);
}

function diaDaSemana(d: string): number {
  return new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 dom … 6 sáb
}

export function ehDiaUtil(d: string): boolean {
  const w = diaDaSemana(d);
  return w >= 1 && w <= 5 && !FERIADOS.has(d);
}

function somaDias(d: string, n: number): string {
  const t = Date.parse(`${d}T12:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * O sábado que abre a semana de venda a que uma data pertence.
 *
 * A SEMANA COMEÇA NO SÁBADO. Invertido em 03/09/2026: antes o fim de semana
 * fechava a semana que tinha acabado, e o Rodger apontou o problema — o tráfego
 * roda de segunda a segunda, então o MQL que cai no sábado e no domingo é
 * combustível para a semana que está COMEÇANDO, não sobra da que passou.
 *
 * O efeito é grande e não é cosmético: no fim de semana de 30 e 31/08 caíram 8
 * MQL. Pela regra antiga eles morriam numa semana já fechada; pela nova, a
 * semana de setembro começou com 8 no placar antes da primeira segunda.
 *
 * A consequência a aceitar: reunião de sábado agora fecha na semana que começa.
 */
export function inicioDaSemana(d: string): string {
  const w = diaDaSemana(d); // 0 dom … 6 sáb
  const recuo = (w + 1) % 7; // sábado recua 0, domingo 1, segunda 2 … sexta 6
  return somaDias(d, -recuo);
}

export interface Semana {
  inicio: string;
  fim: string;
  rotulo_inicio: string;
  rotulo_fim: string;
  dias_uteis: number;
  dias_corridos: number;
  peso: number;
  corrente: boolean;
  passada: boolean;
}

/** As semanas de venda de um mês, com o peso de cada uma. */
export function semanasDoMes(month: string, hoje: string): Semana[] {
  const [y, m] = month.split("-").map(Number);
  const primeiro = `${month}-01`;
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ultimo = `${month}-${String(ultimoDia).padStart(2, "0")}`;

  const porSemana = new Map<string, { uteis: number; corridos: number; dias: string[] }>();
  for (let i = 1; i <= ultimoDia; i++) {
    const d = `${month}-${String(i).padStart(2, "0")}`;
    const seg = inicioDaSemana(d);
    // A semana é rotulada pelo sábado que a abre, mas só conta dias DENTRO do
    // mês: o resíduo de 31/08 pertence a agosto, não à meta de setembro.
    const chave = seg < primeiro ? primeiro : seg;
    const b = porSemana.get(chave) ?? { uteis: 0, corridos: 0, dias: [] };
    if (ehDiaUtil(d)) b.uteis++;
    b.corridos++;
    b.dias.push(d);
    porSemana.set(chave, b);
  }

  // Mês que começa no fim de semana gera um bloco com ZERO dias úteis (agosto
  // de 2026 começa num sábado). Em vez de exibir uma "semana" que não existe
  // comercialmente, esses dias entram na semana seguinte.
  const blocos = [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const juntos: Array<[string, { uteis: number; corridos: number; dias: string[] }]> = [];
  for (const [inicio, b] of blocos) {
    if (b.uteis === 0 && juntos.length === 0 && blocos.length > 1) {
      const [proxIni, prox] = blocos[1];
      prox.corridos += b.corridos;
      prox.dias = [...b.dias, ...prox.dias];
      blocos[1] = [proxIni, prox];
      continue;
    }
    juntos.push([inicio, b]);
  }

  const totalUteis = juntos.reduce((s, [, b]) => s + b.uteis, 0) || 1;
  const inicioHoje = inicioDaSemana(hoje);
  return juntos.map(([inicio, b]) => {
    const uteis = b.dias.filter(ehDiaUtil);
    const fim = b.dias[b.dias.length - 1];
    return {
      inicio,
      fim: fim > ultimo ? ultimo : fim,
      // O rótulo mostra o intervalo COMERCIAL (primeiro e último dia útil), e
      // não o domingo em que o bloco termina: a semana de venda é seg a sex.
      rotulo_inicio: uteis[0] ?? inicio,
      rotulo_fim: uteis[uteis.length - 1] ?? fim,
      dias_uteis: b.uteis,
      dias_corridos: b.corridos,
      peso: b.uteis / totalUteis,
      corrente: hoje >= inicio && hoje <= fim,
      passada: fim < inicioHoje,
    };
  });
}

export interface LinhaMeta {
  chave: string;
  rotulo: string;
  meta: number | null;
  realizado: number;
  /** Quanto já deveria estar feito a esta altura do mês. */
  esperado: number | null;
  formato: "moeda" | "numero";
  dono: string;
}

interface Fontes {
  leads: Array<{ id: string; created_at: string; investimento_faixa: string | null; sdr_override: string | null }>;
  spend: Array<{ date: string; spend: number }>;
  meetings: Array<{
    created_at: string;
    scheduled_at: string | null;
    status: string | null;
    attended: boolean | null;
    /** "auto" = o próprio lead marcou em /agendar. Qualquer outro valor (e null) = o time. */
    agendado_por?: string | null;
  }>;
  sales: Array<{ sale_date: string; revenue: number | null; amount_received: number | null; sale_type: string | null }>;
}

/**
 * O realizado de cada linha entre duas datas.
 *
 * Aqui é VOLUME, não taxa: quantos MQL entraram, quantas reuniões aconteceram,
 * quanto entrou de caixa. Taxa de conversão é outra conta, feita por coorte, e
 * não entra em acompanhamento de meta.
 */
export function realizado(f: Fontes, de: string, ate: string, isMql: (l: unknown) => boolean) {
  const noPeriodo = (d: string | null) => !!d && d >= de && d <= ate;

  const midia = f.spend.filter((r) => noPeriodo(r.date)).reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const mql = f.leads.filter((l) => noPeriodo(dataBr(l.created_at)) && isMql(l)).length;

  // Agendada conta no dia em que foi MARCADA; realizada conta no dia em que
  // ACONTECEU. São perguntas diferentes: uma mede o SDR, a outra a agenda.
  //
  // Desde 17/09/2026 nem toda agendada é trabalho do time: o lead de faixa alta
  // escolhe o horário sozinho em /agendar e a reunião nasce com
  // `agendado_por = "auto"`. Contar essa call como conquista do Miguel diria
  // que o SDR bateu a meta num dia em que ele não falou com ninguém — e a linha
  // existe justamente para medir o SDR.
  //
  // São três números, não um: `reunioes_agendadas` continua sendo o TOTAL (é
  // ele que tem meta cadastrada em commercial_goals e que a tela mostra no
  // topo), e as duas contagens ao lado dizem de onde ele veio.
  const noPeriodoAgendada = f.meetings.filter((m) => noPeriodo(dataBr(m.created_at)));
  const ehAuto = (m: { agendado_por?: string | null }) => m.agendado_por === "auto";
  const agendadas = noPeriodoAgendada.length;
  const agendadasAuto = noPeriodoAgendada.filter(ehAuto).length;
  const agendadasTime = agendadas - agendadasAuto;
  const realizadas = f.meetings.filter(
    (m) => isRealizada(m) && noPeriodo(dataBr(m.scheduled_at ?? m.created_at)),
  ).length;

  const vendas = f.sales.filter((v) => noPeriodo(v.sale_date));
  const ass = vendas.filter((v) => v.sale_type === "assessoria");
  // Parceria é comissionada e não tem TCV. Enquanto "tudo que não é assessoria"
  // significava Sprint, uma parceria de R$ 0 entrava no ticket médio do Sprint
  // e derrubava a média de um produto que não tem nada a ver com ela.
  const par = vendas.filter((v) => v.sale_type === "parceria");
  const spr = vendas.filter((v) => v.sale_type !== "assessoria" && v.sale_type !== "parceria");
  const soma = (arr: typeof vendas, campo: "revenue" | "amount_received") =>
    arr.reduce((s, v) => s + (Number(v[campo]) || 0), 0);

  return {
    midia,
    mql,
    reunioes_agendadas: agendadas,
    /** Das agendadas, as que o TIME marcou. É esta que mede o Miguel. */
    reunioes_agendadas_time: agendadasTime,
    /** Das agendadas, as que o próprio lead marcou em /agendar. */
    reunioes_agendadas_auto: agendadasAuto,
    reunioes_realizadas: realizadas,
    contratos_assessoria: ass.length,
    vendas_sprint: spr.length,
    parcerias: par.length,
    tcv_assessoria: soma(ass, "revenue"),
    tcv_sprint: soma(spr, "revenue"),
    tcv_total: soma(vendas, "revenue"),
    caixa: soma(vendas, "amount_received"),
    // Sem os custos fixos, a margem que dá para calcular é a de contribuição
    // parcial: o que entrou menos o que a mídia custou.
    margem_contribuicao: soma(vendas, "amount_received") - midia,
    leads: f.leads.filter((l) => noPeriodo(dataBr(l.created_at))).length,
  };
}

/**
 * Fração do mês que já passou, para o ritmo esperado.
 *
 * Duas frações, porque mídia roda todo dia e o comercial não: `uteis` para o
 * funil, `corridos` para o investimento.
 */
export function progresso(
  month: string,
  hoje: string,
  fracaoHoje = 1,
): { uteis: number; corridos: number } {
  const [y, m] = month.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let uteisTotal = 0, uteisAte = 0, corridosAte = 0;
  for (let i = 1; i <= ultimoDia; i++) {
    const d = `${month}-${String(i).padStart(2, "0")}`;
    // O DIA DE HOJE NÃO ESTÁ INTEIRO. Até 16/09/2026 ele contava como um dia
    // cheio já decorrido: às 9h da manhã o painel comparava 15 dias e meio de
    // realizado com 16 dias de meta, as barras ficavam âmbar a manhã toda e só
    // se acertavam à noite. Era a queixa de "o painel não bate".
    if (ehDiaUtil(d)) {
      uteisTotal++;
      if (d < hoje) uteisAte++;
      else if (d === hoje) uteisAte += fracaoHoje;
    }
    if (d < hoje) corridosAte++;
    else if (d === hoje) corridosAte += fracaoHoje;
  }
  return {
    uteis: uteisTotal ? Math.min(1, uteisAte / uteisTotal) : 0,
    corridos: Math.min(1, corridosAte / ultimoDia),
  };
}

/**
 * Quanto um dia de fim de semana (ou feriado) rende, comparado a um dia útil.
 *
 * 1 significa "roda igual"; 0,25 significa "rende um quarto". Ver a medição no
 * cabeçalho deste arquivo. Nenhuma linha usa zero: zero produzia meta zero num
 * sábado em que MQL entra, e percentual dividido por zero na tela.
 */
export const LINHAS: Array<{
  chave: keyof ReturnType<typeof realizado>;
  rotulo: string;
  formato: "moeda" | "numero";
  dono: string;
  pesoFimDeSemana: number;
}> = [
  // Tráfego não dorme: o anúncio entrega sábado, domingo e feriado igual.
  { chave: "midia", rotulo: "Investimento em tráfego", formato: "moeda", dono: "Rodger", pesoFimDeSemana: 1 },
  // Medido MAIOR no fim de semana (1,82 contra 1,65). Mantido em 1 por
  // conservadorismo: subir acima disso exigiria uma amostra maior que 204.
  { chave: "mql", rotulo: "MQL", formato: "numero", dono: "Rodger", pesoFimDeSemana: 1 },
  // O REALIZADO desta linha é `reunioes_agendadas_time`, não o total: a call
  // que o próprio lead marcou em /agendar não é trabalho do SDR. A troca é
  // feita em index.ts (REALIZADO_SO_DO_TIME), que devolve total e automático ao
  // lado para a tela mostrar os três. A meta cadastrada continua sendo a desta
  // chave.
  { chave: "reunioes_agendadas", rotulo: "Reuniões agendadas (pelo time)", formato: "numero", dono: "Miguel", pesoFimDeSemana: 0.5 },
  { chave: "reunioes_realizadas", rotulo: "Reuniões realizadas", formato: "numero", dono: "Miguel", pesoFimDeSemana: 0.75 },
  { chave: "contratos_assessoria", rotulo: "Contratos de assessoria", formato: "numero", dono: "Caio", pesoFimDeSemana: 0.25 },
  { chave: "vendas_sprint", rotulo: "Vendas de Sprint", formato: "numero", dono: "Miguel", pesoFimDeSemana: 0.25 },
  { chave: "tcv_assessoria", rotulo: "TCV assessoria", formato: "moeda", dono: "Caio", pesoFimDeSemana: 0.25 },
  { chave: "tcv_sprint", rotulo: "TCV Sprint", formato: "moeda", dono: "Miguel", pesoFimDeSemana: 0.25 },
  { chave: "tcv_total", rotulo: "TCV total", formato: "moeda", dono: "—", pesoFimDeSemana: 0.25 },
  { chave: "caixa", rotulo: "Caixa recebido", formato: "moeda", dono: "Gustavo", pesoFimDeSemana: 0.25 },
  // Caixa menos mídia: puxa dos dois lados, então fica no meio.
  { chave: "margem_contribuicao", rotulo: "Margem de contribuição", formato: "moeda", dono: "Gustavo", pesoFimDeSemana: 0.5 },
];

/** O peso de UM dia para uma linha. Feriado pesa como fim de semana. */
export function pesoDoDia(d: string, pesoFimDeSemana: number): number {
  return ehDiaUtil(d) ? 1 : pesoFimDeSemana;
}

/** Soma dos pesos de um intervalo de datas (inclusive nas duas pontas). */
export function pesoDoIntervalo(de: string, ate: string, pesoFimDeSemana: number): number {
  let total = 0;
  let d = de;
  for (let i = 0; i < 400 && d <= ate; i++) {
    total += pesoDoDia(d, pesoFimDeSemana);
    d = somaDias(d, 1);
  }
  return total;
}

/**
 * A meta acumulada do primeiro dia do mês até `ate`, inclusive.
 *
 * ── Por que acumulada, e não "meta do dia × dias" ────────────────────────────
 * Contar coisa não tem meia unidade. Não existe 28,8 MQL nem 0,8 reunião, e o
 * time olhava para números quebrados que não davam para perseguir.
 *
 * Arredondar cada período isolado não resolve: cinco dias de 7,19 arredondados
 * viram 7+7+7+7+7 = 35, mas a semana vale 36, e as partes param de somar o
 * todo. Aí a soma das semanas não fecha o mês e alguém perde uma tarde
 * conferindo.
 *
 * A saída é arredondar o ACUMULADO. A meta de um intervalo é
 * `acumulado(fim) − acumulado(início−1)`, e como os dois lados já são inteiros,
 * a diferença é inteira também. A soma de qualquer fatiamento fecha o mês
 * exatamente, sempre. O preço é que um dia recebe 7 e o outro 8 — que é
 * exatamente o que o Rodger disse não ser problema.
 */
export function metaAcumuladaAte(
  month: string,
  ate: string,
  alvo: number,
  pesoFds: number,
  inteiro: boolean,
): number {
  const primeiro = `${month}-01`;
  if (ate < primeiro) return 0;
  const total = pesoDoMes(month, pesoFds);
  if (total <= 0) return 0;
  const [y, m] = month.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ultimo = `${month}-${String(ultimoDia).padStart(2, "0")}`;
  const limite = ate > ultimo ? ultimo : ate;
  const exato = alvo * (pesoDoIntervalo(primeiro, limite, pesoFds) / total);
  return inteiro ? Math.round(exato) : exato;
}

/**
 * Que fração do dia civil brasileiro já passou. 0 à meia-noite, 1 às 23h59.
 *
 * Existe para o "esperado até hoje" não cobrar o dia inteiro às 9 da manhã.
 */
export function fracaoDoDiaBr(agoraMs: number = Date.now()): number {
  const desdeMeiaNoite = (agoraMs - FUSO_BR_MS) % 86400000;
  return Math.min(1, Math.max(0, desdeMeiaNoite / 86400000));
}

/**
 * A meta que já deveria estar cumprida NESTE INSTANTE.
 *
 * Igual a `metaAcumuladaAte`, mas o último dia entra rateado pela hora. Só faz
 * sentido no mês corrente: num mês fechado `fracaoHoje` é 1 e as duas contas
 * coincidem.
 */
export function metaEsperadaAgora(
  month: string,
  ate: string,
  alvo: number,
  pesoFds: number,
  inteiro: boolean,
  fracaoHoje = 1,
): number {
  if (fracaoHoje >= 1) return metaAcumuladaAte(month, ate, alvo, pesoFds, inteiro);
  const primeiro = `${month}-01`;
  if (ate < primeiro) return 0;
  const total = pesoDoMes(month, pesoFds);
  if (total <= 0) return 0;
  const [y, m] = month.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ultimo = `${month}-${String(ultimoDia).padStart(2, "0")}`;
  const limite = ate > ultimo ? ultimo : ate;
  const ontem = somaDias(limite, -1);
  const ateOntem = ontem < primeiro ? 0 : pesoDoIntervalo(primeiro, ontem, pesoFds);
  const exato = alvo * ((ateOntem + pesoDoDia(limite, pesoFds) * fracaoHoje) / total);
  return inteiro ? Math.round(exato) : exato;
}

/** A meta de um intervalo DENTRO de um mês, já inteira quando a linha é contável. */
export function metaNoIntervaloDoMes(
  month: string,
  de: string,
  ate: string,
  alvo: number,
  pesoFds: number,
  inteiro: boolean,
): number {
  const anterior = somaDias(de, -1);
  return (
    metaAcumuladaAte(month, ate, alvo, pesoFds, inteiro) -
    metaAcumuladaAte(month, anterior, alvo, pesoFds, inteiro)
  );
}

/** Soma dos pesos do mês inteiro, que é o denominador do rateio. */
export function pesoDoMes(month: string, pesoFimDeSemana: number): number {
  const [y, m] = month.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return pesoDoIntervalo(`${month}-01`, `${month}-${String(ultimoDia).padStart(2, "0")}`, pesoFimDeSemana);
}

/** Nome da coluna de meta correspondente a cada linha. */
export const COLUNA_META: Record<string, string> = {
  midia: "midia",
  mql: "mql",
  reunioes_agendadas: "reunioes_agendadas",
  reunioes_realizadas: "reunioes_realizadas",
  contratos_assessoria: "contratos_assessoria",
  vendas_sprint: "vendas_sprint",
  tcv_assessoria: "tcv_assessoria",
  tcv_sprint: "tcv_sprint",
  tcv_total: "tcv_total",
  caixa: "caixa",
  margem_contribuicao: "margem_contribuicao",
};

// ─────────────────────────────────────────────────────────────────────────────
// A meta de um INTERVALO qualquer
//
// Até 03/09/2026 a meta só existia em dois tamanhos: o mês inteiro e a semana de
// venda. Ela morava numa aba própria, longe dos KPIs, e comparar "12 MQL no
// filtro que estou olhando" com "151 no mês" não respondia nada.
//
// Agora qualquer recorte da tela tem meta. O rateio é o MESMO das semanas, e
// isso não é detalhe: setembro tem semanas de 3, 4 e 5 dias úteis e um feriado
// no dia 7. Dividir a meta por dias iguais faria o time parecer atrasado na
// primeira semana e folgado na última, sem nada ter mudado.
//
// Mídia continua sendo a exceção, rateada por dias CORRIDOS: o tráfego roda
// sábado e domingo. Todo o resto segue o calendário comercial.
//
// Intervalo que atravessa meses soma a fatia de cada mês com a meta DAQUELE
// mês. Um filtro de 25/08 a 05/09 pega o fim de uma meta e o começo de outra, e
// tratar isso como um mês só devolveria um número que não existe em lugar
// nenhum.
// ─────────────────────────────────────────────────────────────────────────────

/** Contagem informativa do recorte: peso e número de dias dentro do mês. */
function fatiaDoMes(month: string, de: string, ate: string, pesoFds: number) {
  const [y, m] = month.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const primeiro = `${month}-01`;
  const ultimo = `${month}-${String(ultimoDia).padStart(2, "0")}`;
  const recorteDe = de > primeiro ? de : primeiro;
  const recorteAte = ate < ultimo ? ate : ultimo;
  if (recorteAte < recorteDe) return { noMes: pesoDoMes(month, pesoFds), noRange: 0, dias: 0 };
  let dias = 0;
  let d = recorteDe;
  for (let i = 0; i < 40 && d <= recorteAte; i++) { dias++; d = somaDias(d, 1); }
  return {
    noMes: pesoDoMes(month, pesoFds),
    noRange: pesoDoIntervalo(recorteDe, recorteAte, pesoFds),
    dias,
  };
}

/** Os meses (YYYY-MM) tocados por um intervalo. */
export function mesesDoIntervalo(de: string, ate: string): string[] {
  const meses: string[] = [];
  let atual = de.slice(0, 7);
  const fim = ate.slice(0, 7);
  // Guarda de sanidade: intervalo invertido ou absurdo não vira laço infinito.
  for (let i = 0; i < 120 && atual <= fim; i++) {
    meses.push(atual);
    const [y, m] = atual.split("-").map(Number);
    const prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    atual = prox;
  }
  return meses;
}

export interface MetaDoPeriodo {
  de: string;
  ate: string;
  dias_uteis: number;
  dias_corridos: number;
  /** Algum mês tocado tem meta cadastrada. */
  tem_meta: boolean;
  /** Meses sem meta cadastrada dentro do intervalo. */
  meses_sem_meta: string[];
  /** Meta rateada, por chave de LINHAS. Ausente quando o mês não tem meta. */
  metas: Record<string, number | null>;
}

/**
 * A meta proporcional ao intervalo.
 *
 * `metasPorMes` é o que está em `commercial_goals`, indexado por YYYY-MM. Mês
 * sem meta cadastrada não vira zero: vira `null`. Zero é uma meta de zero, que
 * o painel exibiria como 100% batida sempre — o oposto do que se quer dizer.
 */
export function metaDoIntervalo(
  metasPorMes: Record<string, Record<string, number | null> | undefined>,
  de: string,
  ate: string,
): MetaDoPeriodo {
  const meses = mesesDoIntervalo(de, ate);
  const metas: Record<string, number | null> = {};
  const semMeta: string[] = [];
  let uteis = 0, corridos = 0;

  for (const linha of LINHAS) metas[linha.chave] = null;

  for (const mes of meses) {
    // Contagem informativa do recorte, para a tela dizer o tamanho da janela.
    const contagem = fatiaDoMes(mes, de, ate, 0);
    uteis += contagem.noRange;
    corridos += contagem.dias;

    const metaDoMes = metasPorMes[mes];
    if (!metaDoMes) {
      if (contagem.dias > 0) semMeta.push(mes);
      continue;
    }

    for (const linha of LINHAS) {
      const alvo = metaDoMes[COLUNA_META[linha.chave] ?? linha.chave];
      if (alvo === null || alvo === undefined) continue;
      // Cada linha tem o SEU denominador: mídia divide por 30 dias de peso 1,
      // venda divide por 21 dias úteis mais 9 fins de semana valendo um quarto.
      // Um denominador só para todas voltaria a dizer que sábado é zero.
      //
      // Contável sai inteiro; dinheiro fica exato e quem formata arredonda.
      // Meta de coisa contável sobe para o inteiro seguinte ANTES de ratear.
      // Não existe meia venda, e 10,5 contratos é alvo que ninguém persegue.
      // Arredondar para cima e só depois dividir mantém a soma dos dias
      // fechando o mês; arredondar dia a dia jogaria o resto todo no começo.
      const contavel = linha.formato === "numero";
      const base = contavel ? Math.ceil(Number(alvo)) : Number(alvo);
      metas[linha.chave] = (metas[linha.chave] ?? 0) + metaNoIntervaloDoMes(
        mes, de, ate, base, linha.pesoFimDeSemana, contavel,
      );
    }
  }

  return {
    de,
    ate,
    dias_uteis: uteis,
    dias_corridos: corridos,
    tem_meta: Object.values(metas).some((v) => v !== null),
    meses_sem_meta: semMeta,
    metas,
  };
}
