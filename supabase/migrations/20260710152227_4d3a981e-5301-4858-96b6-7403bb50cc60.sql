-- Scroll attention bins: tempo (ponderado) que o visitante passou com o viewport
-- centrado em cada faixa de 5% da altura da página (20 bins). Granularidade fina
-- pra alimentar o heatmap "onde pararam pra ler" no admin — complementa os 4
-- scroll_milestones (25/50/75/100%) que só dizem "chegou até aqui", não "ficou aqui".
CREATE TABLE public.scroll_attention_bins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  page TEXT NOT NULL DEFAULT '/',
  bin INTEGER NOT NULL CHECK (bin BETWEEN 0 AND 19),
  time_ms INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_scroll_attention_unique ON public.scroll_attention_bins(session_id, page, bin);
CREATE INDEX idx_scroll_attention_session ON public.scroll_attention_bins(session_id);
CREATE INDEX idx_scroll_attention_created ON public.scroll_attention_bins(created_at DESC);

ALTER TABLE public.scroll_attention_bins ENABLE ROW LEVEL SECURITY;
-- De propósito, sem nenhuma policy de INSERT/UPDATE/SELECT pra anon/authenticated:
-- toda escrita passa pela RPC increment_scroll_bin_time abaixo (SECURITY DEFINER,
-- ignora RLS), e toda leitura é feita pela edge function admin-data via service role.

-- RPC pra incrementar atomicamente o tempo de uma faixa de scroll, mesmo padrão de
-- increment_section_time (migration 20260530113818_...sql) usado pelas seções.
CREATE OR REPLACE FUNCTION public.increment_scroll_bin_time(
  p_session_id uuid,
  p_page text,
  p_bin int,
  p_add_ms int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_bin < 0 OR p_bin > 19 THEN
    RETURN;
  END IF;

  -- Cap: no máximo 5 minutos por chamada para evitar abuso
  IF p_add_ms > 300000 THEN
    p_add_ms := 300000;
  END IF;
  IF p_add_ms < 0 THEN
    p_add_ms := 0;
  END IF;

  INSERT INTO public.scroll_attention_bins (session_id, page, bin, time_ms, last_seen_at)
  VALUES (p_session_id, p_page, p_bin, p_add_ms, now())
  ON CONFLICT (session_id, page, bin)
  DO UPDATE SET
    time_ms = public.scroll_attention_bins.time_ms + EXCLUDED.time_ms,
    last_seen_at = now();
END;
$$;

-- Permite chamada anônima (tracking público da landing)
GRANT EXECUTE ON FUNCTION public.increment_scroll_bin_time(uuid, text, int, int) TO anon, authenticated;

-- Posição relativa (%) do clique dentro da seção onde ocorreu, pra heatmap de
-- clique/toque no admin. Nullable: cliques antigos (anteriores a esta migration)
-- e cliques fora de qualquer seção rastreada simplesmente não têm posição e não
-- aparecem no heatmap de posição, sem quebrar o resto do relatório.
ALTER TABLE public.click_events
  ADD COLUMN pos_x_pct NUMERIC,
  ADD COLUMN pos_y_pct NUMERIC;
