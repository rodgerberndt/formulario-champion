-- Posição REAL de cada seção na página (% da altura total do documento).
--
-- Até aqui o admin estimava a posição de cada seção distribuindo-as
-- uniformemente pela página (seção N de 10 => começa em N/10 da altura). Isso
-- desalinhava o heatmap de scroll dos rótulos de seção e, pior, alimentava a
-- regra de inferência "chegou na seção" do funil com uma posição inventada.
-- Agora o próprio browser mede offsetTop/scrollHeight e manda junto.
ALTER TABLE public.section_views
  ADD COLUMN IF NOT EXISTS pos_start_pct numeric,
  ADD COLUMN IF NOT EXISTS pos_end_pct numeric;

-- Sobrecarga de increment_section_time com as duas posições.
--
-- É uma SOBRECARGA de propósito, não um replace: o bundle antigo continua em
-- cache no browser dos visitantes por um tempo depois do deploy e segue
-- chamando a versão de 5 parâmetros. O PostgREST resolve qual usar pelo
-- conjunto de chaves do JSON, então as duas convivem sem ambiguidade.
CREATE OR REPLACE FUNCTION public.increment_section_time(
  p_session_id uuid,
  p_section_id text,
  p_section_order int,
  p_page text,
  p_add_ms int,
  p_pos_start_pct numeric,
  p_pos_end_pct numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cap: no máximo 5 minutos por chamada para evitar abuso
  IF p_add_ms > 300000 THEN
    p_add_ms := 300000;
  END IF;
  IF p_add_ms < 0 THEN
    p_add_ms := 0;
  END IF;

  -- Posição fora de 0-100 é medição inválida (página ainda montando): descarta
  -- em vez de gravar lixo.
  IF p_pos_start_pct IS NOT NULL AND (p_pos_start_pct < 0 OR p_pos_start_pct > 100) THEN
    p_pos_start_pct := NULL;
  END IF;
  IF p_pos_end_pct IS NOT NULL AND (p_pos_end_pct < 0 OR p_pos_end_pct > 100) THEN
    p_pos_end_pct := NULL;
  END IF;

  INSERT INTO public.section_views (
    session_id, section_id, section_order, page, time_spent_ms, last_seen_at,
    pos_start_pct, pos_end_pct
  )
  VALUES (
    p_session_id, p_section_id, p_section_order, p_page, p_add_ms, now(),
    p_pos_start_pct, p_pos_end_pct
  )
  ON CONFLICT (session_id, section_id, page)
  DO UPDATE SET
    time_spent_ms = public.section_views.time_spent_ms + EXCLUDED.time_spent_ms,
    last_seen_at = now(),
    -- Última medição válida vence: a página cresce enquanto imagens/vídeos
    -- carregam, então a medida mais recente é a mais fiel.
    pos_start_pct = COALESCE(EXCLUDED.pos_start_pct, public.section_views.pos_start_pct),
    pos_end_pct = COALESCE(EXCLUDED.pos_end_pct, public.section_views.pos_end_pct);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_section_time(uuid, text, int, text, int, numeric, numeric) TO anon, authenticated;
