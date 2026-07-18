# Unit Production Queue Design

## Summary

Add an authoritative shared production queue for each side. Unit purchases no longer spawn units immediately. They enter a first-in, first-out queue, consume gold at purchase time, train according to their category, and spawn when training completes and the side has room under the living-unit cap.

The feature applies consistently to solo play, AI-controlled sides, multiplayer hosts, and multiplayer guests. Multiplayer remains host-authoritative.

## Goals

- Prevent instant unit spam by introducing visible production time.
- Give close-range, long-range, and special/heavy units distinct strategic timing.
- Preserve fairness across players, AI, and online matches.
- Keep the queue understandable and usable on desktop and mobile.
- Preserve exact purchase order and purchased unit identity through evolution.

## Non-goals

- Multiple parallel production buildings or queue lanes.
- Per-age production-speed upgrades.
- Rebalancing unit prices, combat statistics, or AI difficulty values beyond adapting AI purchases to the queue.
- Client-authoritative multiplayer timers.

## Core rules

Each side owns one shared queue.

- Maximum queue size: 20 entries per side.
- Maximum living units: 50 per side.
- Gold is deducted immediately after a queue entry is successfully created.
- Only the first queue entry trains.
- Queue processing is first-in, first-out.
- Duplicate unit types are allowed.
- Waiting entries may be cancelled for a full refund of their original purchase cost.
- The active entry cannot be cancelled.
- A completed entry waits at 100% ready while the side has 50 living units, then spawns immediately when a slot opens.
- Production freezes while a solo match is paused.
- Purchases are rejected when the match is over, the player lacks gold, or the queue is full.

## Unit categories and training durations

The three unit slots in every age map to fixed production categories:

| Unit slot | Category | Training time |
| --- | --- | ---: |
| 0 | Close-range | 1.5 seconds |
| 1 | Long-range | 2.5 seconds |
| 2 | Special/heavy | 4.0 seconds |

The category is derived from the purchased unit's slot rather than inferred from combat properties. This keeps the rule deterministic across ages, including ranged heavy units such as cannons, tanks, and war machines.

## Queue entry model

Each queue entry stores enough immutable purchase-time data to survive later evolution:

- Unit definition or stable unit-definition identifier.
- Unit slot.
- Age index at purchase time.
- Original gold cost.
- Total training duration.
- Remaining training time.

The first entry is active by position. No separate mutable `active` flag is required.

Queued units retain their original age, definition, statistics, cost, and duration after the purchasing side evolves. They do not upgrade automatically and are not cancelled.

## Game-engine architecture

Queue state belongs inside `GameEngine` because production timing is core simulation state.

Add per-side queue collections, for example:

```ts
productionQueues: Record<Side, ProductionEntry[]>
```

`buyUnit(side, idx)` changes from immediate spawning to enqueueing:

1. Reject invalid unit indices, ended matches, insufficient gold, or a full queue.
2. Resolve the current age's unit definition and duration from the slot.
3. Deduct gold.
4. Append a purchase-time entry.
5. Emit the existing purchase sound event for human-player purchases.

A separate internal spawn helper creates a `UnitEnt` from the stored definition without charging gold again. This separates purchase validation from physical spawning.

During `update(dt)`, process each side's first queue entry:

1. Reduce remaining time by `dt`, clamped to zero.
2. If time remains, stop.
3. Count living units for that side.
4. If the count is 50, keep the entry at zero and stop.
5. Otherwise spawn the stored unit and remove the queue entry.
6. The next entry begins training on a later update tick; unused excess `dt` is not carried across entries.

Not carrying excess time keeps behavior simple, prevents several units from appearing in one long frame, and remains negligible under the existing capped frame delta.

## Cancellation

Expose an engine method similar to:

```ts
cancelQueuedUnit(side: Side, queueIndex: number): boolean
```

Rules:

- Index `0` is active and cannot be cancelled.
- Invalid indices fail without mutation.
- Successful cancellation removes the waiting entry and refunds its stored original cost.
- Cancellation is rejected after the match ends.
- The method returns whether cancellation succeeded.

The UI sends queue indices corresponding to the authoritative displayed ordering. Multiplayer actions are validated again by the host.

## Living-unit cap

Replace the current per-side living-unit limit of 14 with 50.

The living count includes units whose `dieT` is zero. Dying units cease to consume a living slot as soon as their death state starts, matching the existing interpretation used for purchase limits.

The 50-unit cap applies equally to both sides and all modes.

## AI behavior

AI decision logic continues calling `buyUnit()`, but that method now enqueues instead of spawning instantly.

AI must respect queue capacity naturally through the method's boolean result. Any logic that assumes a successful purchase created a living unit immediately should be checked, but the current strategy primarily uses affordability and cooldowns.

Emergency-defense and wave logic must not repeatedly hammer a full queue. Failed enqueue attempts should not create extra entries, deduct gold, or reset state incorrectly.

AI and human sides use identical production durations and queue limits.

## Multiplayer protocol

The host remains the only authority for:

- Gold deduction and refunds.
- Queue ordering.
- Training timers.
- Ready state.
- Living-unit-cap checks.
- Physical unit spawning.

Extend multiplayer actions with queue cancellation, for example:

```ts
{ type: 'cancelUnit'; idx: number }
```

