import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PRESENCE_CHANNEL = "active_users";
const SESSION_KEY = "champion_session_id";

export interface PresenceState {
  session_id: string;
  ip_address: string;
  page: string;
  entered_at: string;
  device_type: string;
  user_agent: string;
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "Tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "Mobile";
  return "Desktop";
}

async function getClientIp(): Promise<string> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-client-ip`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: 'get_ip_only' }),
      }
    );
    if (response.ok) {
      const data = await response.json();
      return data.ip || 'unknown';
    }
  } catch (error) {
    console.error("Error getting client IP:", error);
  }
  return 'unknown';
}

export function usePresence() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ipRef = useRef<string>('unknown');

  useEffect(() => {
    let mounted = true;

    const initPresence = async () => {
      // Get IP address first
      ipRef.current = await getClientIp();
      
      if (!mounted) return;

      const sessionId = localStorage.getItem(SESSION_KEY) || 'anonymous';
      const currentPage = window.location.pathname;

      // Create presence channel
      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: {
          presence: {
            key: ipRef.current, // Use IP as the key for deduplication
          },
        },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          // Presence synced
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const presenceState: PresenceState = {
              session_id: sessionId,
              ip_address: ipRef.current,
              page: currentPage,
              entered_at: new Date().toISOString(),
              device_type: getDeviceType(),
              user_agent: navigator.userAgent,
            };
            
            await channel.track(presenceState);
          }
        });

      channelRef.current = channel;
    };

    initPresence();

    // Update presence on page change
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && channelRef.current) {
        const sessionId = localStorage.getItem(SESSION_KEY) || 'anonymous';
        await channelRef.current.track({
          session_id: sessionId,
          ip_address: ipRef.current,
          page: window.location.pathname,
          entered_at: new Date().toISOString(),
          device_type: getDeviceType(),
          user_agent: navigator.userAgent,
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, []);
}

// Hook for admin to monitor active users
// Combina Realtime Presence (ao vivo) + lead_sessions (fonte confiável dos últimos 2 min)
export function useActiveUsers() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [activeUsers, setActiveUsers] = useState<PresenceState[]>([]);
  const [presenceIps, setPresenceIps] = useState<Set<string>>(new Set());
  const [dbActiveSessions, setDbActiveSessions] = useState<PresenceState[]>([]);
  const [dbActiveIps, setDbActiveIps] = useState<Set<string>>(new Set());

  // Realtime presence (instantâneo)
  useEffect(() => {
    const channel = supabase.channel(PRESENCE_CHANNEL);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceState[] = [];
        const ips = new Set<string>();

        Object.values(state).forEach((presences) => {
          (presences as unknown[]).forEach((p) => {
            const presence = p as PresenceState;
            if (presence.ip_address) {
              users.push(presence);
              if (presence.ip_address !== 'unknown') {
                ips.add(presence.ip_address);
              }
            }
          });
        });

        setActiveUsers(users);
        setPresenceIps(ips);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, []);

  // Polling de lead_sessions (fonte confiável - últimos 2 minutos)
  useEffect(() => {
    let cancelled = false;

    const fetchActive = async () => {
      try {
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('lead_sessions')
          .select('id, ip_address, last_page, last_seen_at, device_type, user_agent')
          .gte('last_seen_at', twoMinAgo)
          .not('ip_address', 'is', null);

        if (error || cancelled || !data) return;

        const ips = new Set<string>();
        const sessions: PresenceState[] = [];

        for (const row of data) {
          const ip = (row.ip_address || '').trim();
          if (!ip || ip === 'unknown') continue;
          if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') continue;
          ips.add(ip);
          sessions.push({
            session_id: row.id,
            ip_address: ip,
            page: row.last_page || '/',
            entered_at: row.last_seen_at,
            device_type: row.device_type || 'Desktop',
            user_agent: row.user_agent || '',
          });
        }

        setDbActiveSessions(sessions);
        setDbActiveIps(ips);
      } catch (e) {
        console.error('[useActiveUsers] fetchActive error:', e);
      }
    };

    fetchActive();
    const interval = setInterval(fetchActive, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unionIps = new Set<string>([...presenceIps, ...dbActiveIps]);

  const combinedUsers: PresenceState[] = [...activeUsers];
  const seenIps = new Set(activeUsers.map(u => u.ip_address));
  for (const s of dbActiveSessions) {
    if (!seenIps.has(s.ip_address)) {
      combinedUsers.push(s);
      seenIps.add(s.ip_address);
    }
  }

  const getUsersWithDuration = () => {
    return combinedUsers.map(user => {
      const enteredAt = new Date(user.entered_at);
      const now = new Date();
      const diffMs = now.getTime() - enteredAt.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffSeconds = Math.floor((diffMs % 60000) / 1000);

      return {
        ...user,
        duration: diffMinutes > 0 ? `${diffMinutes}m ${diffSeconds}s` : `${diffSeconds}s`,
        durationMs: diffMs,
      };
    });
  };

  return {
    activeUsers: combinedUsers,
    uniqueCount: unionIps.size || combinedUsers.length,
    users: combinedUsers,
    getUsersWithDuration,
  };
}
