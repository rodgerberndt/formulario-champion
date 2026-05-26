
-- 1) kommo_webhook_logs: remove public read; only service_role (edge functions) needs access
DROP POLICY IF EXISTS "Service role full access" ON public.kommo_webhook_logs;
DROP POLICY IF EXISTS "Service role full access on kommo_webhook_logs" ON public.kommo_webhook_logs;
REVOKE ALL ON public.kommo_webhook_logs FROM anon, authenticated;
GRANT ALL ON public.kommo_webhook_logs TO service_role;

-- 2) push_subscriptions: remove public access (web-push edge function uses service_role)
DROP POLICY IF EXISTS "Allow read push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Allow delete push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Allow insert push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Allow update push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can read push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can insert push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can update push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can delete push subscriptions" ON public.push_subscriptions;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- 3) leads: restrict UPDATE so anonymous users can only modify the self-service fields
DROP POLICY IF EXISTS "Allow skipped_queue update" ON public.leads;
REVOKE UPDATE ON public.leads FROM anon, authenticated;
GRANT UPDATE (skipped_queue, skipped_queue_at, clicked_whatsapp, clicked_whatsapp_at)
  ON public.leads TO anon, authenticated;
CREATE POLICY "Lead self-service status update"
  ON public.leads
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
