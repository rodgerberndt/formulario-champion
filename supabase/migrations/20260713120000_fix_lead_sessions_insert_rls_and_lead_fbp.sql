-- Causa raiz real de "MQLs nao marcando a campanha no Meta / campanha nao otimiza":
-- lead_sessions nao tem policy de INSERT funcionando em producao (a policy
-- "Anyone can create a session" existe no migration 20260203200447 mas o
-- projeto live retorna 42501 em qualquer INSERT com a chave anon — foi
-- dropada/alterada fora do fluxo de migrations em algum momento). Com isso,
-- lead_sessions fica 100% vazia, meta-capi nunca acha fbp/fbc de sessao
-- recente pra enviar no evento CAPI, derrubando o Event Match Quality no
-- Meta e, por consequencia, a capacidade do algoritmo de atribuir/otimizar
-- a campanha a partir desses eventos.
DROP POLICY IF EXISTS "Anyone can create a session" ON public.lead_sessions;
CREATE POLICY "Anyone can create a session"
  ON public.lead_sessions
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Reforco: captura de fbp direto na tabela leads no momento do submit do
-- quiz (Quiz.tsx ja tem o cookie _fbp disponivel ali), pra nao depender
-- exclusivamente de lead_sessions (que ja ficou vazia por 2 causas raiz
-- diferentes nas ultimas semanas) para ter fbp disponivel no envio ao
-- Meta CAPI.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fbp text;
