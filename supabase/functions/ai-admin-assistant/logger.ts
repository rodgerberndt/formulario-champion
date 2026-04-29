// logger.ts — registra acessos no ai_assistant_access_log.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (client) return client;
  client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return client;
}

export interface AccessLogEntry {
  endpoint: string;
  method: string;
  query_params?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  api_key_fingerprint?: string | null;
  row_count?: number;
  latency_ms?: number;
  contains_pii?: boolean;
  contains_sensitive_free_text?: boolean;
  status_code?: number;
}

export async function logAccess(entry: AccessLogEntry): Promise<void> {
  try {
    await getServiceClient().from("ai_assistant_access_log").insert(entry);
  } catch (e) {
    console.error("[ai-admin-assistant] logAccess failed:", (e as Error).message);
  }
}
