// filters.ts — interpretação de datas como calendário America/Sao_Paulo.
// Converte start_date/end_date (YYYY-MM-DD) em janelas UTC reais.

// São Paulo é UTC-3 (sem DST desde 2019).
const SP_OFFSET_HOURS = 3;

export interface DateRangeInterpreted {
  timezone: "America/Sao_Paulo";
  start_date: string | null;
  end_date: string | null;
  interpreted_start_at: string | null;
  interpreted_end_at: string | null;
}

function isoDateRegex(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function interpretDateRange(start?: string | null, end?: string | null): DateRangeInterpreted {
  const result: DateRangeInterpreted = {
    timezone: "America/Sao_Paulo",
    start_date: start || null,
    end_date: end || null,
    interpreted_start_at: null,
    interpreted_end_at: null,
  };

  if (start && isoDateRegex(start)) {
    // 00:00:00 em São Paulo = 03:00:00 UTC
    result.interpreted_start_at = `${start}T${String(SP_OFFSET_HOURS).padStart(2, "0")}:00:00.000Z`;
  }
  if (end && isoDateRegex(end)) {
    // Final do dia em São Paulo (23:59:59.999) = 02:59:59.999 UTC do dia seguinte
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const nextDay = d.toISOString().slice(0, 10);
    result.interpreted_end_at = `${nextDay}T${String(SP_OFFSET_HOURS - 1).padStart(2, "0")}:59:59.999Z`;
  }
  return result;
}
