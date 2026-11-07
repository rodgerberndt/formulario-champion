-- Uma linha por APARELHO em push_subscriptions.
--
-- A tabela só conhecia o endpoint, e o endpoint muda: reinstalar o app no
-- iPhone ou o iOS refazer a inscrição gera outro. Cada troca virava uma linha
-- nova e a antiga ficava para sempre — em 14/09/2026 o celular de teste do
-- Rodger aparecia três vezes na lista (duas como "Guguinha", uma sem dono).
--
-- `device_id` é um UUID guardado no localStorage do aparelho. O web-push apaga
-- as outras linhas do mesmo device_id a cada inscrição.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_id TEXT;

COMMENT ON COLUMN public.push_subscriptions.device_id IS
  'UUID do aparelho (localStorage champion_device_id). Uma linha por aparelho: nova inscrição do mesmo device_id substitui as antigas.';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id
  ON public.push_subscriptions (device_id)
  WHERE device_id IS NOT NULL;
