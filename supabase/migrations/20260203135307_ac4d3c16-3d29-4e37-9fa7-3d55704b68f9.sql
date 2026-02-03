-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated admins can view leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated admins can update leads" ON public.leads;

-- Create new policies that allow public access (security via secret URL)
CREATE POLICY "Anyone can view leads"
ON public.leads
FOR SELECT
USING (true);

CREATE POLICY "Anyone can update leads"
ON public.leads
FOR UPDATE
USING (true);