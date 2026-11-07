import { useCallback, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Botao } from "@/components/landing/Botao";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneField, isPhoneE164Valid } from "@/components/PhoneField";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useTracking } from "@/hooks/useTracking";
import { getUtmForDb, getAttributionSource } from "@/hooks/useUtmCapture";
import { resgatarAtribuicaoDoLead } from "@/lib/atribuicaoPaga";
import { instagramValido, normalizarInstagram, ERRO_INSTAGRAM } from "@/lib/instagramUsuario";
import { getNavigationForLead, saveAdvancedMatching, eventIdsForLead } from "@/lib/metaTracking";
import { getTierFromFaturamento } from "@/lib/leadScoring";
import { useCopyNicho } from "@/config/nichoLanding";
import { INVESTIMENTO_OPTIONS, calcularNotaFormulario } from "@/lib/leadScore";
import { FORMULARIO_TOPO_ID, FORMULARIO_PRIMEIRO_CAMPO_ID } from "@/lib/formularioTopo";
import { faixaPermiteAgendamento } from "@/lib/agendamento";
import { codigoDeTesteMeta } from "@/lib/ambienteMeta";

/**
 * Formulário curto no topo da landing (17/09/2026).
 *
 * Substitui o quiz de 14 passos como destino da landing. O teste Q1–Q5 está
 * ENCERRADO: nada na landing sorteia célula; /quiz e /quiz/qN continuam no ar
 * só por causa de links antigos.
 *
 * O ENVIO É O MESMO DO QUIZ (src/pages/Quiz.tsx, handleSubmit), na mesma ordem:
 *   1. score (calcularNotaFormulario, v3-form) + tier (getTierFromFaturamento)
 *   2. IP via get-client-ip com corrida de 800 ms
 *   3. insert em `leads` com id gerado no cliente (+ retry sem colunas opcionais)
 *   4. champion_lead_id, advanced matching (champion_am), champion_event_ids
 *   5. fire-capi-events com os mesmos event_ids e event_source_url
 *   6. quiz_leads (mesmo projeto) e send-quiz-data (n8n)
 *   7. trackSubmit → evento `submit`, sessão completed + notify-lead
 *
 * Velocidade (17/09/2026, o dono achou o redirecionamento lento): antes a troca
 * de página esperava TODAS as chamadas de 5 a 7 terminarem, com teto de 5 s, e
 * o fire-capi-events sozinho manda 4 a 5 eventos em série ao Meta. Agora:
 *   - o IP começa a ser buscado no primeiro toque no formulário, não no envio;
 *   - 5 e 6 saem com `fetch(..., { keepalive: true })`, que o navegador mantém
 *     vivo depois da navegação, e NÃO são esperados;
 *   - só se espera o trackSubmit (evento `submit` + sessão completed, que são
 *     duas escritas rápidas e disparam o notify-lead com keepalive), com teto
 *     de ESPERA_MAX_BACKGROUND_MS.
 * Rede de baixo do CAPI se o keepalive falhar: o gatilho AFTER INSERT em
 * `leads` dispara o fire-capi-events pelo banco, e a reconciliação a cada
 * 5 min reprocessa o que ficou sem `Lead` (migration 20260909180000).
 *   8. champion_quiz_result → /agendar (≥ R$ 100 mil) ou /obrigadomql (todo o resto)
 * Mudou lá, confira aqui. A duplicação é deliberada: o quiz continua no ar e
 * não foi tocado.
 *
 * Campos do quiz longo que este formulário não pergunta vão vazios/nulos:
 * operacoes_ativas, dor_desejo (""; a coluna é NOT NULL), nps_score,
 * trafego_faixa, faturamento_declarado, aceita_call, compromisso, quer_vender.
 * Nenhum deles pontua: o score deste lead é o v3-form (ver `src/lib/hql.ts`).
 */

/** Identificador da variante gravado em lead_sessions.quiz_variant e no raw_answers_json. */
export const FORM_VARIANT = "form_curto";

// A regra MQL x Sprint (faixa >= R$ 10 mil) NÃO mora mais aqui desde 17/09/2026:
// o servidor decide no fire-capi-events (_shared/meta.ts) e o pixel decide em
// src/lib/conversaoPixel.ts. Aqui só se escolhe a página: /agendar ou /obrigadomql.

const RESULT_STORAGE_KEY = "champion_quiz_result";

