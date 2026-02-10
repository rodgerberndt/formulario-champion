-- Allow anonymous users to insert leads (public quiz form)
CREATE POLICY "Anyone can insert leads"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (true);
