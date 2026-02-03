-- Fix critical security vulnerability: leads table is publicly readable and updatable
-- The admin-data edge function uses service role key, so it will bypass RLS

-- Drop the dangerous public SELECT policy
DROP POLICY IF EXISTS "Anyone can view leads" ON public.leads;

-- Drop the dangerous public UPDATE policy  
DROP POLICY IF EXISTS "Anyone can update leads" ON public.leads;

-- Note: We keep "Anyone can submit a lead" INSERT policy so quiz submissions still work
-- Admin access is handled via the admin-data edge function using service role key