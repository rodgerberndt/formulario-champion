-- ============================================================
-- AI Admin Assistant — Auditoria e Approval Gate
-- NÃO altera MQL, roteamento, Kommo, CAPI ou notify-lead.
-- ============================================================

-- 1) ai_assistant_access_log
CREATE TABLE public.ai_assistant_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  query_params jsonb,
  ip text,
  user_agent text,
  api_key_fingerprint text,
  row_count integer DEFAULT 0,
  latency_ms integer,
  contains_pii boolean DEFAULT false,
  contains_sensitive_free_text boolean DEFAULT false,
  status_code integer
);

CREATE INDEX idx_ai_access_log_created_at ON public.ai_assistant_access_log (created_at DESC);
CREATE INDEX idx_ai_access_log_endpoint ON public.ai_assistant_access_log (endpoint);

ALTER TABLE public.ai_assistant_access_log ENABLE ROW LEVEL SECURITY;

-- Sem políticas para anon/authenticated => bloqueado por padrão.
-- Service role bypassa RLS automaticamente.

-- 2) ai_assistant_proposed_actions
CREATE TABLE public.ai_assistant_proposed_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action_type text NOT NULL,
  target text NOT NULL,
  current_state jsonb,
  proposed_change jsonb NOT NULL,
  expected_impact text,
  risks text,
  rollback_plan text,
  files_or_tables_affected text[],
  requires_manual_execution boolean NOT NULL DEFAULT true,
  is_hard_block boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  approver_id text,
  approver_note text,
  approved_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  proposer_fingerprint text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  CONSTRAINT chk_status CHECK (status IN ('pending','approved','rejected','executed','expired','failed'))
);

CREATE INDEX idx_ai_proposed_status ON public.ai_assistant_proposed_actions (status, created_at DESC);
CREATE INDEX idx_ai_proposed_created ON public.ai_assistant_proposed_actions (created_at DESC);

ALTER TABLE public.ai_assistant_proposed_actions ENABLE ROW LEVEL SECURITY;

-- 3) ai_assistant_action_log
CREATE TABLE public.ai_assistant_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  proposed_action_id uuid REFERENCES public.ai_assistant_proposed_actions(id) ON DELETE SET NULL,
  executor text NOT NULL,
  applied_payload jsonb,
  success boolean NOT NULL,
  error_message text,
  affected_table text,
  affected_row_id text
);

CREATE INDEX idx_ai_action_log_created ON public.ai_assistant_action_log (created_at DESC);
CREATE INDEX idx_ai_action_log_proposed ON public.ai_assistant_action_log (proposed_action_id);

ALTER TABLE public.ai_assistant_action_log ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy para anon/authenticated. Apenas service role acessa.
-- Isto garante que a aba AiProposalsTab no /admin só consegue ler/aprovar
-- via Edge Function autenticada (admin JWT + API key + HMAC).