-- Taxa de Qualificação v2.2
--
-- A nota 0–100 de cada lead já foi regravada em `leads.score` pelo script de
-- recálculo (2.144 dos 2.155 leads mudaram de nota em 26/08/2026). Antes desse
-- recálculo a coluna misturava duas escalas: os leads antigos guardavam o tier
-- de 0 a 5 gravado pelo quiz da landing, e os recentes já guardavam a nota de
-- 0 a 100 do quiz atual. Média de 7,6 numa coluna que devia ir até 100.
--
-- O que falta é só rastreabilidade: saber COM QUAL VERSÃO cada nota foi
-- calculada e de onde ela veio. Sem isso não dá para provar daqui a 60 dias
-- que a v2.2 é melhor que a v1, que é o único jeito de o algoritmo continuar
-- melhorando.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score_version TEXT,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS score_calculated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.score IS
  'Taxa de Qualificação 0–100: propensão a fechar ASSESSORIA. Calculada por src/lib/leadScore.ts. Não confundir com tier, que é o porte do lead.';
COMMENT ON COLUMN public.leads.score_version IS
  'Versão do algoritmo que produziu o score (ex.: v2.2). Sem isso não dá para comparar coortes de meses diferentes.';
COMMENT ON COLUMN public.leads.score_breakdown IS
  'Pontos por bloco: faturamento, mercado, dor_desejo, compromisso_whatsapp, aceita_call, entendimento_site.';

-- Índice para a fila do comercial, que lê sempre pelos melhores primeiro.
CREATE INDEX IF NOT EXISTS idx_leads_score_desc ON public.leads (score DESC NULLS LAST);

-- Marca as notas já regravadas. O breakdown fica nulo até o próximo recálculo:
-- ele é derivável das respostas do lead a qualquer momento.
UPDATE public.leads
   SET score_version = 'v2.2',
       score_calculated_at = now()
 WHERE score IS NOT NULL
   AND score_version IS NULL;
