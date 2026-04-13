
CREATE TABLE public.daily_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  sdr_name TEXT NOT NULL,
  ligacoes_realizadas INTEGER NOT NULL DEFAULT 0,
  reunioes_agendadas INTEGER NOT NULL DEFAULT 0,
  mqls_chamados INTEGER NOT NULL DEFAULT 0,
  mqls_responderam INTEGER NOT NULL DEFAULT 0,
  vendas_sprint INTEGER NOT NULL DEFAULT 0,
  valor_pipeline NUMERIC NOT NULL DEFAULT 0,
  valor_fechado NUMERIC NOT NULL DEFAULT 0,
  mood TEXT NOT NULL DEFAULT 'Normal',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (report_date, sdr_name)
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on daily_reports"
  ON public.daily_reports FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
