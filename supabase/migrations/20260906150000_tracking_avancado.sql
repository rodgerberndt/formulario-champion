-- Tracking avançado (06/09/2026) — o que o Meta precisa receber para
-- identificar a pessoa: os dados de NAVEGAÇÃO capturados na hora em que ela
-- estava na página. É o "banco de dados chaveado pelo indexador" do método
-- Allan Tracker; aqui o indexador é o próprio lead/sessão.
--
-- `_fbc` é o cookie que o pixel grava no clique de anúncio. Até hoje ele nunca
-- foi lido: o servidor remontava "fb.1.<hora do lead>.<fbclid>", que só existe
-- quando a URL trouxe fbclid, e com um horário que não é o do clique. Lead que
-- entrou pela bio dias depois do clique saía sem fbc, e a venda dele o Meta
-- não conseguia ligar a anúncio nenhum.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS page_url text,
  ADD COLUMN IF NOT EXISTS session_id text;

ALTER TABLE public.lead_sessions
  ADD COLUMN IF NOT EXISTS fbc text;

ALTER TABLE public.landing_hits
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS pv_event_id text;

-- A RPC de progresso da sessão ganha `p_fbc`. Como em 31/08 (p_quiz_variant):
-- DROPAR a assinatura atual antes, porque um parâmetro a mais muda a
-- assinatura e o CREATE OR REPLACE criaria uma sobrecarga; com todos os
-- argumentos opcionais a chamada nomeada ficaria ambígua e o Postgres
-- recusaria as duas. O bundle antigo em cache continua funcionando: ele só
-- omite os parâmetros novos, que têm DEFAULT.
DROP FUNCTION IF EXISTS public.update_lead_session(
  uuid, boolean, boolean, text, boolean, text, text, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.update_lead_session(
  p_session_id uuid,
  p_started_quiz boolean DEFAULT NULL,
  p_completed boolean DEFAULT NULL,
  p_current_step_id text DEFAULT NULL,
  p_entered_quiz_page boolean DEFAULT NULL,
  p_start_button_id text DEFAULT NULL,
  p_last_page text DEFAULT NULL,
  p_lead_name text DEFAULT NULL,
  p_lead_whatsapp text DEFAULT NULL,
  p_lead_instagram text DEFAULT NULL,
  p_lead_market text DEFAULT NULL,
  p_lead_stage text DEFAULT NULL,
  p_fbp text DEFAULT NULL,
  p_quiz_variant text DEFAULT NULL,
  p_fbc text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.lead_sessions SET
    started_quiz       = COALESCE(p_started_quiz, started_quiz),
    completed          = COALESCE(p_completed, completed),
    current_step_id    = COALESCE(p_current_step_id, current_step_id),
    entered_quiz_page  = COALESCE(p_entered_quiz_page, entered_quiz_page),
    start_button_id    = COALESCE(p_start_button_id, start_button_id),
    last_page          = COALESCE(p_last_page, last_page),
    lead_name          = COALESCE(p_lead_name, lead_name),
    lead_whatsapp      = COALESCE(p_lead_whatsapp, lead_whatsapp),
    lead_instagram     = COALESCE(p_lead_instagram, lead_instagram),
    lead_market        = COALESCE(p_lead_market, lead_market),
    lead_stage         = COALESCE(p_lead_stage, lead_stage),
    fbp                = COALESCE(p_fbp, fbp),
    -- A variante é a primeira que grava e a única que vale (teste de quiz).
    quiz_variant       = COALESCE(quiz_variant, p_quiz_variant),
    fbc                = COALESCE(p_fbc, fbc),
    last_seen_at       = now()
  WHERE id = p_session_id
    AND created_at > now() - interval '7 days';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_session(
  uuid, boolean, boolean, text, boolean, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.update_lead_session IS
  'Atualiza o progresso de uma lead_session a partir do navegador. Existe porque lead_sessions não tem policy de SELECT e o UPDATE direto afeta zero linhas em silêncio.';

COMMENT ON COLUMN public.leads.fbc IS 'Cookie _fbc do navegador no submit (fb.1.<clique>.<fbclid>). Identificação do clique de anúncio para a CAPI.';
COMMENT ON COLUMN public.leads.user_agent IS 'User agent do navegador no submit, para client_user_agent na CAPI.';
COMMENT ON COLUMN public.leads.page_url IS 'URL da página onde o lead foi enviado (event_source_url do Lead).';
COMMENT ON COLUMN public.leads.session_id IS 'champion_session_id do navegador; vai como external_id junto com o lead_id.';
