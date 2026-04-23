import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { fetchAdmin } from "@/lib/adminAuth";

const SDRS_TO_CHECK = ["Caio", "Dara"] as const;
const ALERT_START_HOUR = 21; // 21h
const POLL_MS = 60_000; // re-check every minute
const BEEP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DailyReportRow {
  id: string;
  sdr_name: string;
  report_date: string;
}

interface Props {
  enabled: boolean;
}

/**
 * Banner vermelho que avisa quando os relatórios diários (Caio/Dara) não foram
 * preenchidos. Aparece a partir das 9h. Toca um apito a cada 30min enquanto pendente.
 */
export function DailyReportReminder({ enabled }: Props) {
  const [pendingSdrs, setPendingSdrs] = useState<string[]>([]);
  const [dismissedUntil, setDismissedUntil] = useState<number>(0);
  const lastBeepRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const check = async () => {
      const now = new Date();
      if (now.getHours() < ALERT_START_HOUR) {
        if (!cancelled) setPendingSdrs([]);
        return;
      }

      try {
        const today = todayLocalISODate();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/daily-reports?from=${today}&to=${today}`;
        const res = await fetchAdmin(url);
        if (!res.ok) return;
        const rows: DailyReportRow[] = await res.json();
        const filledSdrs = new Set(rows.map((r) => r.sdr_name));
        const pending = SDRS_TO_CHECK.filter((s) => !filledSdrs.has(s));
        if (!cancelled) setPendingSdrs(pending);

        // Beep a cada 30min se há pendência e não foi dispensado
        if (pending.length > 0 && Date.now() > dismissedUntil) {
          const ts = Date.now();
          if (ts - lastBeepRef.current >= BEEP_INTERVAL_MS) {
            lastBeepRef.current = ts;
            try {
              if (!audioRef.current) audioRef.current = new Audio("/newlead.wav");
              audioRef.current.currentTime = 0;
              await audioRef.current.play();
            } catch {
              // Browser bloqueou autoplay — silencioso
            }
          }
        }
      } catch {
        // Silencioso — falha de rede/token tratada em outro lugar
      }
    };

    check();
    const id = window.setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, dismissedUntil]);

  if (!enabled || pendingSdrs.length === 0) return null;
  if (Date.now() < dismissedUntil) return null;

  const list = pendingSdrs.join(" e ");

  return (
    <div className="mb-4 rounded-lg border-2 border-red-500 bg-red-500/10 p-4 shadow-lg shadow-red-500/20 animate-pulse">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-red-400 text-base">
            ⚠️ Relatório diário pendente — {list}
          </p>
          <p className="text-sm text-red-300/90 mt-1">
            {pendingSdrs.length === 1 ? "O SDR" : "Os SDRs"} {list} ainda não preencheu o relatório de hoje. Acesse a aba <strong>Relatórios</strong> para preencher agora.
          </p>
        </div>
        <button
          onClick={() => setDismissedUntil(Date.now() + BEEP_INTERVAL_MS)}
          className="text-red-400/70 hover:text-red-300 transition-colors flex-shrink-0"
          title="Silenciar por 30 minutos"
          aria-label="Silenciar alerta por 30 minutos"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}