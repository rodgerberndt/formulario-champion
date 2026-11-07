// Reunião do painel ↔ evento no Google Calendar.
//
// Modelo (o mesmo já em produção no Champion Hub): UMA conta Google conectada é
// a organizadora, e quem precisa ver a call entra como convidado. Ninguém
// precisa conectar a própria conta para a reunião aparecer na agenda.
//
// Roda sempre server-side, com service role: `calendar_integrations` guarda
// refresh token e é inacessível por RLS a qualquer outra chave.

const TIME_ZONE = "America/Sao_Paulo";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";

const GOOGLE_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";

// `calendar.freebusy` entrou em 17/09/2026 para o agendamento automático
// consultar ocupação (a própria agenda e a do Caio, compartilhada como
// livre/ocupado). Token emitido antes disso NÃO tem o scope: a conta precisa ser
// reconectada uma vez pelo card "Agenda das reuniões" do painel. Até lá o
// freeBusy responde 403 e o agendamento cai para só a regra de espaçamento.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface CalendarIntegration {
  id: string;
  status: string;
  connected_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  calendar_id: string;
  attendee_emails: string[] | null;
  invite_lead: boolean;
  default_duration_minutes: number;
}

export interface MeetingForSync {
  id: string;
  status: string | null;
  scheduled_at: string | null;
  closer: string | null;
  notes: string | null;
  lead_id: string | null;
  /** 'auto' = o lead marcou sozinho em /agendar. Ausente antes da migration 20260917150000. */
  agendado_por?: string | null;
}

/** Só reunião ainda em pé merece um evento em pé na agenda. */
export function deveTerEvento(m: MeetingForSync): boolean {
  return (m.status ?? "agendada") === "agendada" && !!m.scheduled_at;
}

/**
 * O evento de uma call que já aconteceu NÃO é apagado: ele é o registro na
 * agenda de que a reunião existiu. Some só o que virou no-show ou perdeu a data
 * — aí o compromisso não tem mais razão de estar ocupando o horário de ninguém.
 */
export function deveApagarEvento(m: MeetingForSync): boolean {
  const s = m.status ?? "agendada";
  return s === "no_show" || (s === "agendada" && !m.scheduled_at);
}

export function janelaDoEvento(scheduledAt: string, duracaoMin: number) {
  const inicio = new Date(scheduledAt);
  const fim = new Date(inicio.getTime() + Math.max(15, duracaoMin) * 60 * 1000);
  return { start: inicio.toISOString(), end: fim.toISOString() };
}

