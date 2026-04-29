// queries.ts — leituras do /admin (NÃO altera dados).
import { getServiceClient } from "./logger.ts";

export interface DateWindow {
  startISO: string | null;
  endISO: string | null;
}

function applyWindow<T extends { gte: (col: string, v: string) => T; lt: (col: string, v: string) => T }>(q: T, col: string, w: DateWindow): T {
  if (w.startISO) q = q.gte(col, w.startISO);
  if (w.endISO) q = q.lt(col, w.endISO);
  return q;
}

export async function listLeads(w: DateWindow, limit = 200) {
  const sb = getServiceClient();
  let q = sb.from("leads").select("*").order("created_at", { ascending: false }).limit(Math.min(limit, 500));
  q = applyWindow(q, "created_at", w);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listSessions(w: DateWindow, limit = 200) {
  const sb = getServiceClient();
  let q = sb.from("lead_sessions").select("*").order("created_at", { ascending: false }).limit(Math.min(limit, 500));
  q = applyWindow(q, "created_at", w);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listMeetings(w: DateWindow, limit = 200) {
  const sb = getServiceClient();
  let q = sb.from("meetings").select("*").order("created_at", { ascending: false }).limit(Math.min(limit, 500));
  q = applyWindow(q, "created_at", w);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listManualSales(w: DateWindow, limit = 200) {
  const sb = getServiceClient();
  let q = sb.from("manual_sales").select("*").order("sale_date", { ascending: false }).limit(Math.min(limit, 500));
  // sale_date é date — comparar pelo prefixo YYYY-MM-DD
  if (w.startISO) q = q.gte("sale_date", w.startISO.slice(0, 10));
  if (w.endISO) q = q.lte("sale_date", w.endISO.slice(0, 10));
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listDailyReports(w: DateWindow, limit = 200) {
  const sb = getServiceClient();
  let q = sb.from("daily_reports").select("*").order("report_date", { ascending: false }).limit(Math.min(limit, 500));
  if (w.startISO) q = q.gte("report_date", w.startISO.slice(0, 10));
  if (w.endISO) q = q.lte("report_date", w.endISO.slice(0, 10));
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listAdSpend(w: DateWindow, limit = 500) {
  const sb = getServiceClient();
  let q = sb.from("ad_spend").select("*").order("date", { ascending: false }).limit(Math.min(limit, 1000));
  if (w.startISO) q = q.gte("date", w.startISO.slice(0, 10));
  if (w.endISO) q = q.lte("date", w.endISO.slice(0, 10));
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listKommoLogs(w: DateWindow, limit = 200) {
  const sb = getServiceClient();
  let q = sb.from("kommo_webhook_logs").select("*").order("created_at", { ascending: false }).limit(Math.min(limit, 500));
  q = applyWindow(q, "created_at", w);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function summary(w: DateWindow) {
  const sb = getServiceClient();
  const [leads, sessions, meetings, sales] = await Promise.all([
    sb.from("leads").select("*", { count: "exact", head: true }).then((r) => r.count ?? 0),
    sb.from("lead_sessions").select("*", { count: "exact", head: true }).then((r) => r.count ?? 0),
    sb.from("meetings").select("*", { count: "exact", head: true }).then((r) => r.count ?? 0),
    sb.from("manual_sales").select("revenue").then((r) => (r.data || []).reduce((s, x: any) => s + Number(x.revenue || 0), 0)),
  ]);
  return {
    totals_all_time: { leads, sessions, meetings, total_revenue: sales },
    window: w,
  };
}
