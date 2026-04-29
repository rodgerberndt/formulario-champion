// approval.ts — Approval Gate. Hard blocks NUNCA executam automaticamente.
import { getServiceClient } from "./logger.ts";

// Soft-executable: a Edge Function pode aplicar APÓS aprovação humana.
export const SOFT_EXECUTABLE_ACTIONS = new Set([
  "update_lead_lido",
  "update_lead_sdr_override",
  "insert_manual_sale",
  "update_manual_sale",
  "insert_meeting",
  "update_meeting_attended",
  "insert_daily_report",
  "update_daily_report",
]);

// Hard block: NUNCA executa automaticamente, mesmo aprovado. Apenas gera plano.
export const HARD_BLOCK_KEYWORDS = [
  "code", "layout", "edge_function", "auth", "secret", "migration", "schema",
  "mql", "routing", "kommo_config", "capi_config", "meta_ads_cron", "rls",
];

export function isHardBlock(actionType: string, target: string): boolean {
  const t = `${actionType} ${target}`.toLowerCase();
  return HARD_BLOCK_KEYWORDS.some((k) => t.includes(k)) || !SOFT_EXECUTABLE_ACTIONS.has(actionType);
}

export interface ProposedAction {
  action_type: string;
  target: string;
  current_state?: unknown;
  proposed_change: unknown;
  expected_impact?: string;
  risks?: string;
  rollback_plan?: string;
  files_or_tables_affected?: string[];
  proposer_fingerprint?: string;
}

