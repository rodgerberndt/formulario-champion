-- Esteira: peça do tipo "direct" (30/10/2026). Copy das automações de DM do Champion Direct, uma peça por porta
-- (GANCHO, TEMPO, CRIATIVO, Novo seguidor, DIAGNÓSTICO, ESCALA, VOLUME), para o Rodger aprovar no quadro igual às
-- copys de carrossel. Etapas em supabase/functions/esteira/fluxos.ts.
alter table public.esteira_pecas drop constraint if exists esteira_pecas_tipo_check;
alter table public.esteira_pecas add constraint esteira_pecas_tipo_check check (tipo in ('carrossel', 'reel', 'direct'));
