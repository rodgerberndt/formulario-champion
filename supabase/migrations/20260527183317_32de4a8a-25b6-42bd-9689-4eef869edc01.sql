
-- 1) ad_spend: restrict "ALL" policy to service_role
DROP POLICY IF EXISTS "Service role full access on ad_spend" ON public.ad_spend;
CREATE POLICY "Service role full access on ad_spend"
  ON public.ad_spend FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) landing_hits: restrict "ALL" policy to service_role (anon INSERT policy stays)
DROP POLICY IF EXISTS "Service role full access on landing_hits" ON public.landing_hits;
CREATE POLICY "Service role full access on landing_hits"
  ON public.landing_hits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) manual_sales: restrict to service_role
DROP POLICY IF EXISTS "Service role full access on manual_sales" ON public.manual_sales;
CREATE POLICY "Service role full access on manual_sales"
  ON public.manual_sales FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) meetings: restrict to service_role
DROP POLICY IF EXISTS "Service role full access on meetings" ON public.meetings;
CREATE POLICY "Service role full access on meetings"
  ON public.meetings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5) lead_sessions: remove public SELECT (admin reads go through admin-data edge function w/ service_role)
DROP POLICY IF EXISTS "Anyone can read own session" ON public.lead_sessions;

-- 6) leads: replace broad UPDATE policy with column-scoped + recency-scoped self-service
DROP POLICY IF EXISTS "Lead self-service status update" ON public.leads;
DROP POLICY IF EXISTS "Allow first open timestamp update" ON public.leads;

REVOKE UPDATE ON public.leads FROM anon, authenticated;
GRANT UPDATE (first_opened_at, clicked_whatsapp, clicked_whatsapp_at, skipped_queue, skipped_queue_at, lido)
  ON public.leads TO anon, authenticated;

CREATE POLICY "Lead self-service updates"
  ON public.leads FOR UPDATE TO anon, authenticated
  USING (created_at > (now() - interval '7 days'))
  WITH CHECK (created_at > (now() - interval '7 days'));

-- 7) leads: remove from realtime publication (no client subscribes to postgres_changes on leads)
ALTER PUBLICATION supabase_realtime DROP TABLE public.leads;
