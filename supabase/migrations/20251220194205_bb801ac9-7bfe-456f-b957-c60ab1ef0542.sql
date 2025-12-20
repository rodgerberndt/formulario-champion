-- Create leads table to store form submissions
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  instagram TEXT NOT NULL,
  mercado TEXT NOT NULL,
  estagio_negocio TEXT NOT NULL,
  dor_desejo TEXT NOT NULL,
  lido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create policy for public insert (anyone can submit the form)
CREATE POLICY "Anyone can submit a lead"
ON public.leads
FOR INSERT
WITH CHECK (true);

-- Create policy for authenticated admin to read all leads
CREATE POLICY "Admin can view all leads"
ON public.leads
FOR SELECT
USING (true);

-- Create policy for authenticated admin to update leads
CREATE POLICY "Admin can update leads"
ON public.leads
FOR UPDATE
USING (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;