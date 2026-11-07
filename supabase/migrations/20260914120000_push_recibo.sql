-- Recibo de push: quando o APARELHO mostrou a notificação.
--
-- `last_used_at` é gravado quando o servidor de push ACEITA a mensagem. Isso
-- não prova nada: Chrome fechado no PC, celular em economia de bateria ou app
-- desinstalado no iPhone aceitam e nunca mostram. O service worker agora
-- confirma de volta (web-push/recebido), e é esta coluna que diz no painel qual
-- aparelho do time está de fato tocando quando o lead cai.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_received_id TEXT;

COMMENT ON COLUMN public.push_subscriptions.last_received_at IS
  'Quando o service worker deste aparelho confirmou ter mostrado um push. Diferente de last_used_at (servidor de push aceitou).';
COMMENT ON COLUMN public.push_subscriptions.last_received_id IS
  'id do último envio confirmado (web-push/send devolve o id).';
