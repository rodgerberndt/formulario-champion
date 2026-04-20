import { useEffect } from "react";

const SESSION_KEY = "champion_session_id";
const CLICK_ID_KEY = "champion_click_id";
const HIT_FIRED_KEY = "champion_landing_hit_fired";
const CLICK_ID_TTL_MS = 30 * 60 * 1000; // 30 min

interface StoredClickId {
  id: string;
  ts: number;
}

function readClickId(): string | null {
  try {
    const raw = sessionStorage.getItem(CLICK_ID_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClickId;
    if (!parsed?.id || Date.now() - parsed.ts > CLICK_ID_TTL_MS) {
      sessionStorage.removeItem(CLICK_ID_KEY);
      return null;
    }
    return parsed.id;
  } catch {
    return null;
  }
}

function writeClickId(id: string) {
  try {
    sessionStorage.setItem(CLICK_ID_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function generateClickId(): string {
  const id =
    (crypto.randomUUID?.() as string) ||
    `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  writeClickId(id);
  return id;
}

export function getOrCreateClickId(): string {
  return readClickId() || generateClickId();
}

function pickUtm() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const get = (k: string) => sp.get(k);
    return {
      utm_source: get("utm_source"),
      utm_medium: get("utm_medium"),
      utm_campaign: get("utm_campaign"),
      utm_content: get("utm_content"),
      utm_term: get("utm_term"),
      fbclid: get("fbclid"),
      gclid: get("gclid"),
      ttclid: get("ttclid"),
    };
  } catch {
    return {};
  }
}

export function fireLandingHit(force = false) {
  try {
    if (!force && sessionStorage.getItem(HIT_FIRED_KEY) === "1") return;
    sessionStorage.setItem(HIT_FIRED_KEY, "1");

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    if (!projectId) return;
    const url = `https://${projectId}.supabase.co/functions/v1/landing-hit`;

    const payload = {
      session_id: localStorage.getItem(SESSION_KEY),
      click_id: readClickId(),
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      ...pickUtm(),
    };

    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });

    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export function useLandingHit() {
  useEffect(() => {
    // Dispara o mais cedo possível
    if (document.readyState === "loading") {
      const fire = () => fireLandingHit();
      document.addEventListener("DOMContentLoaded", fire, { once: true });
      return () => document.removeEventListener("DOMContentLoaded", fire);
    }
    fireLandingHit();
  }, []);
}
