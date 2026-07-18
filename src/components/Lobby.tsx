import { useEffect, useRef, useState } from 'react';
import { Session, makeCode } from '../mp/session';
import type { Role } from '../mp/session';
import { playSfx } from '../game/audio';

interface Props {
  onStart: (session: Session, role: Role) => void;
  onBack: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'waiting'; code: string }
  | { kind: 'joining' }
  | { kind: 'error'; message: string };

export default function Lobby({ onStart, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [codeInput, setCodeInput] = useState('');
  const sessionRef = useRef<Session | null>(null);
  const timersRef = useRef<number[]>([]);
  // once the match starts, ownership of the channel moves to the Game —
  // the lobby must NOT close it on unmount
  const handedOffRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!handedOffRef.current) sessionRef.current?.close();
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const createMatch = async () => {
    playSfx('click');
    const code = makeCode();
    setPhase({ kind: 'waiting', code });
    try {
      const s = await Session.open(code, 'host');
      sessionRef.current = s;
      s.onMessage = (event) => {
        if (event === 'join') {
          s.send('start', {});
          playSfx('evolve');
          handedOffRef.current = true;
          onStart(s, 'host');
        }
      };
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Connection failed' });
    }
  };

  const joinMatch = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) return;
    playSfx('click');
    setPhase({ kind: 'joining' });
    try {
      const s = await Session.open(code, 'guest');
      sessionRef.current = s;
      let started = false;
      s.onMessage = (event) => {
        if (event === 'start' && !started) {
          started = true;
          timersRef.current.forEach((t) => window.clearTimeout(t));
          playSfx('evolve');
          handedOffRef.current = true;
          onStart(s, 'guest');
        }
      };
      // ping until the host answers (broadcast has no delivery guarantee)
      const ping = () => {
        if (started) return;
        s.send('join', {});
        timersRef.current.push(window.setTimeout(ping, 2000));
      };
      ping();
      // no host in the room at all? bail early — but give presence time to sync
      const checkHost = (attempt: number) => {
        if (started) return;
        if (s.hasPeerWithRole('host')) {
          // host is there — keep pinging until it answers (up to ~14s total)
          if (attempt > 7) {
            s.close();
            setPhase({ kind: 'error', message: 'The host is not responding. Try again.' });
            return;
          }
          timersRef.current.push(window.setTimeout(() => checkHost(attempt + 1), 2000));
        } else {
          if (attempt >= 3) {
            s.close();
            setPhase({ kind: 'error', message: `No open match found with code "${code}".` });
            return;
          }
          timersRef.current.push(window.setTimeout(() => checkHost(attempt + 1), 1500));
        }
      };
      timersRef.current.push(window.setTimeout(() => checkHost(1), 2000));
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Connection failed' });
    }
  };

  const cancelWaiting = () => {
    playSfx('click');
    sessionRef.current?.close();
    sessionRef.current = null;
    setPhase({ kind: 'idle' });
  };

  const waiting = phase.kind === 'waiting';

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-gradient-to-b from-stone-950 via-stone-900 to-indigo-950 px-4 py-8 text-white">
      <div className="text-center">
        <div className="mb-1 text-5xl">🌐</div>
        <h1 className="bg-gradient-to-b from-sky-200 via-sky-400 to-indigo-600 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
          1V1 ONLINE
        </h1>
        <p className="mt-2 text-sm text-stone-400">Challenge a friend — first to destroy the enemy base wins</p>
      </div>

      <div className="mt-8 w-full max-w-sm space-y-4">
        {/* create */}
        <div className="rounded-2xl bg-black/40 p-5 ring-1 ring-white/10">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-amber-300">Host a match</div>
          {!waiting ? (
            <button
              onClick={createMatch}
              className="h-14 w-full rounded-xl bg-gradient-to-b from-amber-400 to-orange-600 text-lg font-black text-stone-950 active:scale-95"
            >
              ⚔️ CREATE MATCH
            </button>
          ) : (
            <div className="text-center">
              <div className="text-xs text-stone-400">Share this code with your opponent</div>
              <div className="my-3 select-all rounded-xl bg-stone-800 py-3 font-mono text-4xl font-black tracking-[0.4em] text-amber-300 ring-1 ring-amber-400/40">
                {phase.code}
              </div>
              <div className="mb-3 flex items-center justify-center gap-2 text-sm text-stone-300">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-500 border-t-amber-400" />
                Waiting for opponent…
              </div>
              <button onClick={cancelWaiting} className="h-11 w-full rounded-xl bg-stone-700 text-sm font-bold text-white active:scale-95">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-stone-600">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs font-bold">OR</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* join */}
        <div className="rounded-2xl bg-black/40 p-5 ring-1 ring-white/10">
          <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-sky-300">Join a match</div>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            placeholder="ENTER CODE"
            maxLength={5}
            className="mb-3 h-14 w-full rounded-xl bg-stone-800 text-center font-mono text-2xl font-black tracking-[0.4em] text-sky-300 placeholder-stone-600 ring-1 ring-white/10 focus:outline-none focus:ring-sky-400/50"
          />
          <button
            onClick={joinMatch}
            disabled={codeInput.length < 4 || phase.kind === 'joining'}
            className={`h-14 w-full rounded-xl text-lg font-black active:scale-95 ${
              codeInput.length >= 4 && phase.kind !== 'joining'
                ? 'bg-gradient-to-b from-sky-400 to-indigo-600 text-stone-950'
                : 'bg-stone-800 text-stone-500'
            }`}
          >
            {phase.kind === 'joining' ? 'CONNECTING…' : '🚀 JOIN MATCH'}
          </button>
        </div>

        {phase.kind === 'error' && (
          <div className="rounded-xl bg-red-950/70 px-4 py-3 text-center text-sm font-medium text-red-300 ring-1 ring-red-500/40">
            {phase.message}
          </div>
        )}

        <button onClick={onBack} className="h-12 w-full rounded-xl bg-stone-800 text-sm font-bold text-stone-300 ring-1 ring-white/10 active:scale-95">
          ← Back to Menu
        </button>
      </div>
    </div>
  );
}
