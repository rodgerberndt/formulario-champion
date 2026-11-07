-- Gravação de progresso da sessão: RPC em vez de UPDATE direto.
--
-- `lead_sessions` tem policy de INSERT e de UPDATE, mas NENHUMA de SELECT. Sem
-- policy de SELECT o Postgres não consegue localizar a linha para avaliar o
-- WHERE do UPDATE, então todo update do navegador afetava zero linhas — e sem
-- erro nenhum: o PostgREST devolvia 204 e o app seguia achando que gravou.
--
-- O estrago era invisível e grande. Desde julho:
--   • `started_quiz` e `completed` ficaram FALSE em todas as 2.636 sessões de
--     agosto, quebrando qualquer leitura dessas colunas;
--   • `lead_whatsapp` nunca foi preenchido, e é a chave que liga sessão a lead
--     na atribuição do Meta (meta-capi) e na recuperação de UTM do admin;
--   • a recuperação de criativo por IP no painel filtra `completed = true` e
--     por isso nunca rodava — todo lead sem UTM caía em "Direct".
--
-- É o mesmo padrão que já tinha quebrado `section_views` em 13/08, e a solução
-- é a mesma que funcionou lá: uma função SECURITY DEFINER, que roda com os
-- privilégios do dono e não passa pela RLS.
--
-- Os parâmetros são uma lista fechada de propósito: a função é chamada pelo
-- navegador com a chave anônima, então ela só pode tocar nas colunas de
-- progresso da sessão. Nada de campos de notificação ou de atribuição.
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
  p_fbp text DEFAULT NULL
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
    -- COALESCE: quem não foi informado nesta chamada não é apagado.
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
    last_seen_at       = now()
  WHERE id = p_session_id
    -- Mesma janela da policy antiga, com folga: sessão velha não volta a ser
    -- escrita por um navegador que ficou dias com a aba aberta.
    AND created_at > now() - interval '7 days';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  -- Devolve se achou a sessão. O cliente usa isso para saber que o id guardado
  -- no localStorage ficou órfão (banco limpo, sessão expirada) e criar outra.
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lead_session(
  uuid, boolean, boolean, text, boolean, text, text, text, text, text, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.update_lead_session IS
  'Atualiza o progresso de uma lead_session a partir do navegador. Existe porque lead_sessions não tem policy de SELECT e o UPDATE direto afeta zero linhas em silêncio.';
