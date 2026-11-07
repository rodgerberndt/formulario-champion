-- Teste A/B de quiz (Q1 a Q5): a variante precisa de coluna própria.
--
-- Nas headlines a variante era o `first_page`, porque cada anúncio apontava
-- para um path diferente. No quiz não dá: a pessoa entra por uma landing só e
-- a variante é sorteada no clique. `last_page` também não serve — ele é
-- sobrescrito durante a navegação e perderia o registro.
--
-- Uma coluna dedicada é o que permite o painel separar os resultados sem
-- inferência, e ela é escrita uma única vez, quando o quiz abre.
ALTER TABLE public.lead_sessions
  ADD COLUMN IF NOT EXISTS quiz_variant text;

COMMENT ON COLUMN public.lead_sessions.quiz_variant IS
  'Célula do teste de quiz (Q1..Q5). Gravada quando o quiz abre e nunca sobrescrita.';

CREATE INDEX IF NOT EXISTS lead_sessions_quiz_variant_idx
  ON public.lead_sessions (quiz_variant)
  WHERE quiz_variant IS NOT NULL;

-- A RPC ganha o parâmetro novo. É preciso DROPAR a versão antiga antes: um
-- parâmetro a mais muda a assinatura, e o CREATE OR REPLACE criaria uma
-- sobrecarga em vez de substituir — com todos os argumentos opcionais, a
-- chamada nomeada ficaria ambígua e o Postgres recusaria as duas.
DROP FUNCTION IF EXISTS public.update_lead_session(
  uuid, boolean, boolean, text, boolean, text, text, text, text, text, text, text, text
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
  p_quiz_variant text DEFAULT NULL
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
    -- A variante é a primeira que grava e a única que vale: se a pessoa
    -- reabrir o quiz e cair noutra célula, o resultado dela continua contando
    -- para a célula original. Trocar de célula no meio invalidaria o teste.
    quiz_variant       = COALESCE(quiz_variant, p_quiz_variant),
    last_seen_at       = now()
  WHERE id = p_session_id
    AND created_at > now() - interval '7 days';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_session(
  uuid, boolean, boolean, text, boolean, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.update_lead_session IS
  'Atualiza o progresso de uma lead_session a partir do navegador. Existe porque lead_sessions não tem policy de SELECT e o UPDATE direto afeta zero linhas em silêncio.';
