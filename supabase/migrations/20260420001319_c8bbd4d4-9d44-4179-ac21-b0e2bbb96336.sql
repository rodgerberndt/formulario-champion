
-- Função RPC para incrementar o tempo de visualização de uma seção atomicamente.
-- Resolve a race condition de read-then-write no client (useLandingTracking).
CREATE OR REPLACE FUNCTION public.increment_section_time(
  p_session_id uuid,
  p_section_id text,
  p_section_order int,
  p_page text,
  p_add_ms int
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

  INSERT INTO public.section_views (session_id, section_id, section_order, page, time_spent_ms, last_seen_at)
  VALUES (p_session_id, p_section_id, p_section_order, p_page, p_add_ms, now())
  ON CONFLICT (session_id, section_id, page)
  DO UPDATE SET
    time_spent_ms = public.section_views.time_spent_ms + EXCLUDED.time_spent_ms,
    last_seen_at = now();
END;
$$;

-- Garante que o ON CONFLICT tenha índice único correspondente
CREATE UNIQUE INDEX IF NOT EXISTS section_views_unique_per_session_section_page
  ON public.section_views (session_id, section_id, page);

-- Permite chamada anônima (tracking público da landing)
GRANT EXECUTE ON FUNCTION public.increment_section_time(uuid, text, int, text, int) TO anon, authenticated;