/** Teto de espera pelo trackSubmit (evento submit + sessão) antes de trocar de página. */
const ESPERA_MAX_BACKGROUND_MS = 1500;

/**
 * POST que sobrevive à troca de página. `keepalive` limita o corpo a 64 KB
 * somando as requisições pendentes; os corpos daqui têm poucos KB.
 */
function postKeepalive(url: string, corpo: unknown, extra: Record<string, string> = {}): Promise<void> {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return fetch(url, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...extra,
    },
    body: JSON.stringify(corpo),
  }).then(async (res) => {
    if (!res.ok) console.warn(`[form] ${url} respondeu ${res.status}:`, await res.text().catch(() => ""));
  }).catch((e) => console.warn(`[form] ${url} falhou:`, e));
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** IP do visitante, buscado uma vez só (a primeira interação já dispara). */
let ipEmAndamento: Promise<string | null> | null = null;
function buscarIp(): Promise<string | null> {
  if (!ipEmAndamento) {
    ipEmAndamento = supabase.functions
      .invoke("get-client-ip", { body: { action: "get_ip_only" } })
      .then((r) => (r.data?.ip as string) || null)
      .catch(() => null);
  }
  return ipEmAndamento;
}

interface FormState {
  nome_completo: string;
  email: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  investimento_faixa: string;
}

type Campo = keyof FormState;

const VAZIO: FormState = {
  nome_completo: "",
  email: "",
  whatsapp: "",
  instagram: "",
  mercado: "",
  investimento_faixa: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(d: FormState): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  if (d.nome_completo.trim().length < 3) e.nome_completo = "Informe seu nome";
  if (!EMAIL_RE.test(d.email.trim())) e.email = "Informe um e-mail válido";
  if (!isPhoneE164Valid(d.whatsapp)) e.whatsapp = "Informe um telefone válido";
  // `length >= 1` aceitava "@" sozinho, e um lead real entrou assim em 18/09.
  // Ver src/lib/instagramUsuario.ts.
  if (!instagramValido(d.instagram)) e.instagram = ERRO_INSTAGRAM;
  if (!d.mercado) e.mercado = "Selecione o segmento";
  if (!d.investimento_faixa) e.investimento_faixa = "Selecione o faturamento";
  return e;
}

const ORDEM_CAMPOS: Campo[] = ["nome_completo", "email", "whatsapp", "instagram", "mercado", "investimento_faixa"];
const ID_CAMPO: Record<Campo, string> = {
  nome_completo: FORMULARIO_PRIMEIRO_CAMPO_ID,
  email: "form-email",
  whatsapp: "form-telefone",
  instagram: "form-instagram",
  mercado: "form-segmento",
  investimento_faixa: "form-faturamento",
};

