-- Venda com e-mail do cliente vira cliente no Hub (03/11/2026).
--
-- O formulário de "Registrar Venda" ganhou o e-mail do cliente. Com ele, a
-- admin-data chama o Hub (POST /api/public/venda-cliente) e o cliente nasce lá:
-- Sprint na Etapa 1, Assessoria sem copy e com o acesso ao portal enviado.
-- O resultado fica na própria venda, para a tela mostrar e para achar o que
-- não entrou. Aditiva: não altera nenhuma venda existente.

ALTER TABLE public.manual_sales
  ADD COLUMN IF NOT EXISTS cliente_email text,
  ADD COLUMN IF NOT EXISTS hub_client_id uuid,
  ADD COLUMN IF NOT EXISTS hub_status text,
  ADD COLUMN IF NOT EXISTS hub_erro text,
  ADD COLUMN IF NOT EXISTS hub_em timestamptz;

COMMENT ON COLUMN public.manual_sales.cliente_email IS
  'E-mail do cliente informado na venda. É a chave do cliente no Hub.';
COMMENT ON COLUMN public.manual_sales.hub_client_id IS
  'clients.id no Hub (championflow-hub) criado ou encontrado por esta venda.';
COMMENT ON COLUMN public.manual_sales.hub_status IS
  'criado | ja_existia | erro. Nulo = venda sem e-mail ou parceria (não vai ao Hub).';
COMMENT ON COLUMN public.manual_sales.hub_erro IS
  'Erro (hub_status = erro) ou avisos do cadastro (ex.: e-mail de acesso não enviado).';
COMMENT ON COLUMN public.manual_sales.hub_em IS
  'Quando a venda foi mandada ao Hub.';
