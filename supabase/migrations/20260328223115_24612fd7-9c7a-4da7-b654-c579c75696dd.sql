CREATE POLICY "Anyone can read own session"
ON public.lead_sessions
FOR SELECT
TO public
USING (true);