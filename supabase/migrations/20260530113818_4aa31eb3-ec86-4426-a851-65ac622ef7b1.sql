
-- 1) daily_reports: restrict to service_role only
DROP POLICY IF EXISTS "Service role full access on daily_reports" ON public.daily_reports;
CREATE POLICY "Service role full access on daily_reports"
  ON public.daily_reports
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2) lead_sessions: scope UPDATE to recent rows (last 24h) to limit tampering window
DROP POLICY IF EXISTS "Anyone can update session tracking" ON public.lead_sessions;
CREATE POLICY "Anyone can update recent session tracking"
  ON public.lead_sessions
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (created_at > (now() - interval '1 day'))
  WITH CHECK (created_at > (now() - interval '1 day'));

-- 3) section_views: scope UPDATE to recent rows
DROP POLICY IF EXISTS "Anyone can update own section views" ON public.section_views;
CREATE POLICY "Anyone can update recent section views"
  ON public.section_views
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (first_seen_at > (now() - interval '1 day'))
  WITH CHECK (first_seen_at > (now() - interval '1 day'));
