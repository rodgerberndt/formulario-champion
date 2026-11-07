// Service Worker do painel — existe para o PUSH, não para cache.
//
// Por que o push mora aqui e não na aba:
// a aba do painel é tratada pelo navegador como qualquer outra. Em segundo
// plano o Chrome estrangula os timers (um tique por minuto depois de 5 min
// escondida) e o "Economia de memória" DESCARTA a aba inteira — o polling de
// 15s simplesmente para de existir. O service worker não depende de aba: o
// navegador acorda ele quando o servidor de push entrega a mensagem, mesmo com
// o painel fechado, minimizado ou com outra aba em foco.
//
// Não faz cache de páginas, assets ou requisições: o navegador sempre busca
// tudo direto da rede. A única coisa guardada é a configuração do Supabase
// (CONFIG_CACHE), que o service worker precisa para confirmar recebimento e
// renovar a inscrição sem nenhuma aba aberta.

const CONFIG_CACHE = "champion-sw-config";
const CONFIG_URL = "/__champion_sw_config__";
const ADMIN_PATH = "/admin";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CONFIG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Configuração vinda da página ────────────────────────────────────────────
// A página manda a URL do Supabase e a chave pública ao abrir. Sem isso o
// service worker não teria como avisar o servidor quando a inscrição for trocada
// pelo navegador (pushsubscriptionchange acontece sem aba nenhuma aberta).
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.tipo === "config" && msg.supabaseUrl) {
    event.waitUntil(
      caches.open(CONFIG_CACHE).then((cache) =>
        cache.put(
          CONFIG_URL,
          new Response(JSON.stringify({ supabaseUrl: msg.supabaseUrl, apikey: msg.apikey || "" }), {
            headers: { "Content-Type": "application/json" },
          })
        )
      )
    );
  }
});

async function lerConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const res = await cache.match(CONFIG_URL);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

async function avisarAbas(mensagem) {
  try {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const aba of abas) aba.postMessage({ origem: "champion-sw", ...mensagem });
  } catch {
    // aba nenhuma aberta: nada a avisar
  }
}

/**
 * Confirma ao servidor que ESTE aparelho recebeu o push.
 *
 * "Enviado" (o servidor de push aceitou) não é "chegou": o Chrome parado, o
 * celular em economia de bateria ou o app desinstalado aceitam a mensagem e
 * nunca mostram nada. Só a confirmação vinda daqui diz, no painel, qual
 * aparelho está de fato recebendo.
 */
async function confirmarRecebimento(data) {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub || !data.id) return;
    const cfg = data.recibo || (await lerConfig());
    const base = cfg && (cfg.url || (cfg.supabaseUrl && `${cfg.supabaseUrl}/functions/v1/web-push/recebido`));
    if (!base) return;
    const headers = { "Content-Type": "application/json" };
    if (cfg.apikey) headers.apikey = cfg.apikey;
    await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ endpoint: sub.endpoint, id: data.id }),
    });
  } catch {
    // recibo é diagnóstico; a notificação já foi mostrada
  }
}

function tipoDoPush(data) {
  if (data.tipo) return data.tipo;
  // Função web-push antiga não repassa `tipo`, só a URL. Ler o pedido de
  // atualização pela URL mantém o botão funcionando mesmo antes do deploy do
  // backend.
  const url = String(data.url || "");
  if (url.includes("reinstalar=")) return "reinstalar";
  if (url.includes("atualizar=")) return "atualizar";
  return "aviso";
}

// ── Push ─────────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  event.waitUntil(tratarPush(event));
});

async function tratarPush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch {
      data = {};
    }
  }

  const tipo = tipoDoPush(data);
  const title = data.title || "Champion";
  // Lead usa tag fixa (lead-<whatsapp>): o mesmo lead avisado pelo push e pelo
  // polling da aba vira UMA notificação, não duas. O resto empilha.
  const tag = data.tag || `champion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // As abas abertas ficam sabendo antes de a notificação aparecer: é assim que
  // o polling local deixa de repetir o mesmo lead e que o pedido de atualização
  // recarrega o painel que está aberto.
  await avisarAbas({ tipo: "push", tipoPush: tipo, tag, dados: data.dados || null });

  let jaExiste = false;
  try {
    jaExiste = (await self.registration.getNotifications({ tag })).length > 0;
  } catch {
    jaExiste = false;
  }

  await self.registration.showNotification(title, {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag,
    // Repetido (mesma tag já na tela) substitui calado; novo toca e vibra.
    renotify: !jaExiste,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
    data: { ...data, tipo, url: data.url || ADMIN_PATH },
  });

  await confirmarRecebimento(data);
}

// ── Clique na notificação ────────────────────────────────────────────────────
// Foca o painel já aberto (ou abre um). Pedido de atualização/reinstalação
// navega para a URL do pedido, que é o que força o HTML novo a carregar.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const destino = new URL(data.url || ADMIN_PATH, self.location.origin).href;
  const navegar = data.tipo === "atualizar" || data.tipo === "reinstalar";

  event.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const painel = abas.find((aba) => {
        try {
          return new URL(aba.url).pathname.startsWith(ADMIN_PATH);
        } catch {
          return false;
        }
      });
      if (painel) {
        // focus() primeiro: a permissão de trazer a janela para frente vale só
        // enquanto dura o clique, e navigate() gasta esse tempo.
        const focada = await painel.focus().catch(() => painel);
        if (navegar && focada && "navigate" in focada) {
          await focada.navigate(destino).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(destino);
    })()
  );
});

// ── Inscrição trocada pelo navegador ────────────────────────────────────────
// Firefox e, às vezes, o Chrome rodam a chave de push sozinhos. Sem este
// handler a linha no banco fica com o endpoint morto e o aparelho para de
// receber sem ninguém perceber — até o dia em que um lead não toca.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const antiga = event.oldSubscription;
      let nova = event.newSubscription;
      try {
        if (!nova) {
          const chave = antiga && antiga.options && antiga.options.applicationServerKey;
          if (!chave) return;
          nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
        }
        const cfg = await lerConfig();
        if (!cfg || !antiga || !nova) return;
        const headers = { "Content-Type": "application/json" };
        if (cfg.apikey) headers.apikey = cfg.apikey;
        await fetch(`${cfg.supabaseUrl}/functions/v1/web-push/renovar`, {
          method: "POST",
          headers,
          body: JSON.stringify({ antigo: antiga.endpoint, nova: nova.toJSON() }),
        });
      } catch {
        // na próxima abertura do painel a reconciliação reenvia a inscrição
      }
    })()
  );
});
