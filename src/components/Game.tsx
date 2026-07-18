import { useEffect, useRef, useState } from 'react';
import { GameEngine, type HudSnapshot } from '../game/engine';
import { render } from '../game/renderer';
import { FIELD_W, FIELD_H, AGES, DIFFICULTIES } from '../game/data';
import { playSfx, setMuted } from '../game/audio';
import HUD from './HUD';
import { HostSync, GuestSync } from '../mp/sync';
import type { Session } from '../mp/session';

export type GameMode = 'solo' | 'host' | 'guest';

interface Props {
  difficulty: number;
  mode: GameMode;
  session: Session | null;
  onExit: () => void;
}

export default function Game({ difficulty, mode, session, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const engineRef = useRef<GameEngine | null>(null);
  if (mode !== 'guest' && !engineRef.current) {
    engineRef.current = new GameEngine(difficulty);
    if (mode === 'host') engineRef.current.aiEnabled = false;
    // dev preview: ?debugAge=0-4&debugGold=99999 to jump ages for visual checks
    if (mode === 'solo') {
      const q = new URLSearchParams(window.location.search);
      const da = q.get('debugAge');
      if (da !== null) {
        const a = Math.max(0, Math.min(4, parseInt(da) || 0));
        engineRef.current.ageIdx.player = a;
        engineRef.current.ageIdx.enemy = a;
        engineRef.current.baseMax.player = 700 + a * 150;
        engineRef.current.baseHp.player = 700 + a * 150;
        engineRef.current.baseMax.enemy = 700 + a * 150;
        engineRef.current.baseHp.enemy = 700 + a * 150;
        engineRef.current.gold.player = parseInt(q.get('debugGold') || '99999');
        engineRef.current.gold.enemy = 99999;
      }
    }
  }

  const hostSyncRef = useRef<HostSync | null>(null);
  if (mode === 'host' && session && engineRef.current && !hostSyncRef.current) {
    hostSyncRef.current = new HostSync(engineRef.current, session);
  }

  const guestRef = useRef<GuestSync | null>(null);
  if (mode === 'guest' && session && !guestRef.current) {
    guestRef.current = new GuestSync(session);
  }

  const isMp = mode !== 'solo';
  const world = (mode === 'guest' ? guestRef.current : engineRef.current)!;

  const [hud, setHud] = useState<HudSnapshot>(() => world.getSnapshot());
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [peerLeft, setPeerLeft] = useState(false);

  const camRef = useRef({ x: FIELD_W / 2, mode: 'auto' as 'auto' | 'manual', manualT: 0 });
  const dragRef = useRef<{ id: number; lastX: number } | null>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [canPan, setCanPan] = useState(false);

  // opponent disconnect
  useEffect(() => {
    if (!session) return;
    session.onPeerLeave = () => {
      setPeerLeft(true);
      if (mode === 'host' && engineRef.current) {
        engineRef.current.over = true;
        engineRef.current.winner = 'player';
      } else if (mode === 'guest' && guestRef.current) {
        guestRef.current.over = true;
        guestRef.current.winner = 'player';
      }
    };
  }, [session, mode]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let hudT = 1;
    let elapsed = 0;
    let loopPan = false;
    const cam = camRef.current;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;

      const engine = engineRef.current;
      const guest = guestRef.current;

      if (mode === 'guest') {
        guest!.update(dt);
      } else {
        engine!.update(dt);
        hostSyncRef.current?.update(dt);
      }

      const events = mode === 'guest' ? guest!.events : engine!.events;
      if (events.length) {
        const unique = Array.from(new Set(events)).slice(0, 4);
        for (const e of unique) playSfx(e);
        events.length = 0;
      }

      const rect = containerRef.current!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.max(1, Math.round(rect.width * dpr));
      const ph = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }

      // camera
      const w = rect.width;
      const h = rect.height;
      const fitScale = w / FIELD_W;
      let scale = fitScale;
      let camMax = 0;
      if (h / FIELD_H > fitScale) {
        scale = h / FIELD_H;
        camMax = Math.max(0, FIELD_W - w / scale);
      }
      const offY = Math.max(0, (h - FIELD_H * scale) / 2);

      const units = mode === 'guest' ? guest!.units : engine!.units;
      let pFront = 0;
      let eFront = FIELD_W;
      let hasP = false;
      let hasE = false;
      for (const u of units) {
        if (u.dieT !== 0) continue;
        if (u.side === 'player') { pFront = Math.max(pFront, u.x); hasP = true; }
        else { eFront = Math.min(eFront, u.x); hasE = true; }
      }
      const focus = hasP && hasE
        ? (pFront + eFront) / 2
        : hasP
          ? pFront + 180
          : hasE
            ? Math.min(eFront - 150, FIELD_W * 0.45)
            : FIELD_W * 0.32;
      const target = Math.max(0, Math.min(camMax, focus - w / scale / 2));
      if (cam.mode === 'manual') {
        // free-look: hold position, return to auto-follow after a few idle seconds
        cam.manualT += dt;
        if (cam.manualT > 6 || camMax <= 1) cam.mode = 'auto';
      } else {
        cam.x += (target - cam.x) * Math.min(1, dt * 3.5);
        cam.x = Math.max(0, Math.min(camMax, cam.x));
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, (mode === 'guest' ? guest! : engine!) as GameEngine, { camX: cam.x, scale, offY, w, h }, elapsed);

      // minimap (only when the field is wider than the screen)
      const pan = camMax > 1;
      if (pan !== loopPan) { loopPan = pan; setCanPan(pan); }
      const mmCanvas = minimapRef.current;
      if (mmCanvas && pan) {
        const mw = mmCanvas.width;
        const mh = mmCanvas.height;
        const mc = mmCanvas.getContext('2d')!;
        mc.clearRect(0, 0, mw, mh);
        mc.fillStyle = 'rgba(0,0,0,0.45)';
        mc.beginPath();
        mc.roundRect(0, 0, mw, mh, 12);
        mc.fill();
        mc.fillStyle = '#34d399';
        mc.fillRect(4, 10, 16, mh - 20);
        mc.fillStyle = '#f87171';
        mc.fillRect(mw - 20, 10, 16, mh - 20);
        for (const u of units) {
          if (u.dieT !== 0) continue;
          mc.fillStyle = u.side === 'player' ? '#6ee7b7' : '#fca5a5';
          mc.fillRect((u.x / FIELD_W) * mw - 2, mh / 2 - 2, 5, 5);
        }
        mc.strokeStyle = 'rgba(251,191,36,0.95)';
        mc.lineWidth = 3;
        mc.strokeRect((cam.x / FIELD_W) * mw + 1.5, 3, (w / scale / FIELD_W) * mw - 3, mh - 6);
      }

      hudT += dt;
      if (hudT > 0.12) {
        hudT = 0;
        setHud(mode === 'guest' ? guest!.getSnapshot() : engine!.getSnapshot());
        if (elapsed > 6) setShowHint(false);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // drag to pan (portrait mode)
  useEffect(() => {
    const el = containerRef.current!;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-minimap]')) return;
      dragRef.current = { id: e.pointerId, lastX: e.clientX };
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.lastX;
      d.lastX = e.clientX;
      const rect = el.getBoundingClientRect();
      const scale = Math.max(rect.width / FIELD_W, rect.height / FIELD_H);
      const cam = camRef.current;
      const camMax = Math.max(0, FIELD_W - rect.width / scale);
      cam.x = Math.max(0, Math.min(camMax, cam.x - dx / scale));
      cam.mode = 'manual';
      cam.manualT = 0;
    };
    const up = (e: PointerEvent) => {
      if (dragRef.current?.id === e.pointerId) dragRef.current = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, []);

  const restart = () => {
    if (isMp) return; // no solo restart in online matches
    engineRef.current = new GameEngine(difficulty);
    camRef.current = { x: FIELD_W / 2, mode: 'auto', manualT: 0 };
    setPaused(false);
    setShowHint(true);
    setHud(engineRef.current.getSnapshot());
  };

  const togglePause = () => {
    if (isMp) return;
    const next = !paused;
    setPaused(next);
    if (engineRef.current) engineRef.current.paused = next;
    playSfx('click');
  };

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  };

  useEffect(() => {
    if (engineRef.current) engineRef.current.paused = paused;
  }, [paused]);

  // player actions routed by mode
  const actBuyUnit = (i: number) => {
    if (mode === 'guest') { guestRef.current!.sendAction({ type: 'buyUnit', idx: i }); playSfx('click'); }
    else engineRef.current!.buyUnit('player', i);
  };
  const actBuyTurret = (i: number) => {
    if (mode === 'guest') { guestRef.current!.sendAction({ type: 'buyTurret', idx: i }); playSfx('click'); }
    else engineRef.current!.buyTurret('player', i);
  };
  const actEvolve = () => {
    if (mode === 'guest') { guestRef.current!.sendAction({ type: 'evolve' }); playSfx('click'); }
    else engineRef.current!.evolve('player');
  };
  const actSpecial = () => {
    if (mode === 'guest') { guestRef.current!.sendAction({ type: 'special' }); playSfx('click'); }
    else engineRef.current!.useSpecial('player');
  };

  const minimapSeek = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cont = containerRef.current!.getBoundingClientRect();
    const scale = Math.max(cont.width / FIELD_W, cont.height / FIELD_H);
    const camMax = Math.max(0, FIELD_W - cont.width / scale);
    const cam = camRef.current;
    cam.x = Math.max(0, Math.min(camMax, frac * FIELD_W - cont.width / scale / 2));
    cam.mode = 'manual';
    cam.manualT = 0;
  };

  const goHome = () => {
    const cam = camRef.current;
    cam.x = 0; // player base sits at the left edge of the field
    cam.mode = 'manual';
    cam.manualT = 0;
  };

  const mm = Math.floor(hud.time / 60);
  const ss = Math.floor(hud.time % 60).toString().padStart(2, '0');

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-stone-950">
      {/* battlefield */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 touch-none select-none"
        style={{ touchAction: 'none' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {canPan && !hud.over && (
          <button
            onClick={goHome}
            title="Back to my base"
            className="absolute left-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-black/55 text-lg backdrop-blur-sm active:scale-90"
          >
            🏰
          </button>
        )}

        {canPan && !hud.over && (
          <canvas
            ref={minimapRef}
            data-minimap
            width={352}
            height={56}
            className="absolute left-1/2 top-2 z-10 h-7 w-44 -translate-x-1/2 rounded-md"
            onPointerDown={minimapSeek}
            onPointerMove={(e) => { if (e.buttons & 1) minimapSeek(e); }}
          />
        )}

        {showHint && !hud.over && (
          <div className={`pointer-events-none absolute left-1/2 ${canPan ? 'top-12' : 'top-3'} -translate-x-1/2 rounded-xl bg-black/60 px-4 py-2 text-center text-xs font-medium text-amber-200 backdrop-blur-sm sm:text-sm`}>
            {isMp
              ? 'Online match — destroy the other player\'s base before they destroy yours!'
              : 'Train units, earn gold & XP, evolve through the ages — destroy the enemy base!'}
          </div>
        )}

        {/* pause overlay (solo only) */}
        {paused && !hud.over && !isMp && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
            <div className="text-3xl font-black tracking-widest text-amber-300">PAUSED</div>
            <div className="flex flex-col gap-3">
              <button onClick={togglePause} className="h-12 w-48 rounded-xl bg-amber-500 text-lg font-bold text-stone-900 active:scale-95">▶ Resume</button>
              <button onClick={restart} className="h-12 w-48 rounded-xl bg-stone-700 text-lg font-bold text-white active:scale-95">↻ Restart</button>
              <button onClick={onExit} className="h-12 w-48 rounded-xl bg-stone-800 text-lg font-bold text-stone-300 active:scale-95">🏠 Main Menu</button>
            </div>
          </div>
        )}

        {/* game over overlay */}
        {hud.over && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/75 backdrop-blur-sm">
            <div className={`text-center text-4xl font-black tracking-wide sm:text-5xl ${hud.winner === 'player' ? 'text-amber-300' : 'text-red-400'}`}>
              {peerLeft
                ? hud.winner === 'player'
                  ? '🏆 OPPONENT LEFT — YOU WIN!'
                  : '💀 DEFEAT'
                : hud.winner === 'player'
                  ? '🏆 VICTORY!'
                  : '💀 DEFEAT'}
            </div>
            <div className="rounded-2xl bg-stone-900/80 px-6 py-4 text-center text-sm text-stone-300">
              {isMp ? (
                <div>Online 1v1 · Time: <span className="font-bold text-white">{mm}:{ss}</span> · Kills: <span className="font-bold text-white">{hud.kills}</span></div>
              ) : (
                <div>Difficulty: <span className="font-bold text-white">{DIFFICULTIES[difficulty].name}</span> · Time: <span className="font-bold text-white">{mm}:{ss}</span> · Kills: <span className="font-bold text-white">{hud.kills}</span></div>
              )}
              <div>Age reached: <span className="font-bold text-white">{AGES[hud.ageIdx].icon} {AGES[hud.ageIdx].name}</span></div>
            </div>
            <div className="flex flex-col gap-3">
              {!isMp && (
                <button onClick={restart} className="h-13 w-52 rounded-xl bg-amber-500 py-3 text-lg font-bold text-stone-900 active:scale-95">↻ Play Again</button>
              )}
              <button onClick={onExit} className="h-13 w-52 rounded-xl bg-stone-700 py-3 text-lg font-bold text-white active:scale-95">🏠 Main Menu</button>
            </div>
          </div>
        )}
      </div>

      {/* HUD */}
      <HUD
        snap={hud}
        paused={paused}
        muted={muted}
        isMp={isMp}
        onBuyUnit={actBuyUnit}
        onBuyTurret={actBuyTurret}
        onEvolve={actEvolve}
        onSpecial={actSpecial}
        onPause={togglePause}
        onMute={toggleMute}
      />
    </div>
  );
}
