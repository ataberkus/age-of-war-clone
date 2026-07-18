import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { setLocalQueueCancelHandler } from '../game/production-engine';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type Role = 'host' | 'guest';

export interface MpAction {
  type: 'buyUnit' | 'buyTurret' | 'evolve' | 'special' | 'cancelUnit';
  idx?: number;
}

export function getClientId(): string {
  // per-tab id: presence keys must be unique per connection
  let id = sessionStorage.getItem('aow-tab-id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('aow-tab-id', id);
  }
  return id;
}

export function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

/**
 * A match session over a Supabase Realtime channel.
 * The channel topic doubles as the room code — no database needed.
 */
export class Session {
  readonly role: Role;
  readonly code: string;
  readonly clientId: string;
  channel: RealtimeChannel;

  /** wire-level message handler (broadcast events) */
  onMessage: ((event: string, payload: unknown) => void) | null = null;
  /** called when the other player leaves the channel */
  onPeerLeave: (() => void) | null = null;

  private constructor(role: Role, code: string, channel: RealtimeChannel, clientId: string) {
    this.role = role;
    this.code = code;
    this.channel = channel;
    this.clientId = clientId;
  }

  static open(code: string, role: Role): Promise<Session> {
    const clientId = getClientId();
    const channel = supabase.channel(`match:${code}`, {
      config: {
        presence: { key: clientId },
        broadcast: { self: false, ack: false },
      },
    });
    const session = new Session(role, code, channel, clientId);
    if (role === 'guest') {
      setLocalQueueCancelHandler((queueIndex) => {
        session.send('action', { type: 'cancelUnit', idx: queueIndex });
      });
    }

    channel
      .on('broadcast', { event: '*' }, ({ event, payload }) => {
        session.onMessage?.(event, payload);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== clientId) session.onPeerLeave?.();
      });

    return new Promise((resolve, reject) => {
      let settled = false;
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true;
          try {
            await channel.track({ role });
            resolve(session);
          } catch (e) {
            reject(e);
          }
        } else if (status === 'CHANNEL_ERROR' && !settled) {
          settled = true;
          reject(new Error('Could not connect to matchmaking server'));
        } else if (status === 'TIMED_OUT' && !settled) {
          settled = true;
          reject(new Error('Connection timed out'));
        }
      });
    });
  }

  send(event: string, payload: unknown = {}) {
    void this.channel.send({ type: 'broadcast', event, payload });
  }

  hasPeerWithRole(role: Role): boolean {
    const state = this.channel.presenceState();
    return Object.values(state).some((metas) =>
      (metas as Array<{ role?: string }>).some((m) => m.role === role),
    );
  }

  close() {
    if (this.role === 'guest') setLocalQueueCancelHandler(null);
    void supabase.removeChannel(this.channel);
  }
}
