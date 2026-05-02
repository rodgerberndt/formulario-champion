import { useEffect, useState } from "react";
import { Clock, Timer, CheckCircle2 } from "lucide-react";

/**
 * Shows how long it took to "call" a lead (mark as read).
 * - If `firstOpenedAt` is set: shows the static elapsed time (created → first_opened) in green/yellow/red.
 * - Otherwise: shows a live ticking timer in red, updating every second, indicating the lead is still waiting.
 */

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function colorForElapsed(ms: number, opened: boolean): string {
  const minutes = ms / 60000;
  // Lead já chamado → verde se rápido, amarelo se médio, vermelho se demorou muito
  if (opened) {
    if (minutes <= 5) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    if (minutes <= 30) return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
    if (minutes <= 120) return "text-orange-400 border-orange-500/40 bg-orange-500/10";
    return "text-red-400 border-red-500/40 bg-red-500/10";
  }
  // Ainda esperando → urgência crescente
  if (minutes <= 5) return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10 animate-pulse";
  if (minutes <= 30) return "text-orange-400 border-orange-500/40 bg-orange-500/10 animate-pulse";
  return "text-red-400 border-red-500/40 bg-red-500/10 animate-pulse";
}

interface ResponseTimerProps {
  createdAt: string;
  firstOpenedAt: string | null | undefined;
  className?: string;
  compact?: boolean;
}

export function ResponseTimer({
  createdAt,
  firstOpenedAt,
  className = "",
  compact = false,
}: ResponseTimerProps) {
  const opened = !!firstOpenedAt;
  const [now, setNow] = useState(() => Date.now());

  // Tick every second only while the lead hasn't been opened yet
  useEffect(() => {
    if (opened) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [opened]);

  // Soft "tick" sound every 5 seconds while waiting (Web Audio, low volume)
  useEffect(() => {
    if (opened) return;
    let ctx: AudioContext | null = null;
    const playTick = () => {
      try {
        if (!ctx) {
          const AC =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
        }
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.04, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(playTick, 5000);
    return () => {
      clearInterval(id);
      try {
        ctx?.close();
      } catch {
        /* ignore */
      }
    };
  }, [opened]);

  const createdTs = new Date(createdAt).getTime();
  const endTs = opened ? new Date(firstOpenedAt!).getTime() : now;
  const elapsed = endTs - createdTs;

  if (!Number.isFinite(createdTs) || !Number.isFinite(endTs)) {
    return null;
  }

  const colorClasses = colorForElapsed(elapsed, opened);
  const Icon = opened ? CheckCircle2 : Timer;
  const label = formatDuration(elapsed);
  const tooltip = opened
    ? `Lead chamado em ${label} após chegar`
    : `Aguardando atendimento há ${label}`;

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none ${colorClasses} ${className}`}
    >
      <Icon className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {label}
    </span>
  );
}
