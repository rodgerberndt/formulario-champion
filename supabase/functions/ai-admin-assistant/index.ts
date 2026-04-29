// ai-admin-assistant — leitura full do /admin + Approval Gate
// NÃO altera MQL, roteamento, Kommo, CAPI ou notify-lead.
import { checkApiKey, verifyHmac, verifyAdminJwt } from "./auth.ts";
import { sanitize } from "./sanitizer.ts";
import { interpretDateRange } from "./filters.ts";
import { logAccess, getServiceClient } from "./logger.ts";
import * as Q from "./queries.ts";
import { createProposal, approveProposal, rejectProposal, executeApprovedAction, isHardBlock } from "./approval.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-signature, x-timestamp, x-admin-token, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // Suporta tanto /functions/v1/ai-admin-assistant/<path> quanto chamada direta
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.findIndex((s) => s === "ai-admin-assistant");
  const subpath = "/" + (idx >= 0 ? segments.slice(idx + 1).join("/") : segments.join("/"));

  const start = Date.now();
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent");

  // 1) API key obrigatória
  const keyCheck = await checkApiKey(req);
  if (!keyCheck.ok) {
    await logAccess({ endpoint: subpath, method: req.method, ip, user_agent: ua, status_code: keyCheck.status ?? 401, latency_ms: Date.now() - start });
    return json({ error: keyCheck.error }, keyCheck.status ?? 401);
  }

  try {
    // ===== Endpoints públicos (somente GET após API key) =====
    if (req.method === "GET") {
      const qs = Object.fromEntries(url.searchParams.entries());
      const dr = interpretDateRange(qs.start_date, qs.end_date);
      const window = { startISO: dr.interpreted_start_at, endISO: dr.interpreted_end_at };
      const includeRaw = qs.include_raw_answers === "true";
      const limit = Math.min(Number(qs.limit) || 200, 500);

      let payload: any;
      let rowCount = 0;

      switch (subpath) {
        case "/":
        case "/health":
          payload = { ok: true, service: "ai-admin-assistant", version: "1.0.0", timezone: "America/Sao_Paulo" };
          break;
        case "/summary":
          payload = await Q.summary(window);
          break;
        case "/leads":
          { const rows = await Q.listLeads(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/sessions":
          { const rows = await Q.listSessions(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/meetings":
          { const rows = await Q.listMeetings(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/manual-sales":
          { const rows = await Q.listManualSales(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/daily-reports":
          { const rows = await Q.listDailyReports(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/ad-spend":
          { const rows = await Q.listAdSpend(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/kommo-logs":
          { const rows = await Q.listKommoLogs(window, limit); rowCount = rows.length; payload = { date_range: dr, count: rows.length, rows }; }
          break;
        case "/proposals": {
          const sb = getServiceClient();
          const status = qs.status || null;
          let q = sb.from("ai_assistant_proposed_actions").select("*").order("created_at", { ascending: false }).limit(limit);
          if (status) q = q.eq("status", status);
          const { data, error } = await q;
          if (error) throw error;
          rowCount = data?.length ?? 0;
          payload = { count: rowCount, rows: data || [] };
          break;
        }
        default:
          await logAccess({ endpoint: subpath, method: req.method, ip, user_agent: ua, api_key_fingerprint: keyCheck.apiKeyFingerprint, status_code: 404, latency_ms: Date.now() - start });
          return json({ error: "Unknown endpoint", path: subpath }, 404);
      }

      const { value, report } = sanitize(payload, { includeRawAnswers: includeRaw });
      const finalBody: any = value;
      if (report.containsSensitiveFreeText) {
        finalBody.warning = "contains_sensitive_free_text=true. raw_answers_json suppressed unless include_raw_answers=true.";
        finalBody.contains_sensitive_free_text = true;
      }
      await logAccess({
        endpoint: subpath, method: "GET", query_params: qs, ip, user_agent: ua,
        api_key_fingerprint: keyCheck.apiKeyFingerprint,
        row_count: rowCount, latency_ms: Date.now() - start,
        contains_pii: report.containsPii, contains_sensitive_free_text: report.containsSensitiveFreeText, status_code: 200,
      });
      return json(finalBody, 200);
    }

    // ===== POST endpoints (HMAC obrigatório) =====
    if (req.method === "POST") {
      const rawBody = await req.text();
      const hmac = await verifyHmac(req, rawBody);
      if (!hmac.ok) {
        await logAccess({ endpoint: subpath, method: "POST", ip, user_agent: ua, api_key_fingerprint: keyCheck.apiKeyFingerprint, status_code: hmac.status ?? 401, latency_ms: Date.now() - start });
        return json({ error: hmac.error }, hmac.status ?? 401);
      }

      let body: any = {};
      try { body = rawBody ? JSON.parse(rawBody) : {}; } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      if (subpath === "/propose-action") {
        const required = ["action_type", "target", "proposed_change"];
        for (const k of required) if (!body[k]) return json({ error: `Missing field: ${k}` }, 400);
        const proposal = await createProposal({ ...body, proposer_fingerprint: keyCheck.apiKeyFingerprint });
        await logAccess({ endpoint: subpath, method: "POST", ip, user_agent: ua, api_key_fingerprint: keyCheck.apiKeyFingerprint, latency_ms: Date.now() - start, status_code: 200 });
        return json({
          ok: true,
          approval_id: proposal.id,
          status: proposal.status,
          requires_manual_execution: proposal.requires_manual_execution,
          is_hard_block: proposal.is_hard_block,
          expires_at: proposal.expires_at,
          message: proposal.is_hard_block
            ? "Hard block — esta ação NÃO pode ser executada automaticamente. Apenas plano gerado."
            : "Soft action — após aprovação humana, pode ser executada via /execute-approved-action.",
          proposal,
        }, 200);
      }

      if (subpath === "/approve-action" || subpath === "/reject-action") {
        const adminToken = req.headers.get("x-admin-token") || "";
        if (!adminToken) return json({ error: "Missing x-admin-token" }, 403);
        const j = await verifyAdminJwt(adminToken);
        if (!j.ok) return json({ error: j.error || "Invalid admin token" }, 403);

        if (!body?.approval_id) return json({ error: "Missing approval_id" }, 400);
        const result = subpath === "/approve-action"
          ? await approveProposal(body.approval_id, j.sub || "admin", body.approver_note)
          : await rejectProposal(body.approval_id, j.sub || "admin", body.approver_note);
        await logAccess({ endpoint: subpath, method: "POST", ip, user_agent: ua, api_key_fingerprint: keyCheck.apiKeyFingerprint, latency_ms: Date.now() - start, status_code: result.ok ? 200 : 400 });
        return json(result, result.ok ? 200 : 400);
      }

      if (subpath === "/execute-approved-action") {
        if (!body?.approval_id) return json({ error: "Missing approval_id" }, 400);
        const result = await executeApprovedAction(body.approval_id, `api_key:${keyCheck.apiKeyFingerprint}`);
        await logAccess({ endpoint: subpath, method: "POST", ip, user_agent: ua, api_key_fingerprint: keyCheck.apiKeyFingerprint, latency_ms: Date.now() - start, status_code: result.status });
        return json({ ok: result.ok, error: result.error }, result.status);
      }

      return json({ error: "Unknown POST endpoint", path: subpath }, 404);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[ai-admin-assistant] error:", e);
    await logAccess({ endpoint: subpath, method: req.method, ip, user_agent: ua, api_key_fingerprint: keyCheck.apiKeyFingerprint, status_code: 500, latency_ms: Date.now() - start });
    return json({ error: (e as Error).message }, 500);
  }
});
