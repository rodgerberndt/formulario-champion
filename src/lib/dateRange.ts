import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export enum DatePreset {
  TODAY = "today",
  YESTERDAY = "yesterday",
  TODAY_YESTERDAY = "today_yesterday",
  LAST_7_DAYS = "last_7",
  LAST_14_DAYS = "last_14",
  LAST_28_DAYS = "last_28",
  LAST_30_DAYS = "last_30",
  THIS_WEEK = "this_week",
  LAST_WEEK = "last_week",
  THIS_MONTH = "this_month",
  LAST_MONTH = "last_month",
  MAXIMUM = "maximum",
  CUSTOM = "custom",
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  [DatePreset.TODAY]: "Hoje",
  [DatePreset.YESTERDAY]: "Ontem",
  [DatePreset.TODAY_YESTERDAY]: "Hoje e ontem",
  [DatePreset.LAST_7_DAYS]: "Últimos 7 dias",
  [DatePreset.LAST_14_DAYS]: "Últimos 14 dias",
  [DatePreset.LAST_28_DAYS]: "Últimos 28 dias",
  [DatePreset.LAST_30_DAYS]: "Últimos 30 dias",
  [DatePreset.THIS_WEEK]: "Esta semana",
  [DatePreset.LAST_WEEK]: "Semana passada",
  [DatePreset.THIS_MONTH]: "Este mês",
  [DatePreset.LAST_MONTH]: "Mês passado",
  [DatePreset.MAXIMUM]: "Máximo",
  [DatePreset.CUSTOM]: "Personalizado",
};

export interface DateRange {
  start: Date;
  end: Date;
}

// ============ Date Helpers (Local Timezone) ============

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  result.setDate(result.getDate() - diff);
  return startOfDay(result);
}

export function endOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const result = startOfWeek(date, weekStartsOn);
  result.setDate(result.getDate() + 6);
  return endOfDay(result);
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  return startOfDay(result);
}

export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0);
  return endOfDay(result);
}

export function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function subWeeks(date: Date, weeks: number): Date {
  return subDays(date, weeks * 7);
}

export function subMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
}

// ============ ISO Formatters ============

export function toISO(date: Date): string {
  return date.toISOString();
}

export function toDateOnly(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function toEndExclusive(end: Date): Date {
  const result = new Date(end);
  result.setMilliseconds(result.getMilliseconds() + 1);
  return result;
}

export function formatDisplayDate(date: Date | undefined, fallback = "dd/mm/aaaa"): string {
  if (!date) return fallback;
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

// ============ Range from Preset ============

export function getRangeFromPreset(preset: DatePreset, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);

  switch (preset) {
    case DatePreset.TODAY:
      return { start: today, end: todayEnd };

    case DatePreset.YESTERDAY: {
      const yesterday = subDays(today, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }

    case DatePreset.TODAY_YESTERDAY: {
      const yesterday = subDays(today, 1);
      return { start: startOfDay(yesterday), end: todayEnd };
    }

    case DatePreset.LAST_7_DAYS:
      return { start: startOfDay(subDays(now, 6)), end: todayEnd };

    case DatePreset.LAST_14_DAYS:
      return { start: startOfDay(subDays(now, 13)), end: todayEnd };

    case DatePreset.LAST_28_DAYS:
      return { start: startOfDay(subDays(now, 27)), end: todayEnd };

    case DatePreset.LAST_30_DAYS:
      return { start: startOfDay(subDays(now, 29)), end: todayEnd };

    case DatePreset.THIS_WEEK:
      return { start: startOfWeek(now, 1), end: todayEnd };

    case DatePreset.LAST_WEEK: {
      const lastWeek = subWeeks(now, 1);
      return { start: startOfWeek(lastWeek, 1), end: endOfWeek(lastWeek, 1) };
    }

    case DatePreset.THIS_MONTH:
      return { start: startOfMonth(now), end: todayEnd };

    case DatePreset.LAST_MONTH: {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }

    case DatePreset.MAXIMUM:
      // Earliest possible date (can be refined with actual data)
      return { start: new Date(2020, 0, 1), end: todayEnd };

    case DatePreset.CUSTOM:
    default:
      // Default to last 7 days for custom until set
      return { start: startOfDay(subDays(now, 6)), end: todayEnd };
  }
}

// ============ Validation ============

export function validateRange(start: Date, end: Date): DateRange {
  // If end is before start, swap them
  if (end < start) {
    return { start: end, end: start };
  }
  return { start, end };
}

// ============ URL Serialization ============

export function serializeRangeToURL(preset: DatePreset, start: Date, end: Date): URLSearchParams {
  const params = new URLSearchParams();
  params.set("range", preset);
  if (preset === DatePreset.CUSTOM) {
    params.set("from", toDateOnly(start));
    params.set("to", toDateOnly(end));
  }
  return params;
}

export function parseRangeFromURL(searchParams: URLSearchParams): { preset: DatePreset; start?: Date; end?: Date } | null {
  const rangeParam = searchParams.get("range");
  if (!rangeParam) return null;

  // Validate preset
  const validPresets = Object.values(DatePreset);
  if (!validPresets.includes(rangeParam as DatePreset)) return null;

  const preset = rangeParam as DatePreset;

  if (preset === DatePreset.CUSTOM) {
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    if (fromStr && toStr) {
      const start = new Date(fromStr + "T00:00:00");
      const end = new Date(toStr + "T23:59:59.999");
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { preset, start, end };
      }
    }
    return null;
  }

  return { preset };
}

// ============ LocalStorage Serialization ============

const STORAGE_KEY = "champion_date_range";

interface StoredRange {
  preset: DatePreset;
  start?: string;
  end?: string;
}

export function saveRangeToStorage(preset: DatePreset, start: Date, end: Date): void {
  try {
    const data: StoredRange = { preset };
    if (preset === DatePreset.CUSTOM) {
      data.start = toDateOnly(start);
      data.end = toDateOnly(end);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Error saving date range to storage:", e);
  }
}

export function loadRangeFromStorage(): { preset: DatePreset; start?: Date; end?: Date } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: StoredRange = JSON.parse(stored);
    const validPresets = Object.values(DatePreset);
    if (!validPresets.includes(data.preset)) return null;

    if (data.preset === DatePreset.CUSTOM && data.start && data.end) {
      const start = new Date(data.start + "T00:00:00");
      const end = new Date(data.end + "T23:59:59.999");
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { preset: data.preset, start, end };
      }
      return null;
    }

    return { preset: data.preset };
  } catch (e) {
    console.error("Error loading date range from storage:", e);
    return null;
  }
}