function comTeto<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export function HeroLeadForm() {
  const { trackEvent, updateSession, trackSubmit } = useTracking();
  // As opções de Segmento vêm do nicho da página: a versão de e-commerce abre
  // drop e COD e não oferece infoproduto, SaaS nem agência.
  const { segmentos } = useCopyNicho().formulario;
  // `useUtmCapture()` NÃO é chamado aqui (18/09/2026). A captura já roda uma
  // vez em `Index.tsx`, que é a página; montar o hook também neste componente
  // fazia a MESMA visita ser capturada duas vezes por carregamento (o guarda
  // `initialized` é por instância do hook, não por página). A leitura do que
  // foi capturado não precisa de hook: `getUtmForDb` é função de módulo.
  const getUtmPayload = getUtmForDb;

  const [dados, setDados] = useState<FormState>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const enviandoRef = useRef(false);
  const iniciouRef = useRef(false);

  const atualizar = useCallback((campo: Campo, valor: string) => {
    setDados((prev) => {
      const next = { ...prev, [campo]: valor };
      if (tentouEnviar) setErros(validar(next));
      return next;
    });
  }, [tentouEnviar]);

  /**
   * Primeira interação com o formulário = "entrou no quiz".
   *
   * O painel conta entrada no quiz pelo evento `quiz_view` por sessão (Conv.Pág,
   * Conv.Quiz, funil por dia, por criativo). Sem ele, todo lead do formulário
   * apareceria como conversão sem entrada. A página gravada é a da landing,
   * não /quiz, e a variante vai no metadata e em lead_sessions.quiz_variant.
   */
  const marcarInicio = useCallback(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    void buscarIp();
    trackEvent("quiz_view", {
      page: window.location.pathname,
      metadata: { quiz_variant: FORM_VARIANT, formulario: FORM_VARIANT } as Json,
    }).catch(() => {});
    updateSession({
      entered_quiz_page: true,
      started_quiz: true,
      quiz_variant: FORM_VARIANT,
    }).catch(() => {});
  }, [trackEvent, updateSession]);

  const enviar = useCallback(async (d: FormState) => {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setFalhou(false);

    try {
      // Score v3-form (17/09/2026): SÓ faturamento + mercado, renormalizado
      // para 0–100, corte de lead bom em 67. A v2.3 continua sendo a nota do
      // /quiz e não foi tocada.
      //
      // Por que não dá para usar a v2.3 aqui: ela soma seis fatores e o
      // formulário só pergunta dois. O lead saía com teto 70, sendo 15 desses
      // pontos ganhos por não ter sido perguntado (13 de "compromisso
      // presumido" + 2 de "NPS ausente"), e o corte de 73 do HighQualityLead
      // ficava inalcançável — nenhum lead do formulário seria HQL, sem erro
      // nenhum no log.
      const scoreResult = calcularNotaFormulario({
        investimento_faixa: d.investimento_faixa,
        mercado: d.mercado,
      });
      const tier = getTierFromFaturamento(d.investimento_faixa);

      // Normalmente já resolvido: começou no primeiro toque no formulário.
      const clientIp: string | null = await Promise.race([
        buscarIp(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
      ]);

      const navegacao = getNavigationForLead();

      const respostas = {
        formulario: FORM_VARIANT,
        nome_completo: d.nome_completo.trim(),
        whatsapp: d.whatsapp,
        // Normalizado na porta: URL colada vira usuário, espaço e "@" repetido
        // somem. É o mesmo formato que o `instagram-follow-mql` espera do outro lado.
        instagram: normalizarInstagram(d.instagram),
        email: d.email.trim(),
        mercado: d.mercado,
        investimento_faixa: d.investimento_faixa,
      };

      // Roteamento (decisão do Rodger, 17/09/2026): TODO lead do formulário vai
      // para /obrigadomql, com a narrativa da call de diagnóstico. Faturamento
      // ≥ R$ 100 mil passa antes por /agendar e escolhe o horário.
      // /obrigadosprint deixou de ser destino deste formulário.
      //
      // Calculado ANTES do insert desde 18/09/2026: o destino vai junto do lead
      // (`destino_conversao`), e é dele que o gatilho do banco tira o
      // `event_source_url`. Sem isso o `fire-capi-events` chamado pelo GATILHO
      // caía no palpite antigo (`obrigadomql` se a faixa é MQL, senão
      // `obrigadosprint`) e carimbava /obrigadosprint num lead que foi para
      // /obrigadomql — URL diferente da que o pixel usou no navegador.
      const destino = faixaPermiteAgendamento(respostas.investimento_faixa) ? "/agendar" : "/obrigadomql";
      // `origin` e não domínio fixo (25/09/2026): o fixo era o championadstudio,
      // que expirou, e o event_source_url do lead apontava para ele.
      const destinoAbsoluto = `${window.location.origin}${destino}`;

      const dbData = {
        nome_completo: respostas.nome_completo,
        whatsapp: respostas.whatsapp,
        instagram: respostas.instagram,
        email: respostas.email,
        mercado: respostas.mercado,
        operacoes_ativas: null,
        investimento_faixa: respostas.investimento_faixa,
        faturamento_declarado: null,
        // NOT NULL na tabela. O formulário curto não pergunta a dor.
        dor_desejo: "",
        trafego_faixa: null,
        score: scoreResult.score,
        score_breakdown: scoreResult.breakdown,
        score_version: scoreResult.version,
        score_calculated_at: new Date().toISOString(),
        tier,
        nps_score: null,
        raw_answers_json: JSON.parse(JSON.stringify(respostas)),
        attribution_source: getAttributionSource(),
        ip_address: clientIp,
        fbp: navegacao.fbp,
        fbc: navegacao.fbc,
        user_agent: navegacao.user_agent,
        page_url: navegacao.page_url,
        session_id: navegacao.session_id,
        // A página para onde ESTE lead vai agora. O gatilho do banco usa como
        // event_source_url; sem ela, servidor e navegador mandam URLs
        // diferentes para o mesmo event_id.
        destino_conversao: destinoAbsoluto,
        // REDE DE BAIXO (18/09/2026). `campaign_id`/`adset_id`/`ad_id`/
        // `utm_content` vazios são preenchidos pelo toque pago guardado antes
        // de o lead nascer — mesma ideia do resgate de `placement` no gatilho
        // (migration 20260911150000). Valor entregue pelo navegador sempre
        // manda; campo cheio não é tocado. Ver src/lib/atribuicaoPaga.ts.
        ...resgatarAtribuicaoDoLead(getUtmPayload()),
      };

      const leadId = crypto.randomUUID();
      let { error } = await supabase.from("leads").insert([{ id: leadId, ...dbData }]);
      if (error && /column|schema cache|PGRST204|42703/i.test(`${error.code} ${error.message}`)) {
        console.warn("[lead] insert sem colunas opcionais (migration pendente):", error.message);
        const {
          fbc: _a, user_agent: _b, page_url: _c, session_id: _d,
          score_breakdown: _e, score_version: _f, score_calculated_at: _g,
          // `destino_conversao` entra em 18/09/2026 e só existe depois da
          // migration 20260918180000. Sem esta linha, um deploy do site antes
          // da migration derrubaria TODO insert de lead.
          destino_conversao: _h,
          ...semColunasOpcionais
        } = dbData;
        ({ error } = await supabase.from("leads").insert([{ id: leadId, ...semColunasOpcionais }]));
      }
      if (error) throw error;

      try { localStorage.setItem("champion_lead_id", leadId); } catch { /* ignore */ }

      saveAdvancedMatching({ email: respostas.email, whatsapp: respostas.whatsapp, nome: respostas.nome_completo, leadId });

      const eventIds = eventIdsForLead(leadId);
      try {
        localStorage.setItem("champion_event_ids", JSON.stringify({
          lead_id: leadId,
          event_ids: eventIds,
          timestamp: Math.floor(Date.now() / 1000),
        }));
      } catch { /* ignore */ }

      // O destino já foi decidido lá em cima (ele vai junto do lead, em
      // `destino_conversao`). A página NÃO decide mais evento: MQL x Sprint no
      // pixel sai pela faixa (src/lib/conversaoPixel.ts), com a mesma regra do
      // fire-capi-events.

      // A página de obrigado abre com navegação COMPLETA (o pixel só aceita
      // advanced matching no init), e navegação completa cancela fetch comum.
      // Por isso tudo que não é esperado sai com keepalive.
      try {
        localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify({
          nome_completo: respostas.nome_completo,
          whatsapp: respostas.whatsapp,
          instagram: respostas.instagram,
          email: respostas.email,
          mercado: respostas.mercado,
          operacoes_ativas: null,
          investimento_faixa: respostas.investimento_faixa,
          dor_desejo: "",
        }));
      } catch { /* ignore */ }

      // `test_event_code` fora do domínio de produção (localhost, prévia do
      // Cloudflare): o evento aparece em "Testar eventos" no Gerenciador e o
      // Meta não o conta em métrica, entrega nem público. Em produção a chave
      // nem existe no corpo. Ver src/lib/ambienteMeta.ts.
      const codigoTeste = codigoDeTesteMeta();
      void postKeepalive(`${SUPABASE_URL}/functions/v1/fire-capi-events`, {
        lead_db_id: leadId,
        event_ids: eventIds,
        event_source_url: destinoAbsoluto,
        ...(codigoTeste ? { test_event_code: codigoTeste } : {}),
      });

      const utm = getUtmPayload();
      void postKeepalive(`${SUPABASE_URL}/rest/v1/quiz_leads`, [{
        name: respostas.nome_completo,
        phone: respostas.whatsapp,
        email: respostas.email,
        status: "Novo",
        answers: respostas,
        utm: {
          utm_source: utm.utm_source ?? null,
          utm_medium: utm.utm_medium ?? null,
          utm_campaign: utm.utm_campaign ?? null,
          utm_content: utm.utm_content ?? null,
          utm_term: utm.utm_term ?? null,
        },
      }], { Prefer: "return=minimal" });

      void postKeepalive(`${SUPABASE_URL}/functions/v1/send-quiz-data`, {
        name: respostas.nome_completo,
        phone: respostas.whatsapp,
        email: respostas.email,
        answers: respostas,
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        utm_campaign: utm.utm_campaign || null,
        utm_content: utm.utm_content || null,
      });

      // Única espera: evento `submit` + sessão completed (duas escritas curtas).
      // O notify-lead que o trackSubmit dispara já sai com keepalive.
      await comTeto(
        trackSubmit({
          name: respostas.nome_completo,
          whatsapp: respostas.whatsapp,
          instagram: respostas.instagram,
          market: respostas.mercado,
          stage: respostas.mercado,
          investimentoFaixa: respostas.investimento_faixa,
        }).catch((e) => console.warn("trackSubmit failed:", e)),
        ESPERA_MAX_BACKGROUND_MS,
      );

      window.location.assign(destino);
    } catch (error) {
      console.error("Error submitting lead:", error);
      enviandoRef.current = false;
      setEnviando(false);
      setFalhou(true);
    }
  }, [getUtmPayload, trackSubmit]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (enviandoRef.current) return;
    marcarInicio();
    setTentouEnviar(true);
    const encontrados = validar(dados);
    setErros(encontrados);
    const primeiroErro = ORDEM_CAMPOS.find((c) => encontrados[c]);
    if (primeiroErro) {
      const el = document.getElementById(ID_CAMPO[primeiroErro]);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    void enviar(dados);
  };

  // Rótulos em microcaixa-alta (11 px, tracking 0,14em), a mesma régua dos
  // botões e dos eyebrows. Campo com hairline de 1px em vez de borda de 2px.
  const labelCls = "block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5";
  const campoCls =
    "w-full h-11 text-base bg-input border border-border/70 rounded-xl px-3 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-4 focus-visible:ring-secondary/15 focus-visible:ring-offset-0 focus:border-secondary/80 focus:bg-secondary/[0.04] transition-[border-color,background-color,box-shadow]";
  const erroCls = "mt-1 text-xs text-destructive";
  const bordaErro = (c: Campo) => (erros[c] ? " border-destructive/80" : "");

  return (
    <div
      id={FORMULARIO_TOPO_ID}
      className="scroll-mt-24 relative w-full"
    >
      {/* Sem gradiente de borda e sem sombra dupla: uma hairline dourada basta
          (referência mattered). O card já se separa do fundo pelo tom. */}
      <div
        className="relative rounded-2xl border border-secondary/25 p-5 sm:p-6 md:p-7"
        style={{
          background: "hsl(var(--card) / 0.94)",
          boxShadow: "0 18px 50px -24px rgba(0, 0, 0, 0.75)",
        }}
      >
        <div className="mb-4 sm:mb-5">
          <p className="text-lg sm:text-xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", letterSpacing: "0.02em" }}>
            Fale com a gente
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-snug mt-1">
            Preencha os dados e nosso time te chama no WhatsApp.
          </p>
        </div>

        <form noValidate onSubmit={onSubmit} onFocusCapture={marcarInicio} className="space-y-3">
          <div>
            <label htmlFor={ID_CAMPO.nome_completo} className={labelCls}>Nome</label>
            <Input
              id={ID_CAMPO.nome_completo}
              className={campoCls + bordaErro("nome_completo")}
              placeholder="Seu nome completo"
              autoComplete="name"
              enterKeyHint="next"
              value={dados.nome_completo}
              aria-invalid={!!erros.nome_completo || undefined}
              onChange={(e) => atualizar("nome_completo", e.target.value)}
            />
            {erros.nome_completo && <p className={erroCls}>{erros.nome_completo}</p>}
          </div>

          <div>
            <label htmlFor={ID_CAMPO.email} className={labelCls}>E-mail</label>
            <Input
              id={ID_CAMPO.email}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              enterKeyHint="next"
              className={campoCls + bordaErro("email")}
              placeholder="seu@email.com"
              value={dados.email}
              aria-invalid={!!erros.email || undefined}
              onChange={(e) => atualizar("email", e.target.value)}
            />
            {erros.email && <p className={erroCls}>{erros.email}</p>}
          </div>

          <div>
            <label htmlFor={ID_CAMPO.whatsapp} className={labelCls}>Telefone (WhatsApp)</label>
            <PhoneField
              id={ID_CAMPO.whatsapp}
              value={dados.whatsapp}
              onChange={(e164) => atualizar("whatsapp", e164)}
              placeholder="(DDD) 99999-9999"
              showErrors={false}
              className={
                "[&_.phone-field-shell]:h-11 [&_.phone-field-shell]:rounded-xl [&_.phone-field-shell]:border [&_.phone-field-shell]:bg-input [&_.phone-field-shell:focus-within]:!border-secondary/80 [&_.phone-field-shell:focus-within]:shadow-[0_0_0_4px_hsl(var(--secondary)/0.15)]" +
                (erros.whatsapp ? " [&_.phone-field-shell]:border-destructive/80" : " [&_.phone-field-shell]:border-border/70")
              }
            />
            {erros.whatsapp && <p className={erroCls}>{erros.whatsapp}</p>}
          </div>

          <div>
            <label htmlFor={ID_CAMPO.instagram} className={labelCls}>Instagram</label>
            <Input
              id={ID_CAMPO.instagram}
              autoCapitalize="none"
              autoComplete="off"
              enterKeyHint="next"
              className={campoCls + bordaErro("instagram")}
              placeholder="@seuinstagram"
              value={dados.instagram}
              aria-invalid={!!erros.instagram || undefined}
              onChange={(e) => atualizar("instagram", e.target.value)}
            />
            {erros.instagram && <p className={erroCls}>{erros.instagram}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              {/* `sm:min-h` nos dois rótulos lado a lado: "Faturamento mensal
                  atual" quebra em duas linhas em caixa alta e desalinhava os
                  selects. */}
              <label htmlFor={ID_CAMPO.mercado} className={`${labelCls} sm:min-h-[2.9em]`}>Segmento</label>
              {/* Sem avanço automático: escolher só grava o valor. */}
              <Select value={dados.mercado} onValueChange={(v) => atualizar("mercado", v)}>
                <SelectTrigger
                  id={ID_CAMPO.mercado}
                  className={campoCls + " text-left" + bordaErro("mercado")}
                  aria-invalid={!!erros.mercado || undefined}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={6} className="bg-card border-border rounded-xl w-[var(--radix-select-trigger-width)] max-h-[min(460px,var(--radix-select-content-available-height))]">
                  {segmentos.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-foreground focus:bg-muted text-sm py-2.5">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.mercado && <p className={erroCls}>{erros.mercado}</p>}
            </div>

            <div className="min-w-0">
              <label htmlFor={ID_CAMPO.investimento_faixa} className={`${labelCls} sm:min-h-[2.9em]`}>Faturamento mensal atual</label>
              <Select value={dados.investimento_faixa} onValueChange={(v) => atualizar("investimento_faixa", v)}>
                <SelectTrigger
                  id={ID_CAMPO.investimento_faixa}
                  className={campoCls + " text-left" + bordaErro("investimento_faixa")}
                  aria-invalid={!!erros.investimento_faixa || undefined}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={6} className="bg-card border-border rounded-xl w-[var(--radix-select-trigger-width)] max-h-[min(460px,var(--radix-select-content-available-height))]">
                  {INVESTIMENTO_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-foreground focus:bg-muted text-sm py-2.5">
                      {/* Só o texto exibido ganha "/mês": o value gravado continua
                          igual, porque MQL e CAPI comparam a faixa literal. */}
                      {/\/m[eê]s\)?$/i.test(opt) ? opt : `${opt}/mês`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.investimento_faixa &&<p className={erroCls}>{erros.investimento_faixa}</p>}
            </div>
          </div>

          {falhou && (
            <p className="flex gap-2 text-xs sm:text-sm text-amber-400 border border-amber-500/25 bg-amber-500/5 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Tivemos um problema ao enviar. Seus dados continuam aqui, é só tentar de novo.</span>
            </p>
          )}

          {/* Único botão primário do topo. O `btn-shine` (faixa de luz em loop
              infinito) saiu: animação contínua no elemento mais importante da
              página é custo de bateria e ruído visual. */}
          <Botao
            type="submit"
            rotulo="Falar com um especialista"
            tamanho="lg"
            bloco
            className="mt-1"
            carregando={enviando}
            rotuloCarregando="Enviando..."
            data-track-click="cta_primary"
            data-track-id="form_topo_enviar"
          />

          <p className="flex items-start justify-center gap-1.5 text-[11px] text-muted-foreground/80 leading-snug text-center">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-secondary/80" />
            <span>Ao enviar, você concorda em receber contato da Champion pelo WhatsApp.</span>
          </p>
        </form>
      </div>
    </div>
  );
}
