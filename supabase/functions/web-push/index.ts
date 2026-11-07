import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { sendPushNotification, deserializeVapidKeys } from "npm:web-push-browser@1.4.2";
import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
import { chavePrivadaPkcs8, contatoVapid, parDeChavesConfere } from "../_shared/vapid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdminToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const jwtSecret = Deno.env.get("ADMIN_JWT_SECRET");
    if (!jwtSecret) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const payload = await verify(token, key);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// A antiga `extractRawPrivateKey` convertia a chave PKCS8 para raw antes de a
// entregar ao web-push-browser, que só aceita PKCS8: todo envio dava 500
// ("expected valid PKCS#8 data"). Ver _shared/vapid.ts.

/**
 * Web Push Edge Function
 *
 * POST /subscribe - Save a push subscription
 * POST /unsubscribe - Remove a push subscription
 * POST /send - Send push notification to all subscribers
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/web-push/, "");

    // ── Saúde das chaves (pública, não envia nada) ──
    // Responde se o servidor CONSEGUE assinar um push, sem mandar notificação a
    // ninguém e sem expor chave. Foi a pergunta que ficou sem resposta de 03/09
    // a 14/09: todo envio dava 500 e só os logs sabiam.
    if (req.method === "GET" && pathname === "/status") {
      const pub = Deno.env.get("VAPID_PUBLIC_KEY");
      const priv = Deno.env.get("VAPID_PRIVATE_KEY");
      let vapid = "ok";
      try {
        if (!pub || !priv) throw new Error("chaves VAPID ausentes nos secrets");
        const par = await deserializeVapidKeys({ publicKey: pub.trim(), privateKey: await chavePrivadaPkcs8(priv, pub) });
        if (!(await parDeChavesConfere(par))) throw new Error("VAPID_PRIVATE_KEY não corresponde à VAPID_PUBLIC_KEY");
      } catch (e) {
        vapid = e instanceof Error ? e.message : String(e);
      }
      return new Response(JSON.stringify({ vapid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Rotas chamadas pelo SERVICE WORKER ──
    // O service worker não tem o token de admin (roda sem aba, sem login). A
    // credencial aqui é o próprio endpoint da inscrição: uma URL longa e
    // secreta que só o aparelho e o nosso banco conhecem. Quem não a tem não
    // consegue mexer em linha nenhuma.
    if (req.method === "POST" && (pathname === "/recebido" || pathname === "/renovar")) {
      const db = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      const corpo = await req.json().catch(() => ({}));
      const json = (obj: unknown, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (pathname === "/recebido") {
        // "Enviado" é o servidor de push aceitar; "recebido" é o aparelho
        // mostrar. Só esta confirmação diz qual celular está de fato tocando.
        if (!corpo.endpoint) return json({ error: "endpoint obrigatório" }, 400);
        const { error } = await db
          .from("push_subscriptions")
          .update({ last_received_at: new Date().toISOString(), last_received_id: corpo.id ? String(corpo.id).slice(0, 64) : null })
          .eq("endpoint", corpo.endpoint);
        if (error) console.error("recebido:", error.message);
        return json({ ok: !error });
      }

      // /renovar — o navegador trocou a inscrição sozinho (pushsubscriptionchange).
      const nova = corpo.nova;
      if (!corpo.antigo || !nova?.endpoint || !nova?.keys?.p256dh || !nova?.keys?.auth) {
        return json({ error: "dados incompletos" }, 400);
      }
      const { data: linha } = await db
        .from("push_subscriptions")
        .select("pessoa, user_label")
        .eq("endpoint", corpo.antigo)
        .maybeSingle();
      if (!linha) return json({ error: "inscrição antiga desconhecida" }, 404);
      await db.from("push_subscriptions").delete().eq("endpoint", corpo.antigo);
      const { error } = await db.from("push_subscriptions").upsert(
        {
          endpoint: nova.endpoint,
          p256dh: nova.keys.p256dh,
          auth: nova.keys.auth,
          pessoa: linha.pessoa,
          user_label: linha.user_label,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
      if (error) console.error("renovar:", error.message);
      return json({ ok: !error });
    }

    // Duas portas de entrada, e a segunda é a correção do bug que fazia o push
    // nunca chegar: o `notify-lead` chamava /send com o service role no header
    // Authorization, e esta função só olhava para `x-admin-token` com JWT de
    // admin. Todo lead tomava 401 em silêncio, mesmo que houvesse aparelho
    // inscrito. Agora as functions internas se identificam pelo segredo que já
    // usam entre si.
    const segredoInterno = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    const ehChamadaInterna = !!segredoInterno &&
      req.headers.get("x-webhook-secret") === segredoInterno;
    const isAdmin = ehChamadaInterna ||
      await verifyAdminToken(req.headers.get("x-admin-token"));
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── List active subscriptions ──
    if (pathname === "/subscriptions" && req.method === "GET") {
      // `last_received_at` nasce na migration 20260914120000. Sem ela a
      // consulta com a coluna falha, então cai para a lista antiga em vez de
      // derrubar o contador do painel.
      let { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, pessoa, user_label, device_id, last_used_at, last_received_at, created_at")
        .order("created_at", { ascending: false });
      if (error) {
        ({ data, error } = await supabase
          .from("push_subscriptions")
          .select("id, endpoint, pessoa, user_label, last_used_at, created_at")
          .order("created_at", { ascending: false }));
      }

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to list subscriptions" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          count: data?.length || 0,
          subscriptions: (data || []).map((s) => ({
            id: s.id,
            device_id: (s as { device_id?: string | null }).device_id ?? null,
            pessoa: s.pessoa,
            label: s.user_label,
            last_used_at: s.last_used_at,
            last_received_at: (s as { last_received_at?: string | null }).last_received_at ?? null,
            created_at: s.created_at,
            endpoint_host: (() => {
              try { return new URL(s.endpoint).hostname; } catch { return null; }
            })(),
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();

      // ── Subscribe ──
      if (pathname === "/subscribe" || pathname === "" || pathname === "/") {
        const { endpoint, keys, label, pessoa, device_id } = body;
        // Nomes fechados: `pessoa` entra em filtro do PostgREST mais abaixo.
        const PESSOAS_VALIDAS = ["Miguel", "Caio", "Guguinha", "Rodger"];
        const nomeRecebido: string | null = PESSOAS_VALIDAS.includes(pessoa) ? pessoa : null;
        const deviceId: string | null =
          typeof device_id === "string" && /^[0-9a-f-]{36}$/i.test(device_id) ? device_id : null;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          return new Response(
            JSON.stringify({ error: "Missing subscription data" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Dono: o que veio; senão o que esta inscrição ou este aparelho já
        // tinham. A reconciliação da abertura manda sem nome quando o
        // localStorage não tem, e isso não pode apagar o dono de ninguém.
        let dono: string | null = nomeRecebido;
        if (!dono) {
          const { data: mesma } = await supabase
            .from("push_subscriptions").select("pessoa").eq("endpoint", endpoint).maybeSingle();
          dono = mesma?.pessoa ?? null;
        }
        if (!dono && deviceId) {
          const { data: doAparelho } = await supabase
            .from("push_subscriptions").select("pessoa").eq("device_id", deviceId).not("pessoa", "is", null).limit(1);
          dono = doAparelho?.[0]?.pessoa ?? null;
        }

        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            user_label: label || null,
            pessoa: dono,
            device_id: deviceId,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

        // Uma linha por aparelho. Sem isto cada endpoint novo (reinstalar o
        // app, o iOS refazer a inscrição) virava mais uma linha na lista.
        if (!error) {
          if (deviceId) {
            await supabase.from("push_subscriptions").delete().eq("device_id", deviceId).neq("endpoint", endpoint);
          }
          if (label && dono) {
            // Mesmo dono no mesmo modelo de aparelho: é o app reinstalado
            // (localStorage zerado, device_id novo). Pessoas diferentes com o
            // mesmo iPhone não se tocam: o filtro é pelo nome.
            await supabase.from("push_subscriptions").delete()
              .eq("user_label", label).eq("pessoa", dono).neq("endpoint", endpoint);
          }
          if (label) {
            // Linhas antigas sem device_id e sem dono do mesmo modelo: as
            // sobras de antes desta correção.
            await supabase.from("push_subscriptions").delete()
              .eq("user_label", label).is("device_id", null).is("pessoa", null).neq("endpoint", endpoint);
          }
        }

        if (error) {
          console.error("Error saving subscription:", error);
          return new Response(
            JSON.stringify({ error: "Failed to save subscription" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        console.log("Push subscription saved:", endpoint.slice(0, 60) + "...");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Remover um aparelho da lista (painel) ──
      if (pathname === "/remover") {
        const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
        if (!id) {
          return new Response(JSON.stringify({ error: "id inválido" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
        return new Response(JSON.stringify({ success: !error }), {
          status: error ? 500 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Unsubscribe ──
      if (pathname === "/unsubscribe") {
        const { endpoint } = body;

        if (!endpoint) {
          return new Response(
            JSON.stringify({ error: "Missing endpoint" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);

        console.log("Push subscription removed:", endpoint.slice(0, 60) + "...");
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Send push notification ──
      if (pathname === "/send") {
        const { title, body: notifBody, url: notifUrl, sound, tag, pessoas, tipo, dados, ttl, urgency, endpoints } = body;
        // Alvo por APARELHO: o botão Testar toca só em quem clicou, não no time.
        const alvosEndpoint: string[] = Array.isArray(endpoints)
          ? endpoints.filter((e: unknown) => typeof e === "string" && e.startsWith("https://"))
          : [];

        // Tipo do aviso decide quanto tempo o servidor de push segura a
        // mensagem para um aparelho desligado. Lead de 12h atrás ainda é lead
        // esperando resposta; pedido de atualização vale uma semana; teste
        // velho só confunde.
        const TIPOS = ["lead", "sla", "atualizar", "reinstalar", "teste", "aviso"];
        const tipoAviso: string = TIPOS.includes(tipo) ? tipo : "aviso";
        const TTL_PADRAO: Record<string, number> = {
          lead: 12 * 3600, sla: 2 * 3600, atualizar: 7 * 86400, reinstalar: 7 * 86400, teste: 3600, aviso: 86400,
        };
        const ttlSegundos = Number.isFinite(Number(ttl)) && Number(ttl) > 0
          ? Math.min(Number(ttl), 28 * 86400)
          : TTL_PADRAO[tipoAviso];
        // Urgency "high" é o que faz o Android entregar na hora mesmo em modo
        // soneca (Doze). Sem o cabeçalho o FCM trata como "normal" e pode
        // segurar até a próxima janela de manutenção do aparelho.
        const urgencia = ["very-low", "low", "normal", "high"].includes(urgency) ? urgency : "high";

        // A quem mandar. Lista vazia ou ausente mantém o comportamento antigo
        // (todo mundo), que é o que o alerta de venda e de reunião ainda usa:
        // venda é notícia da casa inteira, lead é responsabilidade de alguém.
        const alvos: string[] = Array.isArray(pessoas)
          ? pessoas.map((p: unknown) => String(p).trim()).filter(Boolean)
          : [];

        // Get VAPID keys
        const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
        const vapidPrivateKeyRaw = Deno.env.get("VAPID_PRIVATE_KEY");
        // Só o endereço: a biblioteca põe o "mailto:" (ver contatoVapid).
        const vapidSubject = contatoVapid(Deno.env.get("VAPID_SUBJECT"));

        if (!vapidPublicKey || !vapidPrivateKeyRaw) {
          console.log("VAPID keys not configured. Push notification skipped.");
          return new Response(
            JSON.stringify({
              success: false,
              stubbed: true,
              message: "VAPID keys not configured.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Get subscriptions — filtradas por pessoa quando o chamador pediu
        let consulta = supabase.from("push_subscriptions").select("*");
        if (alvosEndpoint.length > 0) consulta = consulta.in("endpoint", alvosEndpoint);
        else if (alvos.length > 0) consulta = consulta.in("pessoa", alvos);
        const { data: subscriptions, error } = await consulta;

        if (error || !subscriptions?.length) {
          console.log(`No push subscribers found${alvos.length ? ` for: ${alvos.join(", ")}` : ""}`);
          return new Response(
            JSON.stringify({
              success: true,
              sent: 0,
              // Dizer PARA QUEM não havia aparelho: "0 enviados" sem nome é
              // indistinguível de "ninguém ativou ainda", e as duas situações
              // pedem ações diferentes.
              alvos,
              message: alvos.length ? `Ninguém inscrito para: ${alvos.join(", ")}` : "No subscribers",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        console.log(`Sending push to ${subscriptions.length} subscriber(s)`);

        // Chaves no formato que a biblioteca aceita, e conferidas como PAR.
        let keyPair: { publicKey: CryptoKey; privateKey: CryptoKey };
        try {
          keyPair = await deserializeVapidKeys({
            publicKey: vapidPublicKey.trim(),
            privateKey: await chavePrivadaPkcs8(vapidPrivateKeyRaw, vapidPublicKey),
          });
          if (!(await parDeChavesConfere(keyPair))) {
            throw new Error("VAPID_PRIVATE_KEY não corresponde à VAPID_PUBLIC_KEY");
          }
        } catch (e) {
          const motivo = e instanceof Error ? e.message : String(e);
          console.error("Chave VAPID inválida:", motivo);
          return new Response(
            JSON.stringify({ error: `Chave VAPID inválida: ${motivo}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Unique tag per send so notifications STACK on the desktop
        const uniqueTag = tag || `champion-${Date.now()}`;

        const envioId = crypto.randomUUID();
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const payload = JSON.stringify({
          id: envioId,
          tipo: tipoAviso,
          dados: dados && typeof dados === "object" ? dados : null,
          title: title || "Novo lead no Champion",
          body: notifBody || "Você tem um novo lead!",
          url: notifUrl || "/admin",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: uniqueTag,
          sound: sound || null,
          requireInteraction: true,
          // Para onde o service worker confirma que mostrou. A chave é a
          // pública (anon), a mesma que já vai no bundle do site.
          recibo: {
            url: `${supabaseUrl}/functions/v1/web-push/recebido`,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
        });

        let sentCount = 0;
        const failedEndpoints: string[] = [];
        const porPessoa: Record<string, { enviados: number; falhas: number }> = {};

        // Em paralelo: em série, um endpoint lento (celular com rede ruim no
        // servidor de push) atrasava o lead de todos os outros aparelhos.
        await Promise.all(subscriptions.map(async (sub) => {
          const quem = sub.pessoa || "(sem dono)";
          porPessoa[quem] ??= { enviados: 0, falhas: 0 };
          try {
            const res = await sendPushNotification(
              keyPair,
              { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
              vapidSubject,
              payload,
              { algorithm: "aes128gcm", ttl: ttlSegundos, urgency: urgencia }
            );

            if (res.ok) {
              sentCount++;
              porPessoa[quem].enviados++;
            } else {
              porPessoa[quem].falhas++;
              const statusCode = res.status;
              console.error(`Push failed (${statusCode}) for ${quem}: ${sub.endpoint.slice(0, 50)}... ${await res.text().catch(() => "")}`);
              // 404/410 = inscrição morta (app desinstalado, permissão revogada)
              if (statusCode === 404 || statusCode === 410) {
                failedEndpoints.push(sub.endpoint);
              }
            }
          } catch (err) {
            porPessoa[quem].falhas++;
            console.error(`Push error for ${sub.endpoint.slice(0, 50)}:`, err);
          }
        }));

        // Cleanup expired subscriptions
        if (failedEndpoints.length > 0) {
          console.log(
            `Removing ${failedEndpoints.length} expired subscription(s)`
          );
          await supabase
            .from("push_subscriptions")
            .delete()
            .in("endpoint", failedEndpoints);
        }

        // Update last_used_at for successful sends
        if (sentCount > 0) {
          const activeEndpoints = subscriptions
            .map((s) => s.endpoint)
            .filter((e) => !failedEndpoints.includes(e));

          await supabase
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .in("endpoint", activeEndpoints);
        }

        console.log(
          `Push complete: ${sentCount}/${subscriptions.length} sent, ${failedEndpoints.length} expired`
        );

        return new Response(
          JSON.stringify({
            success: true,
            id: envioId,
            tipo: tipoAviso,
            sent: sentCount,
            total: subscriptions.length,
            expired: failedEndpoints.length,
            por_pessoa: porPessoa,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Web Push error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