Guest purchase actions continue sending unit indices. The host validates and enqueues them for the host-space enemy side.

Compact host snapshots include queue state for both sides. Each entry needs only enough data for display:

- Unit definition code.
- Remaining time in compact precision.
- Total duration, or a category code from which duration is derived.

The guest mirrors side ownership and ordering but does not decrement authoritative timers independently. It may interpolate the active progress visually between snapshots, provided incoming snapshots correct drift.

Queue payload size must remain bounded: two queues of at most 20 compact entries each.

## HUD design

Use the approved compact queue strip directly above the existing horizontally scrollable unit shop.

### Queue strip

- Show entries in exact FIFO order.
- Show the active entry first with a progress overlay.
- Show remaining seconds while training.
- Show `READY` when the active entry is complete but blocked by the 50-unit cap.
- Mark the active entry as locked and non-cancellable.
- Allow tapping a waiting entry to cancel it.
- Show a total count such as `7 / 20`.
- Horizontally scroll on narrow screens.
- Preserve enough touch target size for mobile use.

### Unit shop

Each unit button displays its production duration:

- Slot 0: `1.5s`.
- Slot 1: `2.5s`.
- Slot 2: `4.0s`.

A unit button is disabled when the player cannot afford it, the match is over, or the queue is full.

Turret controls remain outside the unit production queue and retain their existing immediate-build behavior.

## HUD snapshot shape

Extend `HudSnapshot` with local-player queue information required by the HUD, such as:

- Queue entries with unit identity, remaining time, and duration.
- Queue length and capacity.
- Whether the active entry is ready but blocked.

The solo/host engine returns the player-side queue. `GuestSync.getSnapshot()` returns the mirrored guest-side queue.

Avoid leaking mutable engine queue entries directly into React state. Return compact copied view models.

## Lifecycle behavior

- New games start with empty queues.
- Solo restart constructs a new engine and therefore clears queues.
- Exiting a match disposes the engine/session with no retained queue state.
- Match completion stops production and prevents cancellation or new purchases.
- Pausing solo play freezes queue timers because `GameEngine.update()` returns early.
- Multiplayer has no pause behavior, matching the existing game rules.

## Error handling and feedback

Use existing deny/click audio patterns:

- Invalid purchases emit `deny` for the local human side.
- Successful enqueue emits the existing buy sound.
- Successful cancellation emits a click-style confirmation.
- Invalid cancellation may emit `deny` for the local human side.

No user-facing exception should be thrown for stale multiplayer cancellation indices; the host rejects them safely.

## Testing strategy

Add a lightweight test runner to the repository because no automated test script currently exists. Tests should focus on deterministic engine behavior and compact multiplayer serialization.

Required coverage:

1. Slot 0, 1, and 2 map to 1.5, 2.5, and 4.0 seconds.
2. Purchases deduct gold immediately and do not create a living unit before completion.
3. FIFO ordering works with mixed and duplicate units.
4. A queue rejects the 21st entry without deducting gold.
5. Waiting entries cancel with an exact refund.
6. Active and invalid entries cannot be cancelled.
7. Evolution does not change already queued units.
8. Production freezes while paused.
9. A completed unit waits at zero remaining time when 50 living units exist.
10. The waiting unit spawns immediately after a living slot opens.
11. Each side has an independent queue and 50-unit cap.
12. AI purchases use the queue and respect capacity.
13. Multiplayer actions are host-validated.
14. Snapshots preserve queue order, unit identity, progress, and guest-side mirroring.
15. Match-over state rejects new purchases and cancellation.

Randomized cosmetic fields on spawned units should not be used as assertions. Tests should assert unit definition identity, side, queue state, gold, and counts.

## Acceptance criteria

The feature is complete when:

- All unit purchases in every mode enter the shared side-specific queue.
- The three unit slots train in 1.5, 2.5, and 4.0 seconds.
- Queue size is capped at 20 per side.
- Living units are capped at 50 per side.
- Waiting entries can be cancelled with a full refund; active entries cannot.
- Completed entries wait safely at 100% when the living cap is full.
- Evolution does not mutate queued units.
- AI and online players obey the same rules.
- The compact queue strip accurately displays authoritative state on desktop and mobile.
- Automated tests cover queue timing, capacity, cancellation, evolution, pause, living caps, AI, and multiplayer synchronization.

## Future game additions

These ideas are deliberately outside this implementation but fit the new production system well:

1. **Production-speed upgrades** — spend gold or XP to improve barracks speed for the current age.
2. **Unit formations** — choose aggressive, balanced, or defensive spacing for newly spawned units.
3. **Commander abilities** — age-specific passive bonuses selected once per match.
4. **Counter bonuses** — modest melee/ranged/heavy matchup advantages to deepen army composition choices.
5. **Neutral battlefield objectives** — temporary gold or XP rewards for controlling the center.
6. **Challenge modes** — survival, restricted-unit runs, mirrored armies, or AI-vs-AI spectator mode.
7. **Match statistics** — post-game damage, production, gold efficiency, and unit survival summaries.
8. **Replay seed or event log** — deterministic match review and easier balance debugging.

The strongest next addition after the queue is **counter bonuses plus clearer unit-role indicators**, because production timing already asks players to commit to an army composition and counters would make that choice more meaningful.