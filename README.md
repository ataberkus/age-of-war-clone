# Age of War — Battle Through the Ages

A web clone of the classic **Age of War** lane battler: train units, earn gold & XP, evolve through 5 ages — from cavemen to cyber-warriors — and destroy the enemy base. Playable on desktop and mobile (touch).

## Features

- **5 ages** — Stone, Medieval, Renaissance, Modern, Future — each with 3 unique units, 2 turrets and a special attack (15 units / 10 turrets total)
- **Timed unit production** — queue up to 20 units per side; close-range units train in 1.5s, long-range units in 2.5s, and special/heavy units in 4.0s
- **4 AI difficulties** — Easy, Normal, Hard, Insane — with a smart enemy that builds turrets, coordinates queued wave attacks, times specials and rushes emergency defense
- **Online 1v1 multiplayer** — real-time matches against other players via room codes (Supabase Realtime, host-authoritative sync)
- **Mobile support** — touch controls, drag-to-pan free camera with auto-follow, tappable minimap and a home button to jump back to your base
- Hand-drawn canvas renderer (per-age themes, day/night, animated units), procedural WebAudio sound effects — no external assets

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Canvas 2D game engine (fixed-tick simulation)
- Supabase Realtime (broadcast + presence) for multiplayer — no database, no auth

## Run locally

```bash
npm install
npm run dev
```

### Unit production

Unit purchases enter a shared FIFO queue and spend gold immediately. Each side may queue up to 20 units and field up to 50 living units.

- Close-range unit: 1.5 seconds
- Long-range unit: 2.5 seconds
- Special/heavy unit: 4.0 seconds
- Tap a waiting queue entry to cancel it for a full refund
- The active training entry cannot be cancelled
- A completed entry displays `READY` when the 50-unit living cap is full and spawns when a slot opens

Build for production:

```bash
npm run build   # outputs to dist/
```

Run the production-queue tests:

```bash
npm test
```

## Multiplayer setup

The client points at a Supabase project via `src/mp/config.ts`:

```ts
export const SUPABASE_URL = 'https://<your-project>.supabase.co';
export const SUPABASE_KEY = '<your-publishable-key>';
```

Realtime must be enabled on the project (it is by default). One player creates a match and shares the 5-letter room code; the other joins with it.

## AI-vs-AI balance simulations

The engine's AI can drive both sides (`engine.runAI(side, difficulty)`), which allows headless balance simulations — e.g. Normal AI vs Hard AI win-rate matrices — without playing manually.