export async function createProposal(p: ProposedAction) {
  const sb = getServiceClient();
  const hard = isHardBlock(p.action_type, p.target);
  const { data, error } = await sb
    .from("ai_assistant_proposed_actions")
    .insert({
      action_type: p.action_type,
      target: p.target,
      current_state: p.current_state ?? null,
      proposed_change: p.proposed_change,
      expected_impact: p.expected_impact ?? null,
      risks: p.risks ?? null,
      rollback_plan: p.rollback_plan ?? null,
      files_or_tables_affected: p.files_or_tables_affected ?? null,
      requires_manual_execution: hard,
      is_hard_block: hard,
      status: "pending",
      proposer_fingerprint: p.proposer_fingerprint ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveProposal(id: string, approverId: string, note?: string) {
  const sb = getServiceClient();
  const { data: row, error: selErr } = await sb
    .from("ai_assistant_proposed_actions").select("*").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  if (!row) return { ok: false, error: "Proposal not found" };
  if (row.status !== "pending") return { ok: false, error: `Cannot approve: status=${row.status}` };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sb.from("ai_assistant_proposed_actions").update({ status: "expired" }).eq("id", id);
    return { ok: false, error: "Proposal expired" };
  }
  const { data, error } = await sb
    .from("ai_assistant_proposed_actions")
    .update({ status: "approved", approver_id: approverId, approver_note: note ?? null, approved_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw error;
  return { ok: true, data };
}

export async function rejectProposal(id: string, approverId: string, note?: string) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("ai_assistant_proposed_actions")
    .update({ status: "rejected", approver_id: approverId, approver_note: note ?? null, approved_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select().maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "Proposal not found or not pending" };
  return { ok: true, data };
}

export async function executeApprovedAction(id: string, executor: string) {
  const sb = getServiceClient();
  const { data: row, error: selErr } = await sb
    .from("ai_assistant_proposed_actions").select("*").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  if (!row) return { ok: false, status: 404, error: "Proposal not found" };

  if (row.status !== "approved") {
    return { ok: false, status: 400, error: `Cannot execute: status=${row.status}` };
  }
  if (row.is_hard_block || row.requires_manual_execution) {
    return { ok: false, status: 403, error: "Hard block — manual execution required" };
  }
  if (row.approved_at) {
    const ageMs = Date.now() - new Date(row.approved_at).getTime();
    if (ageMs > 60 * 60 * 1000) {
      await sb.from("ai_assistant_proposed_actions").update({ status: "expired" }).eq("id", id);
      return { ok: false, status: 403, error: "Approval expired (>1h)" };
    }
  }
  if (!SOFT_EXECUTABLE_ACTIONS.has(row.action_type)) {
    return { ok: false, status: 403, error: `Action type not soft-executable: ${row.action_type}` };
  }

  // Aplicar mudança
  let exec: { ok: boolean; error?: string; affectedTable?: string; affectedRowId?: string } = { ok: false };
  try {
    exec = await applySoftAction(row.action_type, row.proposed_change);
  } catch (e) {
    exec = { ok: false, error: (e as Error).message };
  }

  await sb.from("ai_assistant_proposed_actions").update({
    status: exec.ok ? "executed" : "failed",
    executed_at: new Date().toISOString(),
    execution_result: exec,
  }).eq("id", id);

  await sb.from("ai_assistant_action_log").insert({
    proposed_action_id: id,
    executor,
    applied_payload: row.proposed_change,
    success: exec.ok,
    error_message: exec.error ?? null,
    affected_table: exec.affectedTable ?? null,
    affected_row_id: exec.affectedRowId ?? null,
  });

  return { ok: exec.ok, status: exec.ok ? 200 : 500, error: exec.error };
}

async function applySoftAction(actionType: string, change: any): Promise<{ ok: boolean; error?: string; affectedTable?: string; affectedRowId?: string }> {
  const sb = getServiceClient();
  switch (actionType) {
    case "update_lead_lido": {
      if (!change?.lead_id || typeof change.lido !== "boolean") return { ok: false, error: "Missing lead_id or lido(boolean)" };
      const { error } = await sb.from("leads").update({ lido: change.lido }).eq("id", change.lead_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "leads", affectedRowId: change.lead_id };
    }
    case "update_lead_sdr_override": {
      if (!change?.lead_id) return { ok: false, error: "Missing lead_id" };
      const { error } = await sb.from("leads").update({ sdr_override: change.sdr_override ?? null }).eq("id", change.lead_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "leads", affectedRowId: change.lead_id };
    }
    case "insert_manual_sale": {
      const { sale_date, revenue, sale_type, lead_id, creative_key, utm_content, notes } = change || {};
      if (!sale_date || revenue == null) return { ok: false, error: "Missing sale_date or revenue" };
      const { data, error } = await sb.from("manual_sales").insert({
        sale_date, revenue, sale_type: sale_type ?? "sprint",
        lead_id: lead_id ?? null, creative_key: creative_key ?? null,
        utm_content: utm_content ?? null, notes: notes ?? null,
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "manual_sales", affectedRowId: data?.id };
    }
    case "update_manual_sale": {
      if (!change?.id) return { ok: false, error: "Missing id" };
      const { id, ...rest } = change;
      const { error } = await sb.from("manual_sales").update(rest).eq("id", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "manual_sales", affectedRowId: id };
    }
    case "insert_meeting": {
      const { lead_id, attended, notes, creative_key, utm_content } = change || {};
      const { data, error } = await sb.from("meetings").insert({
        lead_id: lead_id ?? null, attended: !!attended,
        notes: notes ?? null, creative_key: creative_key ?? null, utm_content: utm_content ?? null,
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "meetings", affectedRowId: data?.id };
    }
    case "update_meeting_attended": {
      if (!change?.id || typeof change.attended !== "boolean") return { ok: false, error: "Missing id or attended(boolean)" };
      const { error } = await sb.from("meetings").update({ attended: change.attended }).eq("id", change.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "meetings", affectedRowId: change.id };
    }
    case "insert_daily_report": {
      if (!change?.report_date || !change?.sdr_name) return { ok: false, error: "Missing report_date or sdr_name" };
      const { data, error } = await sb.from("daily_reports").insert(change).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "daily_reports", affectedRowId: data?.id };
    }
    case "update_daily_report": {
      if (!change?.id) return { ok: false, error: "Missing id" };
      const { id, ...rest } = change;
      const { error } = await sb.from("daily_reports").update(rest).eq("id", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, affectedTable: "daily_reports", affectedRowId: id };
    }
    default:
      return { ok: false, error: `Unsupported action_type: ${actionType}` };
  }
}
