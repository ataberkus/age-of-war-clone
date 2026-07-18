import { useRef, useState } from 'react';
import Game, { type GameMode } from './components/Game';
import Lobby from './components/Lobby';
import { AGES, DIFFICULTIES } from './game/data';
import { playSfx } from './game/audio';
import type { Session } from './mp/session';

type Screen =
  | { name: 'menu' }
  | { name: 'lobby' }
  | { name: 'game'; mode: GameMode };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [difficulty, setDifficulty] = useState(1);
  const [gameKey, setGameKey] = useState(0);
  const sessionRef = useRef<Session | null>(null);

  const exitToMenu = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setScreen({ name: 'menu' });
  };

  if (screen.name === 'game') {
    return (
      <div className="h-dvh w-full overflow-hidden bg-stone-950">
        <Game
          key={gameKey}
          difficulty={difficulty}
          mode={screen.mode}
          session={sessionRef.current}
          onExit={exitToMenu}
        />
      </div>
    );
  }

  if (screen.name === 'lobby') {
    return (
      <Lobby
        onStart={(session, role) => {
          sessionRef.current = session;
          setGameKey((k) => k + 1);
          setScreen({ name: 'game', mode: role === 'host' ? 'host' : 'guest' });
        }}
        onBack={() => setScreen({ name: 'menu' })}
      />
    );
  }

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-stone-950 via-stone-900 to-amber-950 px-4 py-8 text-white">
      {/* title */}
      <div className="text-center">
        <div className="mb-1 text-5xl sm:text-6xl">⚔️</div>
        <h1 className="bg-gradient-to-b from-amber-200 via-amber-400 to-orange-600 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow sm:text-7xl">
          AGE OF WAR
        </h1>
        <p className="mt-2 text-sm font-medium text-stone-400 sm:text-base">
          Battle through the ages — from cavemen to cyber-warriors
        </p>
      </div>

      {/* age parade */}
      <div className="mt-6 flex items-center gap-2 text-2xl sm:gap-3 sm:text-3xl">
        {AGES.map((a, i) => (
          <div key={a.name} className="flex items-center gap-2 sm:gap-3">
            <span title={a.name} className="drop-shadow">{a.icon}</span>
            {i < AGES.length - 1 && <span className="text-sm text-stone-600">→</span>}
          </div>
        ))}
      </div>

      {/* online */}
      <button
        onClick={() => { playSfx('click'); setScreen({ name: 'lobby' }); }}
        className="mt-8 h-16 w-72 rounded-2xl bg-gradient-to-b from-sky-400 to-indigo-600 text-xl font-black tracking-wide text-stone-950 shadow-lg shadow-indigo-900/50 transition active:scale-95"
      >
        🌐 1V1 ONLINE
      </button>

      {/* difficulty */}
      <div className="mt-6 w-full max-w-xs">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-stone-400">Single player difficulty</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIFFICULTIES.map((d, i) => (
            <button
              key={d.name}
              onClick={() => { setDifficulty(i); playSfx('click'); }}
              className={`h-12 rounded-xl text-sm font-bold ring-2 transition active:scale-95 ${
                difficulty === i
                  ? i === 0
                    ? 'bg-green-600 ring-green-300'
                    : i === 1
                      ? 'bg-amber-600 ring-amber-300'
                      : i === 2
                        ? 'bg-red-700 ring-red-400'
                        : 'bg-violet-800 ring-violet-400'
                  : 'bg-stone-800 text-stone-400 ring-white/10'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* start solo */}
      <button
        onClick={() => { playSfx('evolve'); setGameKey((k) => k + 1); sessionRef.current = null; setScreen({ name: 'game', mode: 'solo' }); }}
        className="mt-4 h-16 w-72 rounded-2xl bg-gradient-to-b from-amber-400 to-orange-600 text-xl font-black tracking-wide text-stone-950 shadow-lg shadow-orange-900/50 transition active:scale-95"
      >
        ▶ SINGLE PLAYER
      </button>

      {/* how to play */}
      <div className="mt-8 w-full max-w-md rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
        <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-amber-300">How to play</div>
        <ul className="space-y-1.5 text-[13px] leading-snug text-stone-300">
          <li>🏏 <b>Train units</b> with gold — they march right and fight automatically.</li>
          <li>💰 <b>Earn gold &amp; ⭐XP</b> for every enemy your army destroys.</li>
          <li>⬆️ <b>Evolve</b> with XP to unlock the next age's stronger army.</li>
          <li>🗼 <b>Build turrets</b> (up to 3) to defend your base.</li>
          <li>☄️ <b>Special attack</b> devastates the enemy side — long cooldown.</li>
          <li>🏆 <b>Win</b> by destroying the enemy base. Lose yours and it's over!</li>
        </ul>
        <div className="mt-3 text-center text-[11px] text-stone-500">
          📱 Best in landscape · portrait? Drag the battlefield to pan
        </div>
      </div>
    </div>
  );
}
