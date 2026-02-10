-- Drop the duplicate/restrictive policies
DROP POLICY IF EXISTS "Anyone can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.leads;

-- Create a single PERMISSIVE insert policy
CREATE POLICY "Public can submit leads"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
