// Chave VAPID privada em qualquer formato comum -> PKCS8 base64url.
//
// O web-push-browser só aceita PKCS8 (`deserializeVapidKeys` faz
// importKey("pkcs8")). O web-push antigo convertia a chave PKCS8 para "raw" (o
// `d` de 32 bytes) ANTES de entregar à biblioteca, e toda chamada estourava com
// "expected valid PKCS#8 data". Resultado medido nos logs em 14/09/2026: todo
// push de lead desde que a função existe respondeu 500 — nenhum chegou a
// aparelho nenhum. Aqui a chave é levada ao formato certo venha como vier:
// PKCS8 (base64 ou base64url), PEM, raw de 32 bytes, SEC1 ou JWK.
//
// Sem APIs do Deno: roda igual no edge e no teste local em Node.

const CURVA = { name: "ECDSA", namedCurve: "P-256" } as const;

function paraBytes(s: string): Uint8Array {
  const limpo = s.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(limpo + "=".repeat((4 - (limpo.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function paraBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `d` de 32 bytes dentro de uma ECPrivateKey SEC1 (30 77 02 01 01 04 20 <d>). */
function dDoSec1(der: Uint8Array): Uint8Array | null {
  for (let i = 0; i + 34 < der.length; i++) {
    if (der[i] === 0x02 && der[i + 1] === 0x01 && der[i + 2] === 0x01 && der[i + 3] === 0x04 && der[i + 4] === 0x20) {
      return der.slice(i + 5, i + 37);
    }
  }
  return null;
}

async function pkcs8DoD(d: Uint8Array, publica: string): Promise<string> {
  const pub = paraBytes(publica);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY não é uma chave P-256 raw (65 bytes)");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: paraBase64Url(d),
    x: paraBase64Url(pub.slice(1, 33)),
    y: paraBase64Url(pub.slice(33, 65)),
    ext: true,
  };
  const chave = await crypto.subtle.importKey("jwk", jwk, CURVA, true, ["sign"]);
  return paraBase64Url(await crypto.subtle.exportKey("pkcs8", chave));
}

export async function chavePrivadaPkcs8(privada: string, publica: string): Promise<string> {
  const txt = privada.trim();

  if (txt.startsWith("{")) {
    const chave = await crypto.subtle.importKey("jwk", JSON.parse(txt), CURVA, true, ["sign"]);
    return paraBase64Url(await crypto.subtle.exportKey("pkcs8", chave));
  }

  const bytes = paraBytes(txt);
  if (bytes.length === 32) return pkcs8DoD(bytes, publica);

  try {
    await crypto.subtle.importKey("pkcs8", bytes, CURVA, true, ["sign"]);
    return paraBase64Url(bytes);
  } catch {
    const d = dDoSec1(bytes);
    if (d) return pkcs8DoD(d, publica);
    throw new Error(`VAPID_PRIVATE_KEY em formato desconhecido (${bytes.length} bytes)`);
  }
}

/**
 * O `sub` do JWT VAPID, SEM o "mailto:".
 *
 * O web-push-browser monta `mailto:${email}` sozinho, e o secret VAPID_SUBJECT
 * já vem como "mailto:rodger...". O token saía com "mailto:mailto:...": o
 * Google aceita calado, a Apple responde 403 BadJwtToken e o iPhone nunca
 * recebe (medido em 14/09/2026, push para web.push.apple.com).
 */
export function contatoVapid(subject: string | undefined | null): string {
  const limpo = String(subject || "").trim().replace(/^mailto:/i, "").trim();
  return limpo.includes("@") ? limpo : "admin@championadstudio.com";
}

/**
 * A privada assina, a pública confere. Chave trocada (par de outra geração)
 * passa em todo import e só falha no servidor de push, como 401/403 sem
 * explicação; aqui ela vira uma mensagem clara antes de qualquer envio.
 */
export async function parDeChavesConfere(par: { publicKey: CryptoKey; privateKey: CryptoKey }): Promise<boolean> {
  const dado = new TextEncoder().encode("champion-vapid");
  const alg = { name: "ECDSA", hash: "SHA-256" };
  const assinatura = await crypto.subtle.sign(alg, par.privateKey, dado);
  return crypto.subtle.verify(alg, par.publicKey, assinatura, dado);
}
