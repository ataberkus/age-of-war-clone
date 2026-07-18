import { AGES, TURRET_SLOTS } from '../game/data';
import type { HudSnapshot } from '../game/engine';

interface Props {
  snap: HudSnapshot;
  paused: boolean;
  muted: boolean;
  isMp: boolean;
  onBuyUnit: (i: number) => void;
  onBuyTurret: (i: number) => void;
  onEvolve: () => void;
  onSpecial: () => void;
  onPause: () => void;
  onMute: () => void;
}

function HpBar({ hp, max, label, right }: { hp: number; max: number; label: string; right?: boolean }) {
  const frac = Math.max(0, hp / max);
  const color = frac > 0.5 ? 'bg-green-500' : frac > 0.25 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className={`flex items-center gap-1 ${right ? 'flex-row-reverse' : ''}`}>
      <span className="text-sm">{label}</span>
      <div className="h-3.5 w-16 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/20 sm:w-24">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${frac * 100}%` }} />
      </div>
      <span className="text-[10px] font-bold text-white/80 tabular-nums">{hp}</span>
    </div>
  );
}

export default function HUD({ snap, paused, muted, isMp, onBuyUnit, onBuyTurret, onEvolve, onSpecial, onPause, onMute }: Props) {
  const age = AGES[snap.ageIdx];
  const specialReady = snap.specialCd <= 0 && !snap.over;
  const cdFrac = snap.specialMax > 0 ? snap.specialCd / snap.specialMax : 0;
  const isLastAge = snap.ageIdx >= AGES.length - 1;
  const xpFrac = isLastAge ? 1 : Math.min(1, snap.xp / snap.evolveCost);

  return (
    <div className="z-10 flex flex-col bg-stone-950/95 ring-1 ring-white/10 backdrop-blur">
      {/* top bar */}
      <div className="flex items-center justify-between gap-2 px-2 pt-1.5 sm:px-3">
        <div className="flex flex-col gap-0.5">
          <HpBar hp={snap.baseHp} max={snap.baseMax} label="🏰" />
          <HpBar hp={snap.enemyBaseHp} max={snap.enemyBaseMax} label="👿" right />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 ring-1 ring-amber-400/30">
            <span className="text-sm">💰</span>
            <span className="min-w-8 text-sm font-bold text-amber-300 tabular-nums">{snap.gold}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 ring-1 ring-violet-400/30">
            <span className="text-sm">⭐</span>
            <span className="min-w-8 text-sm font-bold text-violet-300 tabular-nums">{snap.xp}</span>
          </div>
          <div className="hidden items-center gap-1 rounded-lg bg-black/50 px-2 py-1 ring-1 ring-white/15 sm:flex">
            <span className="text-sm">{age.icon}</span>
            <span className="text-xs font-bold text-stone-200">{age.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onMute}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-800 text-base ring-1 ring-white/10 active:scale-90"
            aria-label="Mute"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {!isMp && (
            <button
              onClick={onPause}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-800 text-base ring-1 ring-white/10 active:scale-90"
              aria-label="Pause"
            >
              {paused ? '▶️' : '⏸️'}
            </button>
          )}
        </div>
      </div>

      {/* bottom bar */}
      <div className="flex items-stretch gap-2 px-2 pb-2 pt-1.5 sm:px-3">
        {/* shop: units + turrets, horizontally scrollable */}
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {age.units.map((u, i) => {
            const afford = snap.gold >= u.cost && !snap.over;
            return (
              <button
                key={u.id}
                onClick={() => onBuyUnit(i)}
                disabled={!afford}
                className={`flex w-[74px] shrink-0 flex-col items-center rounded-xl px-1 pb-1 pt-1.5 ring-1 transition active:scale-90 ${
                  afford
                    ? 'bg-gradient-to-b from-stone-700 to-stone-800 ring-amber-400/40'
                    : 'bg-stone-900 opacity-45 ring-white/10'
                }`}
              >
                <span className="text-xl leading-none">{u.icon}</span>
                <span className="mt-0.5 max-w-full truncate text-[10px] font-semibold text-stone-200">{u.name}</span>
                <span className={`text-[10px] font-bold tabular-nums ${afford ? 'text-amber-300' : 'text-stone-400'}`}>
                  💰{u.cost}
                </span>
              </button>
            );
          })}

          <div className="mx-0.5 w-px shrink-0 bg-white/15" />

          {age.turrets.map((t, i) => {
            const full = snap.turretsUsed >= TURRET_SLOTS;
            const afford = snap.gold >= t.cost && !full && !snap.over;
            return (
              <button
                key={t.id}
                onClick={() => onBuyTurret(i)}
                disabled={!afford}
                className={`flex w-[74px] shrink-0 flex-col items-center rounded-xl px-1 pb-1 pt-1.5 ring-1 transition active:scale-90 ${
                  afford
                    ? 'bg-gradient-to-b from-stone-700 to-stone-800 ring-sky-400/40'
                    : 'bg-stone-900 opacity-45 ring-white/10'
                }`}
              >
                <span className="text-xl leading-none">{t.icon}</span>
                <span className="mt-0.5 max-w-full truncate text-[10px] font-semibold text-stone-200">{t.name}</span>
                <span className={`text-[10px] font-bold tabular-nums ${afford ? 'text-sky-300' : 'text-stone-400'}`}>
                  {full ? 'FULL' : `💰${t.cost}`}
                </span>
              </button>
            );
          })}
        </div>

        {/* actions: special + evolve */}
        <div className="flex shrink-0 items-stretch gap-1.5">
          <button
            onClick={onSpecial}
            disabled={!specialReady}
            className={`relative flex w-16 flex-col items-center justify-center overflow-hidden rounded-xl ring-1 transition active:scale-90 ${
              specialReady ? 'bg-gradient-to-b from-orange-500 to-red-600 ring-orange-300/60' : 'bg-stone-800 ring-white/10'
            }`}
            aria-label="Special attack"
          >
            {!specialReady && (
              <div
                className="absolute inset-x-0 bottom-0 bg-black/60"
                style={{ height: `${cdFrac * 100}%` }}
              />
            )}
            <span className={`text-2xl leading-none ${specialReady ? 'animate-pulse' : 'opacity-60'}`}>{age.special.icon}</span>
            <span className="mt-0.5 text-[9px] font-bold text-white/90">
              {specialReady ? 'SPECIAL' : `${Math.ceil(snap.specialCd)}s`}
            </span>
          </button>

          {!isLastAge && (
            <button
              onClick={onEvolve}
              disabled={!snap.canEvolve || snap.over}
              className={`relative flex w-16 flex-col items-center justify-center overflow-hidden rounded-xl ring-1 transition active:scale-90 ${
                snap.canEvolve
                  ? 'animate-pulse bg-gradient-to-b from-violet-500 to-fuchsia-600 ring-violet-300/60'
                  : 'bg-stone-800 ring-white/10'
              }`}
              aria-label="Evolve"
            >
              <div
                className="absolute inset-x-0 bottom-0 bg-violet-500/25"
                style={{ height: `${xpFrac * 100}%` }}
              />
              <span className="relative text-lg leading-none">⬆️</span>
              <span className="relative mt-0.5 text-[9px] font-bold text-white/90">EVOLVE</span>
              <span className={`relative text-[9px] font-bold tabular-nums ${snap.canEvolve ? 'text-white' : 'text-violet-300/80'}`}>
                ⭐{snap.evolveCost}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