export function montarEvento(args: {
  meeting: MeetingForSync;
  leadNome: string | null;
  leadEmail: string | null;
  attendees: string[];
  duracaoMin: number;
  convidarLead: boolean;
  /** Pede um Google Meet novo. Só na CRIAÇÃO; no PATCH a conferência existente fica. */
  criarMeet?: boolean;
}) {
  const { start, end } = janelaDoEvento(args.meeting.scheduled_at!, args.duracaoMin);
  const nome = args.leadNome || args.meeting.notes || "Lead";

  const convidados = [...new Set(args.attendees.filter(Boolean))];
  const emailLead = args.leadEmail?.trim();
  if (args.convidarLead && emailLead && !convidados.some((e) => e.toLowerCase() === emailLead.toLowerCase())) {
    convidados.push(emailLead);
  }

  const conferencia = args.criarMeet
    ? {
      conferenceData: {
        createRequest: {
          requestId: `champion-${args.meeting.id}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }
    : {};

  // Reunião marcada pelo próprio lead: ELE recebe o convite, então título e
  // descrição não podem carregar nota interna nem texto do painel.
  if (args.meeting.agendado_por === "auto") {
    return {
      summary: `Call de diagnóstico Champion · ${nome}`,
      description: [
        `Call de diagnóstico da Champion com ${nome}.`,
        "",
        "O link da chamada (Google Meet) está neste convite.",
        "Se precisar remarcar, responda a conversa com o nosso time no WhatsApp.",
      ].join("\n"),
      start: { dateTime: start, timeZone: TIME_ZONE },
      end: { dateTime: end, timeZone: TIME_ZONE },
      attendees: convidados.map((email) => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 30 },
          { method: "email", minutes: 60 * 24 },
        ],
      },
      ...conferencia,
    };
  }

  const descricao = [
    `Reunião de diagnóstico · ${nome}`,
    args.meeting.closer ? `Closer: ${args.meeting.closer}` : null,
    args.meeting.notes ? `Notas: ${args.meeting.notes}` : null,
    "",
    "Evento criado pelo painel Champion. Remarcar por lá move este evento; o que",
    "for alterado direto na agenda é sobrescrito na próxima sincronização.",
  ].filter(Boolean);

  return {
    summary: `Call · ${nome}`,
    description: descricao.join("\n"),
    start: { dateTime: start, timeZone: TIME_ZONE },
    end: { dateTime: end, timeZone: TIME_ZONE },
    attendees: convidados.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "email", minutes: 60 * 24 },
      ],
    },
    ...conferencia,
  };
}

/** Link do Meet na resposta do Google, se a conferência já foi criada. */
export function linkDoMeet(evento: any): string | null {
  if (!evento) return null;
  if (typeof evento.hangoutLink === "string") return evento.hangoutLink;
  const video = (evento.conferenceData?.entryPoints ?? []).find((p: any) => p?.entryPointType === "video");
  return typeof video?.uri === "string" ? video.uri : null;
}

/** Access token do Google dura 1h. Renova faltando menos de 5 min e persiste. */
export async function getValidAccessToken(
  supabase: any,
  integration: CalendarIntegration,
): Promise<string> {
  const expiraEm = integration.token_expires_at ? Date.parse(integration.token_expires_at) : 0;
  if (integration.access_token && expiraEm - Date.now() > 5 * 60 * 1000) {
    return integration.access_token;
  }
  if (!integration.refresh_token) {
    throw new Error("Conexão sem refresh token — reconecte o Google Calendar no painel.");
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim();
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error_description ?? json.error ?? "falha ao renovar token";
    await supabase.from("calendar_integrations")
      .update({ status: "error", last_error: `Renovação de token: ${msg}` })
      .eq("id", integration.id);
    throw new Error(msg);
  }

  await supabase.from("calendar_integrations").update({
    access_token: json.access_token,
    token_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    status: "connected",
    last_error: null,
  }).eq("id", integration.id);

  return json.access_token as string;
}

async function googleFetch(
  accessToken: string,
  url: string,
  init: { method?: string; body?: unknown } = {},
) {
  const res = await fetch(url, {
    method: init.method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* DELETE devolve 204 sem corpo */ }
  return { ok: res.ok, status: res.status, json };
}

export async function carregarIntegracao(supabase: any): Promise<CalendarIntegration | null> {
  const { data } = await supabase
    .from("calendar_integrations")
    .select("id,status,connected_email,access_token,refresh_token,token_expires_at,calendar_id,attendee_emails,invite_lead,default_duration_minutes")
    .eq("provider", "google_calendar")
    .maybeSingle();
  return (data as CalendarIntegration) ?? null;
}

/**
 * Reconcilia UMA reunião com a agenda: cria o evento que falta, move o que mudou
 * de horário, apaga o que deixou de existir. Idempotente — pode rodar quantas
 * vezes quiser no mesmo registro.
 *
 * Nunca lança: agendar a reunião no painel tem que funcionar mesmo com a agenda
 * desconectada ou o Google fora do ar. O erro fica gravado no mapeamento e
 * aparece na tela, em vez de derrubar o salvamento.
 */
export async function sincronizarReuniao(
  supabase: any,
  meetingId: string,
): Promise<{ ok: boolean; acao: "criado" | "atualizado" | "apagado" | "ignorado"; error?: string; htmlLink?: string | null; meetLink?: string | null }> {
  try {
    const integration = await carregarIntegracao(supabase);
    if (!integration || integration.status !== "connected") {
      return { ok: false, acao: "ignorado", error: "Google Calendar não conectado" };
    }

    // `agendado_por` só existe depois da migration 20260917150000. Este arquivo
    // também é importado pelo admin-data: se ele for publicado antes da
    // migration, a leitura com a coluna falha e caímos na leitura antiga.
    let { data: meeting, error: erroLeitura } = await supabase
      .from("meetings")
      .select("id,status,scheduled_at,closer,notes,lead_id,agendado_por")
      .eq("id", meetingId)
      .maybeSingle();
    if (erroLeitura) {
      ({ data: meeting } = await supabase
        .from("meetings")
        .select("id,status,scheduled_at,closer,notes,lead_id")
        .eq("id", meetingId)
        .maybeSingle());
    }
    if (!meeting) return { ok: false, acao: "ignorado", error: "reunião não encontrada" };
    const ehAuto = meeting.agendado_por === "auto";

    const { data: mapping } = await supabase
      .from("meeting_calendar_events")
      .select("id,external_event_id,calendar_id")
      .eq("meeting_id", meetingId)
      .eq("provider", "google_calendar")
      .maybeSingle();

    const calendarId = encodeURIComponent(integration.calendar_id || "primary");
    const accessToken = await getValidAccessToken(supabase, integration);

    if (deveApagarEvento(meeting)) {
      if (!mapping) return { ok: true, acao: "ignorado" };
      const del = await googleFetch(
        accessToken,
        `${GOOGLE_EVENTS_URL}/${calendarId}/events/${mapping.external_event_id}?sendUpdates=all`,
        { method: "DELETE" },
      );
      // 404/410 = o evento já não existe lá; quem estava velho era o mapeamento.
      if (!del.ok && del.status !== 404 && del.status !== 410) {
        throw new Error(del.json?.error?.message ?? `HTTP ${del.status}`);
      }
      await supabase.from("meeting_calendar_events").delete().eq("id", mapping.id);
      return { ok: true, acao: "apagado" };
    }

    if (!deveTerEvento(meeting)) return { ok: true, acao: "ignorado" };

    let leadNome: string | null = null;
    let leadEmail: string | null = null;
    if (meeting.lead_id) {
      const { data: lead } = await supabase
        .from("leads").select("nome_completo,email").eq("id", meeting.lead_id).maybeSingle();
      leadNome = lead?.nome_completo ?? null;
      leadEmail = lead?.email ?? null;
    }

    // Reunião automática: o lead SEMPRE é convidado (senão o PATCH de um
    // remarcar no painel tiraria o lead do próprio evento) e ganha Meet na
    // criação. A duração vem da grade do agendamento.
    let duracaoMin = integration.default_duration_minutes || 45;
    let convidarLead = !!integration.invite_lead;
    let criarMeet = false;
    if (ehAuto) {
      const { data: cfg } = await supabase
        .from("agendamento_config")
        .select("duracao_minutos,convidar_lead,criar_meet")
        .eq("id", 1)
        .maybeSingle();
      duracaoMin = cfg?.duracao_minutos || duracaoMin;
      convidarLead = cfg ? cfg.convidar_lead !== false : true;
      criarMeet = cfg ? cfg.criar_meet !== false : true;
    }

    const body = montarEvento({
      meeting,
      leadNome,
      leadEmail,
      attendees: integration.attendee_emails ?? [],
      duracaoMin,
      convidarLead,
    });

    if (mapping) {
      const upd = await googleFetch(
        accessToken,
        `${GOOGLE_EVENTS_URL}/${calendarId}/events/${mapping.external_event_id}?sendUpdates=all`,
        { method: "PATCH", body },
      );
      if (upd.ok) {
        await supabase.from("meeting_calendar_events").update({
          last_synced_at: new Date().toISOString(),
          sync_status: "ok",
          sync_error: null,
          html_link: upd.json?.htmlLink ?? null,
          ...(linkDoMeet(upd.json) ? { meet_link: linkDoMeet(upd.json) } : {}),
        }).eq("id", mapping.id);
        return { ok: true, acao: "atualizado", htmlLink: upd.json?.htmlLink ?? null, meetLink: linkDoMeet(upd.json) };
      }
      // Evento apagado direto no Google: recria, em vez de travar no erro.
      if (upd.status === 404 || upd.status === 410) {
        await supabase.from("meeting_calendar_events").delete().eq("id", mapping.id);
      } else {
        throw new Error(upd.json?.error?.message ?? `HTTP ${upd.status}`);
      }
    }

    const corpoCriacao = criarMeet
      ? montarEvento({
        meeting, leadNome, leadEmail, attendees: integration.attendee_emails ?? [], duracaoMin, convidarLead, criarMeet: true,
      })
      : body;
    // conferenceDataVersion=1 é o que faz o Google aceitar o createRequest do Meet.
    const ins = await googleFetch(
      accessToken,
      `${GOOGLE_EVENTS_URL}/${calendarId}/events?sendUpdates=all${criarMeet ? "&conferenceDataVersion=1" : ""}`,
      { method: "POST", body: corpoCriacao },
    );
    if (!ins.ok) throw new Error(ins.json?.error?.message ?? `HTTP ${ins.status}`);

    await supabase.from("meeting_calendar_events").upsert({
      meeting_id: meetingId,
      provider: "google_calendar",
      external_event_id: ins.json.id,
      calendar_id: integration.calendar_id || "primary",
      html_link: ins.json.htmlLink ?? null,
      meet_link: linkDoMeet(ins.json),
      last_synced_at: new Date().toISOString(),
      sync_status: "ok",
      sync_error: null,
    }, { onConflict: "meeting_id,provider" });

    await supabase.from("calendar_integrations")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", integration.id);

    return { ok: true, acao: "criado", htmlLink: ins.json.htmlLink ?? null, meetLink: linkDoMeet(ins.json) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[google-calendar] reunião ${meetingId}: ${msg}`);
    await supabase.from("meeting_calendar_events")
      .update({ sync_status: "error", sync_error: msg })
      .eq("meeting_id", meetingId);
    return { ok: false, acao: "ignorado", error: msg };
  }
}

/** Apaga o evento de uma reunião removida do painel. */
export async function apagarEventoDaReuniao(supabase: any, meetingId: string): Promise<void> {
  try {
    const integration = await carregarIntegracao(supabase);
    if (!integration || integration.status !== "connected") return;
    const { data: mapping } = await supabase
      .from("meeting_calendar_events")
      .select("id,external_event_id")
      .eq("meeting_id", meetingId)
      .eq("provider", "google_calendar")
      .maybeSingle();
    if (!mapping) return;

    const accessToken = await getValidAccessToken(supabase, integration);
    const calendarId = encodeURIComponent(integration.calendar_id || "primary");
    await googleFetch(
      accessToken,
      `${GOOGLE_EVENTS_URL}/${calendarId}/events/${mapping.external_event_id}?sendUpdates=all`,
      { method: "DELETE" },
    );
    // O DELETE em cascata da tabela leva o mapeamento junto quando a reunião sai.
  } catch (e) {
    console.error("[google-calendar] falha ao apagar evento:", e);
  }
}

export interface PeriodoOcupado {
  inicioMs: number;
  fimMs: number;
  agenda: string;
}

/**
 * Períodos ocupados das agendas pedidas, pela API freeBusy.
 *
 * Nunca lança. `erros` lista o que não deu para ler: sem conexão, token sem o
 * scope calendar.freebusy (conta conectada antes de 17/09/2026), agenda do Caio
 * não compartilhada com a conta organizadora (o Google devolve `notFound` para
 * aquela agenda e responde as outras). Quem chama usa o que veio e registra o
 * resto.
 */
export async function consultarOcupacao(
  supabase: any,
  agendas: string[],
  inicioIso: string,
  fimIso: string,
): Promise<{ ok: boolean; ocupados: PeriodoOcupado[]; erros: string[] }> {
  const ids = [...new Set(agendas.map((a) => String(a || "").trim()).filter(Boolean))];
  if (!ids.length) return { ok: true, ocupados: [], erros: [] };
  try {
    const integration = await carregarIntegracao(supabase);
    if (!integration || integration.status !== "connected") {
      return { ok: false, ocupados: [], erros: ["Google Calendar não conectado"] };
    }
    const accessToken = await getValidAccessToken(supabase, integration);
    const res = await googleFetch(accessToken, GOOGLE_FREEBUSY_URL, {
      method: "POST",
      body: { timeMin: inicioIso, timeMax: fimIso, timeZone: TIME_ZONE, items: ids.map((id) => ({ id })) },
    });
    if (!res.ok) {
      const msg = res.json?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, ocupados: [], erros: [`freeBusy: ${msg}`] };
    }
    const ocupados: PeriodoOcupado[] = [];
    const erros: string[] = [];
    const calendarios = res.json?.calendars ?? {};
    for (const id of ids) {
      const c = calendarios[id];
      if (!c) {
        erros.push(`${id}: sem resposta do freeBusy`);
        continue;
      }
      if (Array.isArray(c.errors) && c.errors.length) {
        erros.push(`${id}: ${c.errors.map((e: any) => e?.reason ?? "erro").join(", ")}`);
      }
      for (const b of c.busy ?? []) {
        const i = Date.parse(b.start);
        const f = Date.parse(b.end);
        if (Number.isFinite(i) && Number.isFinite(f) && f > i) ocupados.push({ inicioMs: i, fimMs: f, agenda: id });
      }
    }
    return { ok: erros.length === 0, ocupados, erros };
  } catch (e) {
    return { ok: false, ocupados: [], erros: [e instanceof Error ? e.message : "erro desconhecido"] };
  }
}
