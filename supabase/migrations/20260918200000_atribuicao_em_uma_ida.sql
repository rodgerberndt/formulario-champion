-- ─────────────────────────────────────────────────────────────────────────────
-- A atribuição da lista de leads em UMA ida ao banco, não duas.
--
-- Medido em 18/09/2026, com o banco em us-west-2 e o painel no Brasil:
--   • a consulta dos leads EXECUTA em 0,67 ms;
--   • a rota /leads inteira levava 3.036 ms.
-- O banco fazia 0,02% do trabalho. O resto era ida e volta: sete consultas em
-- fila, cada uma pagando ~230 ms de latência só para atravessar o continente.
--
-- Duas dessas sete eram uma dependência real: primeiro os `submit` do período,
-- depois as sessões DESSES submits por id — 951 ms para um join que o Postgres
-- resolve em microssegundos. Este arquivo move o join para dentro do banco.
--
-- O que NÃO muda: o casamento lead×submit continua em TypeScript (busca binária
-- com a tolerância de 3 minutos). Aqui só se junta submit com sessão, que é
-- mecânico. A atribuição devolve exatamente as mesmas linhas de antes.
-- ─────────────────────────────────────────────────────────────────────────────

-- O filtro `event_name = 'submit'` não tinha índice: o Postgres varria o índice
-- de data e descartava 29.573 linhas por carregamento para achar 175 submits.
-- Barato hoje (14 ms), mas cresce junto com o tráfego — e `lead_events` é a
-- tabela que mais cresce aqui (42.652 linhas, 15 mil só de page_view).
create index if not exists idx_lead_events_submit_created_at
  on public.lead_events (created_at)
  where event_name = 'submit';

create or replace function public.submits_com_sessao(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  session_id   uuid,
  submit_at    timestamptz,
  ip_address   text,
  fbp          text,
  utm_content  text,
  utm_campaign text,
  first_page   text,
  sessao_em    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.session_id,
    e.created_at as submit_at,
    s.ip_address,
    s.fbp,
    s.utm_content,
    s.utm_campaign,
    s.first_page,
    s.created_at as sessao_em
  from public.lead_events e
  join public.lead_sessions s on s.id = e.session_id
  where e.event_name = 'submit'
    and (p_from is null or e.created_at >= p_from)
    and (p_to   is null or e.created_at <= p_to)
  order by e.created_at;
$$;

-- Só a service_role chama: quem chega aqui é a função admin-data, nunca o
-- navegador. `anon` e `authenticated` ficam de fora de propósito — a função lê
-- `lead_sessions`, que não tem policy de SELECT para ninguém.
revoke all on function public.submits_com_sessao(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.submits_com_sessao(timestamptz, timestamptz) to service_role;
