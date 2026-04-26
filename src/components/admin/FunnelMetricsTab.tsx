import { Card, CardContent } from "@/components/ui/card";
import WeeklyAnalysisSection from "./WeeklyAnalysisSection";
import LandingBehaviorSection from "./LandingBehaviorSection";
import { AnimatedNumber } from "./AnimatedNumber";

interface FunnelMetricsInput {
  visitors: number;
  sessions: number;
  entered_quiz: number;
  completed: number;
  conversion_rate: number;
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

interface FunnelMetricsTabProps {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<any>;
  funnelMetrics?: FunnelMetricsInput | null;
}

export default function FunnelMetricsTab({ fetchAdminData, funnelMetrics }: FunnelMetricsTabProps) {
  return (
    <div className="space-y-6">
      {/* Funnel Overview (espelha topo do dashboard) */}
      {funnelMetrics && (() => {
        const { visitors, sessions, entered_quiz, completed, conversion_rate } = funnelMetrics;
        const visitorToQuiz = visitors > 0 ? (entered_quiz / visitors) * 100 : 0;
        const quizToCompleted = entered_quiz > 0 ? (completed / entered_quiz) * 100 : 0;
        return (
          <Card className="border-primary/30">
            <CardContent className="pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b border-border/50 pb-2">
                Funil do Site (período selecionado)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Visitantes únicos</p>
                  <p className="text-xl font-bold">{visitors}</p>
                  {sessions > visitors && (
                    <p className="text-[10px] text-muted-foreground/70">{sessions} sessões</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entraram no quiz</p>
                  <p className="text-xl font-bold text-blue-400">{entered_quiz}</p>
                  <p className="text-[10px]">
                    <span className="text-blue-400 font-semibold">{visitorToQuiz.toFixed(1)}%</span>
                    <span className="text-muted-foreground/70"> conv. · perda {(100 - visitorToQuiz).toFixed(1)}%</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Concluíram</p>
                  <p className="text-xl font-bold text-green-400">{completed}</p>
                  <p className="text-[10px]">
                    <span className="text-green-400 font-semibold">{quizToCompleted.toFixed(1)}%</span>
                    <span className="text-muted-foreground/70"> conv. · perda {(100 - quizToCompleted).toFixed(1)}%</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Taxa de conversão</p>
                  <p className="text-xl font-bold text-cyan-300">{conversion_rate}%</p>
                  <p className="text-[10px] text-muted-foreground/70">Visitantes → Concluíram</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Análise Semanal — performance por dia da semana */}
      <WeeklyAnalysisSection fetchAdminData={fetchAdminData} />

      {/* Funil do Quiz — drop-off etapa por etapa (apenas quiz v2) */}
      {funnelMetrics && funnelMetrics.quiz_v2_empty && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Funil do Quiz — drop-off por etapa (período selecionado)
              </p>
            </div>
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Sem dados do quiz novo para este período.
              </p>
              {funnelMetrics.quiz_v1_present && (
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                  Este período contém apenas o quiz antigo (v1), que foi descontinuado e não é exibido aqui.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {funnelMetrics && !funnelMetrics.quiz_v2_empty && funnelMetrics.step_funnel && funnelMetrics.step_funnel.length > 0 && (() => {
        const STEP_LABELS_LOCAL: Record<string, string> = {
          q1_quer_vender: "Quer vender mais?",
          q2_mercado: "Mercado",
          q3_faturamento: "Faturamento mensal",
          q4_nome: "Nome",
          q5_whats: "WhatsApp",
          q6_insta: "Instagram",
          q7_email: "E-mail",
          q8_dor: "Dor / Desejo",
          q1_nome: "Nome",
          q2_whats: "WhatsApp",
          q3_insta: "Instagram",
          q4_email: "E-mail",
          q5_mercado: "Mercado",
          q5_estagio: "Estágio do negócio",
          q6_faturamento: "Faturamento mensal",
          q6_investimento: "Faturamento mensal",
          q7_dor: "Dor / Desejo",
        };

        const steps = funnelMetrics.step_funnel!;
        const groupedFlows = steps.reduce<Array<{ flowId: string; flowIndex: number; steps: typeof steps; started: number; completed: number }>>((acc, step) => {
          const flowId = step.flow || `flow_${acc.length + 1}`;
          const existing = acc.find((item) => item.flowId === flowId);
          if (existing) {
            existing.steps.push(step);
            existing.started = Math.max(existing.started, step.flow_started ?? 0);
            existing.completed = Math.max(existing.completed, step.flow_completed ?? 0);
            return acc;
          }
          acc.push({
            flowId,
            flowIndex: step.flow_index ?? acc.length,
            steps: [step],
            started: step.flow_started ?? 0,
            completed: step.flow_completed ?? 0,
          });
          return acc;
        }, []).sort((a, b) => a.flowIndex - b.flowIndex);

        const allStages = groupedFlows.flatMap((flow, flowIdx) => {
          const numberedSteps = flow.steps.map((step, stepIdx) => ({
            ...step,
            _num: stepIdx + 1,
            _label: STEP_LABELS_LOCAL[step.step_id] || step.step_id,
          }));

          const stages = [
            {
              key: `${flow.flowId}_entered`,
              label: groupedFlows.length > 1 ? `Entrou no quiz · fluxo ${flowIdx + 1}` : "Entrou no quiz",
              count: Math.max(flow.started, numberedSteps[0]?.count || 0),
              text: "text-cyan-300",
              kind: "entered" as const,
              flowId: flow.flowId,
            },
            ...numberedSteps.map((step, idx) => ({
              key: `${flow.flowId}_${step.step_id}_${idx}`,
              label: `${step._num}. ${step._label}`,
              count: step.count,
              text: idx % 2 === 0 ? "text-purple-300" : "text-violet-300",
              kind: "step" as const,
              flowId: flow.flowId,
            })),
            {
              key: `${flow.flowId}_completed`,
              label: groupedFlows.length > 1 ? `Concluiu · fluxo ${flowIdx + 1}` : "Concluiu o quiz",
              count: flow.completed,
              text: "text-emerald-300",
              kind: "completed" as const,
              flowId: flow.flowId,
            },
          ];
          return stages;
        });

        const topStages = allStages.filter((stage) => stage.kind === "entered");
        const finalStages = allStages.filter((stage) => stage.kind === "completed");
        const enteredQuiz = topStages.reduce((sum, stage) => sum + stage.count, 0);
        const completed = finalStages.reduce((sum, stage) => sum + stage.count, 0);
        const baseForWidth = Math.max(...topStages.map((stage) => stage.count), 1);
        const totalLoss = enteredQuiz > 0 ? ((enteredQuiz - completed) / enteredQuiz) * 100 : 0;

        let biggestDropIdx = -1;
        let biggestDropPct = 0;
        for (let i = 1; i < allStages.length; i++) {
          if (allStages[i - 1].flowId !== allStages[i].flowId) continue;
          const prev = allStages[i - 1].count;
          const curr = allStages[i].count;
          if (prev > 0) {
            const lossPct = ((prev - curr) / prev) * 100;
            if (lossPct > biggestDropPct) {
              biggestDropPct = lossPct;
              biggestDropIdx = i;
            }
          }
        }

        const stageColors = allStages.map((_, i) => {
          if (allStages[i].kind === "entered") return { stroke: "stroke-cyan-400", fill: "fill-cyan-500/15", text: "text-cyan-300", hex: "rgb(34 211 238)" };
          if (allStages[i].kind === "completed") return { stroke: "stroke-emerald-400", fill: "fill-emerald-500/15", text: "text-emerald-300", hex: "rgb(52 211 153)" };
          return { stroke: "stroke-violet-400", fill: "fill-violet-500/15", text: "text-violet-300", hex: "rgb(167 139 250)" };
        });

        const N = allStages.length;
        const minW = 42;
        const maxW = 100;
        const widths = allStages.map((s) => {
          const raw = (s.count / baseForWidth) * 100;
          return Math.max(minW, Math.min(maxW, raw));
        });
        for (let i = 1; i < widths.length; i++) {
          if (allStages[i - 1].flowId !== allStages[i].flowId) continue;
          if (widths[i] > widths[i - 1]) widths[i] = widths[i - 1];
        }

        const ROW_H = 60;

        return (
          <Card className="border-primary/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Funil do Quiz — drop-off por etapa (período selecionado)
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Perda total: <AnimatedNumber value={totalLoss} decimals={1} suffix="%" className="text-red-400 font-semibold" />
                </p>
              </div>
              {funnelMetrics.quiz_v1_present && (
                <p className="text-[10px] text-amber-300/90 mb-3 -mt-2">
                  Parte do período contém quiz antigo (v1) e foi ignorada no funil.
                </p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
                <div className="flex flex-col items-stretch">
                  {allStages.map((stage, idx) => {
                    const top = widths[idx];
                    const bottom = idx < N - 1 ? widths[idx + 1] : Math.max(minW * 0.7, top * 0.75);
                    const c = stageColors[idx];
                    const isBottleneck = idx === biggestDropIdx;
                    const leftTop = (100 - top) / 2;
                    const rightTop = leftTop + top;
                    const leftBot = (100 - bottom) / 2;
                    const rightBot = leftBot + bottom;
                    return (
                      <div key={stage.key} className="relative w-full" style={{ height: ROW_H }}>
                        <svg
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          className="absolute inset-0 w-full h-full"
                        >
                          <polygon
                            points={`${leftTop},0 ${rightTop},0 ${rightBot},100 ${leftBot},100`}
                            className={`${c.fill} ${c.stroke}`}
                            strokeWidth={isBottleneck ? 2.5 : 1.5}
                            stroke={isBottleneck ? "rgb(248 113 113)" : "currentColor"}
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                        <div className="relative h-full flex items-center justify-center px-3 gap-2">
                          <span className="text-[11px] sm:text-xs font-semibold text-foreground/95 uppercase tracking-wider text-center leading-tight">
                            {stage.label}
                          </span>
                          <span className={`text-sm font-bold ${c.text} drop-shadow shrink-0`}>
                            <AnimatedNumber value={stage.count} />
                          </span>
                          {isBottleneck && (
                            <span className="text-[9px] text-red-300 font-bold whitespace-nowrap shrink-0">⚠</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-0">
                  {allStages.map((stage, idx) => {
                    const prev = idx > 0 ? allStages[idx - 1] : null;
                    const sameFlowAsPrev = prev?.flowId === stage.flowId;
                    const prevCount = sameFlowAsPrev ? prev?.count ?? null : null;
                    const conv = prevCount && prevCount > 0
                      ? (stage.count / prevCount) * 100
                      : null;
                    const loss = conv !== null ? 100 - conv : null;
                    const lossAbs = prevCount !== null ? Math.max(0, prevCount - stage.count) : 0;
                    const c = stageColors[idx];
                    const isBottleneck = idx === biggestDropIdx && loss !== null && loss >= 20;
                    return (
                      <div
                        key={stage.key}
                        className="flex items-center gap-2"
                        style={{ height: ROW_H }}
                      >
                        <div className="w-6 shrink-0 flex items-center">
                          <div className={`h-px w-full ${isBottleneck ? "bg-red-500/50" : "bg-border/60"}`} />
                        </div>
                        <div className={`flex-1 rounded-md px-3 py-2 bg-muted/30 border ${isBottleneck ? "border-red-500/60" : "border-border/40"}`}>
                          {conv !== null ? (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight truncate">
                                {prev?.label} → {stage.label}
                              </p>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-bold leading-none ${c.text}`}>
                                  <AnimatedNumber value={conv} decimals={1} suffix="%" />
                                </p>
                                <p className={`text-[10px] mt-0.5 ${loss! >= 20 ? "text-red-400" : "text-muted-foreground/70"}`}>
                                  perda <AnimatedNumber value={loss!} decimals={1} suffix="%" /> (-<AnimatedNumber value={lossAbs} />)
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Topo do funil</p>
                              <p className="text-sm font-bold text-cyan-300">100%</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entrada</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Etapas do quiz</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Conclusão</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Comportamento na Landing Page — funil por seção, scroll, cliques */}
      <LandingBehaviorSection fetchAdminData={fetchAdminData} />
    </div>
  );
}
