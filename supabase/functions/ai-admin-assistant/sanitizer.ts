// sanitizer.ts — remoção de chaves sensíveis em qualquer payload retornado.
// Garante que NENHUM secret apareça mesmo em objetos aninhados (Kommo, logs, metadata).

const SENSITIVE_KEY_PATTERNS = [
  "password", "secret", "token", "service_role", "jwt", "vapid",
  "api_key", "apikey", "access_token", "refresh_token", "authorization",
  "private_key", "client_secret", "webhook_secret",
];

const FREE_TEXT_FIELDS = new Set(["dor_desejo", "raw_answers_json", "notes", "observacao", "objecao_principal"]);

function isSensitiveKey(k: string): boolean {
  const lk = k.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lk.includes(p));
}

export interface SanitizeOptions {
  includeRawAnswers?: boolean;
}

export interface SanitizeReport {
  containsSensitiveFreeText: boolean;
  containsPii: boolean;
}

const PII_KEYS = new Set(["whatsapp", "email", "instagram", "nome_completo", "lead_whatsapp", "lead_name", "ip_address"]);

export function sanitize(value: unknown, opts: SanitizeOptions = {}, report: SanitizeReport = { containsSensitiveFreeText: false, containsPii: false }): { value: unknown; report: SanitizeReport } {
  const out = sanitizeRec(value, opts, report);
  return { value: out, report };
}

function sanitizeRec(value: unknown, opts: SanitizeOptions, report: SanitizeReport): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeRec(v, opts, report));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isSensitiveKey(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      if (PII_KEYS.has(k)) report.containsPii = true;
      if (FREE_TEXT_FIELDS.has(k)) {
        report.containsSensitiveFreeText = true;
        if (k === "raw_answers_json" && !opts.includeRawAnswers) {
          out[k] = "[OMITTED — set include_raw_answers=true]";
          continue;
        }
      }
      out[k] = sanitizeRec(v, opts, report);
    }
    return out;
  }
  return value;
}
