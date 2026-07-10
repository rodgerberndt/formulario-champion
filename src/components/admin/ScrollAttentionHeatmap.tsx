import { Flame } from "lucide-react";

interface AttentionBin {
  bin: number;
  range_pct: [number, number];
  total_time_ms: number;
  avg_time_ms: number;
  users: number;
  pct_of_visitors: number;
}

interface SectionBoundary {
  section_id: string;
  pos_pct: number;
}

interface Props {
  scrollAttention: AttentionBin[];
  sectionBoundaries: SectionBoundary[];
  sectionLabels: Record<string, string>;
  totalVisitors: number;
}

function fmtTime(ms: number) {
  if (!ms || ms < 0) return "0s";
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}m ${sec}s`;
}

const STRIP_HEIGHT = 420;

export default function ScrollAttentionHeatmap({ scrollAttention, sectionBoundaries, sectionLabels, totalVisitors }: Props) {
  if (!scrollAttention || scrollAttention.length === 0 || totalVisitors === 0) {
    return null;
  }

  const maxPct = Math.max(...scrollAttention.map((b) => b.pct_of_visitors), 1);
  const binHeight = STRIP_HEIGHT / scrollAttention.length;

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <Flame className="w-3 h-3" /> Onde os visitantes param pra ler (mapa de calor por scroll)
      </p>
      <p className="text-[10px] text-muted-foreground/70 mb-3">
        Faixas de 5% da página, coloridas por quanto tempo os visitantes ficaram com aquele trecho na tela — não depende de clique, funciona igual pra mouse e toque.
      </p>
      <div className="flex gap-3">
        <div className="relative rounded-md overflow-hidden border border-border/40" style={{ height: STRIP_HEIGHT, width: 56 }}>
          {scrollAttention.map((b) => {
            const intensity = maxPct > 0 ? b.pct_of_visitors / maxPct : 0;
            const bg = `hsl(${(1 - intensity) * 220 + intensity * 38}, 80%, ${20 + intensity * 25}%)`;
            return (
              <div
                key={b.bin}
                className="absolute left-0 right-0 flex items-center justify-center text-[8px] text-foreground/70 border-b border-background/20 last:border-0"
                style={{ top: b.bin * binHeight, height: binHeight, background: bg }}
                title={`${b.range_pct[0]}-${b.range_pct[1]}% da página · ${b.users} visitantes (${b.pct_of_visitors.toFixed(0)}%) · tempo médio ${fmtTime(b.avg_time_ms)}`}
              >
                {b.range_pct[0]}%
              </div>
            );
          })}
        </div>

        <div className="relative flex-1" style={{ height: STRIP_HEIGHT }}>
          {sectionBoundaries.map((s) => {
            const topPx = Math.min(STRIP_HEIGHT - 1, (s.pos_pct / 100) * STRIP_HEIGHT);
            return (
              <div
                key={s.section_id}
                className="absolute left-0 flex items-center gap-1.5 text-[10px] text-muted-foreground"
                style={{ top: topPx }}
              >
                <span className="w-3 h-px bg-border" />
                <span className="truncate">{sectionLabels[s.section_id] || s.section_id}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
