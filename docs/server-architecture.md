# ag-drift Server Architecture

ag-drift is a multiplayer anti-gravity racing game built around **deterministic lockstep simulation**. The server does not stream ship positions or velocities over the network. Instead, every peer — server and clients alike — runs the same physics engine locally and stays in sync by exchanging **input events** and **server events**, then replaying simulation history to reconcile state.

This document explains how the server works, how the game is simulated, how player actions are processed, and how clients stay synchronized.

---

## High-level architecture

```
┌─────────────┐     player:events      ┌──────────────────────────────────┐
│   Client    │ ──────────────────────►│  Server (src/server/index.js)    │
│ (index.js)  │     game:join          │                                  │
│             │◄──── game:bootstrap ───│  Game(track, isServer=true)      │
│  Game()     │◄──── player:events ────│    ├─ turns[] history            │
│  local      │◄──── server:event ─────│    ├─ tick() @ 60 Hz             │
│  prediction │     game:pong         │    ├─ resimulateFrom()            │
│  + render   │                        │    └─ AI bots (fake sockets)      │
└─────────────┘                        └──────────────────────────────────┘
        │                                           │
        └──────── shared code ──────────────────────┘
              Game.js, Turn.js, Ship.js,
              PlayerInput.js, constants.js
                    (p2.js physics)
```

The server is a thin wrapper around shared game logic in `src/common/`. Almost all simulation code runs identically on server and client. The server's unique responsibilities are:

- Owning the authoritative game clock
- Accepting and broadcasting player input
- Spawning and destroying players
- Running AI bots
- Serving static client assets via Express

Transport is **Socket.io** (not raw WebSockets). There is no REST game API.

---

## Session modes: cup, time attack, and idle

The server supports three **session modes** (`idle`, `cup`, `timeattack`), set on the server and sent to clients via the `sessionMode` field in `game:bootstrap`:

| Mode | Entered by | Between races |
|------|------------|-----------------|
| `idle` | Server boot; all humans leave | Auto-reset on the same track (bot loop) |
| `cup` | First human joins; Host `/restart` or `/gamemode cup` | Results screen holds → server `changeTrack()` (turn reset + rebootstrap) |
| `timeattack` | Host `/gamemode timeattack` | Auto-reset on the same track |

Track switches discard turn history and rebootstrap all connected clients. `Game.resetForTrackChange()` sets `turnIndex` and `lava` to 0, places existing ships on the new grid in `START_COUNTDOWN`, and sends a fresh `game:bootstrap` to every player. Session mode is included in the bootstrap payload.

### Cup mode

Cup logic lives in `src/server/cup.js` (`CupManager`). When the first human joins:

1. Tracks are shuffled (4 races).
2. Mario Kart-style points are awarded to humans at each `RESULTS_SCREEN` (`[15, 12, 10, 9, …]`).
3. Bot count defaults to 7 for all tracks and cup sessions.
4. Between races the results screen counts down (5 s, or 15 s after race 4), then **holds at 0** until the server calls `changeTrack()` for the next track (full turn reset + rebootstrap).
5. After race 4 the cup winner is announced, scores reset, tracks re-shuffle, and a new cup begins.

When all humans leave, the cup resets to **idle** (no scoring, no progression).

### Host commands (chat)

Host-only commands (first human = Host; random transfer on Host disconnect). Announced commands depend on session mode:

**Cup mode:** `/restart`, `/bots on`, `/bots off`, `/gamemode timeattack`

**Time attack mode:** `/restart`, `/track`, `/gamemode cup` (Host replies `1`–`4` after `/track` to pick a track)

Connect/disconnect system messages: `"Alice connected"` / `"Bob left"`.

---

## Key files

| File | Role |
|------|------|
| `src/server/cup.js` | Cup state, scoring, placement sort, chat message formatters |
| `src/server/index.js` | Server entry point: Express, Socket.io, tick scheduler, AI bots, socket handlers |
| `src/common/Game.js` | Core game engine: turn history, tick loop, resimulation, player join/leave |
| `src/common/Turn.js` | Single simulation step: physics, checkpoints, laps, game state machine |
| `src/common/constants.js` | Tick rate, physics constants, event types, game states |
| `src/common/Ship.js` | Ship state model (position, velocity, lap times, etc.) |
| `src/common/PlayerInput.js` | Mutable input state; applies `PlayerEvent`s |
| `src/common/PlayerEvent.js` | Edge-triggered input change (`{ type, val }`) |
| `src/client/index.js` | Client sync layer: Socket.io handlers, local prediction, render loop |

Source lives in `src/` and is compiled to the repo root via Babel (`npm run build`). `npm start` runs the compiled `server/index.js`.

---

## Server startup

When the server boots (`src/server/index.js`):

1. **Express + HTTP + Socket.io** are created. Static files are served from `public/`.

2. **A track is selected** — default track from `CupManager` (or overridden with `FORCED_TRACK_CHOICE`). Session starts in **idle** mode with bots racing and auto-resetting.

3. **A `Game` instance is created** with `isServer: true` and `sessionMode: 'idle'`:

   ```js
   const game = new Game(track, true)
   game.sessionMode = C.SESSION_MODE.IDLE
   ```

4. **The tick scheduler starts** immediately (includes cup state watcher for scoring and track changes):

   ```js
   function tickAndSchedule () {
     game.tick()
     timerId = setTimeout(tickAndSchedule, Date.now() + C.TIME_STEP - game.lastTick)
     setTimeout(executeAIs, 0)
   }
   tickAndSchedule()
   ```

   This is a self-correcting timer: each tick advances `game.lastTick`, and the next tick is scheduled to fire at `lastTick + TIME_STEP`, compensating for drift.

5. **AI bots are spawned once at boot** via `spawnBotsForTrack(DEFAULT_BOT_COUNT)` (7). They persist across cup restarts and human join/leave; only `/bots off` removes them (and `/bots on` can add them back).

6. **Socket.io connection handlers** are registered for join, events, ping, chat (including Host commands), and disconnect.

7. **The server listens** on `PORT` (default 3000).

---

## How the game is simulated

### Turn-based deterministic simulation

The game advances in discrete **turns** at 60 Hz (`TIME_STEP = 1000/60 ≈ 16.67 ms`). Each turn is a `Turn` object stored in `game.turns[]`. A turn contains:

- `ships` — array of ship states (position, velocity, angle, lap info, input, etc.)
- `events` — player input events indexed by ship ID
- `serverEvents` — spawn/destroy, session mode, track changes
- `state` — game state machine phase
- `counter` — tick counter for the current phase

Given the same prior turn and the same events, every peer computes identical results. This determinism is what makes lockstep sync possible.

### The tick loop

`Game.tick()` runs on every scheduler invocation:

```js
tick () {
  while (this.canTick()) {
    this.lastTick += C.TIME_STEP
    const currentTurnIndex = this.turnIndex
    ++this.turnIndex
    this.resimulateFrom(currentTurnIndex)

    // garbage-collect old turns
    if (this.turnIndex - this.lava > C.TURN_MAX_DELAY * (this.isServer ? 1 : 2)) {
      this.turns[this.lava] = null
      ++this.lava
    }
  }
  return this.turn
}
```

Each tick:

1. Checks whether enough real time has elapsed (`canTick()`)
2. Advances `lastTick` by `TIME_STEP`
3. Increments `turnIndex`
4. Calls `resimulateFrom(currentTurnIndex)` to evolve physics one step
5. Garbage-collects turns older than `TURN_MAX_DELAY` (~500 ms / 30 turns on server)

`canTick()` gates advancement on wall-clock time:

```js
canTick () {
  return Date.now() - (this.lastTick + C.CLIENT_LEAD) >= C.TIME_STEP
}
```

On the server, `CLIENT_LEAD` stays at 0. Clients adjust it dynamically (see [Clock sync](#clock-sync)).

### What happens in one simulation step

`Turn.evolve()` is the heart of the physics simulation. For each tick it:

1. **Sets up p2 physics bodies** for existing ships (reusing or creating `p2.Body` objects)
2. **Processes server events** — spawns new ships at starting positions, or removes disconnected players
3. **Applies player events** — reconstructs each ship's `PlayerInput` from the events attached to this turn, then applies forces:
   - Gas thruster (with 2× boost multiplier)
   - Lean thrusters (left/right)
   - 90° turns (left/right)
4. **Applies drafting** — reduced air drag when positioned behind a fast-moving ship
5. **Applies ground drag** on `;` cells (grass terrain)
6. **Steps the p2 physics world** — `world.step(dt / 1000)`
7. **Detects checkpoint/lap progress** by reading numbered cells from the track grid
8. **Advances the game state machine** (countdown → race → finish window → results → reset)

The evolved turn gets **empty** `events` and `serverEvents` arrays — events are consumed during evolution and not carried forward. New inputs attach to the current turn index before the next evolution.

### Resimulation

`resimulateFrom(turnIndex)` is the core reconciliation mechanism. When any event arrives (player input or server event), or when a new tick is due, the game replays simulation from that turn index forward:

```js
resimulateFrom (turnIndex) {
  if (this.turnIndex <= turnIndex) return  // nothing to replay yet

  for (let i = turnIndex; i < this.turnIndex; ++i) {
    const currentTurn = this.turns[i]
    let nextTurn = this.turns[i + 1]
    // ...
    resetWorld(world)
    // re-add wall bodies from map
    nextTurn = currentTurn.evolve(this.map, world, bodies, C.TIME_STEP, this.isServer)
    nextTurn.events = events       // preserve input events
    nextTurn.serverEvents = serverEvents
    this.turns[i + 1] = nextTurn
    this.turn = nextTurn
  }
}
```

`resimulateFrom` only replays when `turnIndex < this.turnIndex`. If the event targets the current or a future turn, it is stored and applied when that turn is eventually simulated.

The p2 physics world is fully reset between each replay step. Wall colliders are regenerated from the track grid. This ensures that late-arriving inputs correctly affect all subsequent turns.

### Game state machine

| State | Duration | Behavior |
|-------|----------|----------|
| `gameStartCountdown` | 3 seconds (180 ticks) | Waits for at least one human player before counting down |
| `gameInProgress` | Until first finisher | Active racing; lap times accumulate |
| `gameFinishCountdown` | 15 seconds (900 ticks) | First finisher triggers this; others can still finish |
| `gameResultsScreen` | 5 seconds (300 ticks); 15 s after cup race 4 | Shows results; cup mode holds at 0 until `changeTrack()`; idle/time attack auto-reset |

After the results screen, the game loops back to `gameStartCountdown`.

---

## How player actions are processed

### Input model: edge-triggered events

Players do not send continuous input state. They send **changes** — `PlayerEvent` objects when a control transitions (e.g., gas pressed, turn triggered, boost released).

Event types:

| Event | Meaning |
|-------|---------|
| `turnL` / `turnR` | One-shot 90° turn (edge-triggered, resets each tick) |
| `gas` | Thruster on/off (level-triggered) |
| `boost` | Boost on/off (level-triggered, 2× force when gas is also on) |
| `leanL` / `leanR` | Side thrusters on/off (level-triggered) |

### Client → server flow

On every animation frame, the client:

1. Reads keyboard/gamepad state into a `PlayerInput` object
2. Diffs against the previous frame's input to produce `PlayerEvent[]`
3. **Stores events on the current turn** via `game.onPlayerEvents()`
4. **Sends events to the server** via `socket.emit('player:events', events, game.turnIndex)`

The client simulates the game locally every frame regardless of server updates — this is client-side prediction. Each frame ends with `tick()` (a full logic step) or `fakeTick()` (a partial step between logic ticks that keeps applying held inputs).

```js
if (events.length > 0) {
  game.onPlayerEvents(myShipId, events, game.turnIndex)
  socket.emit('player:events', events, game.turnIndex)
}
```

Every event is tagged with the **turn index** at which it was generated. This is critical for lockstep replay.

### Server processing

The server receives events on the `player:events` socket handler:

```js
socket.on('player:events', (events, turnIndex) => {
  const shipId = game.getShipIdForSocket(socket)
  game.onPlayerEvents(shipId, events, turnIndex)
})
```

`Game.onPlayerEvents()`:

1. Attaches events to the turn at `turnIndex` (creating the turn if it doesn't exist yet and is in the future)
2. If the events represent a meaningful change, calls `resimulateFrom(turnIndex)` — this only replays if `turnIndex` is in the *past* (i.e. `turnIndex < this.turnIndex`). Events for the current turn are applied on the next `tick()`
3. Broadcasts `player:events` to **all** connected clients (including the sender)

```js
onPlayerEvents (shipId, events, turnIndex) {
  const changed = turn.addEvents(shipId, events)
  if (changed) {
    this.resimulateFrom(turnIndex)
    if (this.isServer) {
      this.sockets.forEach((socket) => {
        socket.emit('player:events', shipId, events, turnIndex)
      })
    }
  }
}
```

### Event deduplication

`Turn.addEvents()` only stores events that change state. For same-type events, it only pushes if `val` differs from the last event of that type. Turn events (`turnL`/`turnR`) are one-shot per tick — `PlayerInput` resets them to `false` at the start of each `evolve()`.

### Player join and leave

**Join** (`game:join`):

1. Server assigns a free ship slot
2. Creates a `spawnPlayer` server event at the current turn index
3. Calls `resimulateFrom()` to spawn the ship in simulation
4. Sends `game:bootstrap` to the joining client with recent turn history
5. Broadcasts `server:event` to all other clients

**Leave** (socket disconnect):

1. Server creates a `destroyPlayer` server event
2. Calls `resimulateFrom()` to remove the ship
3. Broadcasts `server:event` to all clients

### AI bots

Bots use the exact same code path as human players. The server creates fake socket objects and calls `game.onPlayerEvents()` directly (no network round-trip). Two AI strategies exist:

- **`ml`**: Nearest-neighbor lookup in pre-recorded "brain" memory (position + velocity → input + target angle)
- **`grid`**: Follow `track.aiGrid` direction characters (`u`/`r`/`d`/`l`) with gas always on

---

## How clients stay in sync

### Bootstrap (initial sync and recovery)

When a player joins or gets "lost" (desynced), the server sends a `game:bootstrap` message:

```js
socket.emit('game:bootstrap', {
  initialTurn,    // turn index to start replay from
  map,            // track definition
  turnsSlice,     // recent turn history
  shipId,         // this player's ship slot
  lastTick        // server's clock position
})
```

The `turnsSlice` is bandwidth-optimized: only the first turn in the slice includes full ship state. Subsequent turns carry only `events` and `serverEvents` — the client reconstructs ship positions by replaying simulation.

The client bootstrap handler:

1. Creates a new `Game` instance with the track
2. Loads `turnsSlice` into `game.turns[]`
3. Sets `turnIndex`, `lastTick`, and `lava` to match the server
4. Calls `game.resimulateFrom(initialTurn)` to replay to current state
5. Creates the PIXI renderer (`GameController`)

### Ongoing sync

After bootstrap, clients stay in sync via three Socket.io event types:

| Event | Direction | Payload | Effect |
|-------|-----------|---------|--------|
| `player:events` | S→C | `(shipId, events, turnIndex)` | Attach inputs; resimulate if turn is in the past |
| `server:event` | S→C | `(event, turnIndex)` | Spawn/destroy; resimulate if turn is in the past |
| `game:bootstrap` | S→C | `{ initialTurn, map, turnsSlice, shipId, lastTick }` | Full state recovery |

Events from the server always arrive late — by the time a broadcast reaches a client, that `turnIndex` is always in the past, so `resimulateFrom()` replays from that point forward. The client intentionally re-applies its own events too (the `if (shipId === myShipId) return` guard is commented out), using the server echo as authoritative reconciliation.

### Client game loop: tick vs. fakeTick

The client runs a `requestAnimationFrame` loop (~60 fps). Local simulation happens every frame, independent of server messages:

```js
const currentTurn = game.canTick()
  ? game.tick()       // full logic step (same as server)
  : game.fakeTick()   // partial step between logic ticks
```

- **`tick()`**: Advances `turnIndex` and runs a full simulation step via `resimulateFrom()`
- **`fakeTick()`**: Runs a partial `evolve()` with `dt < TIME_STEP` between logic ticks. It does not advance `turnIndex`, but it still applies held inputs (e.g. gas still pressed) — the client's best estimate of where the game is right now. This keeps both the simulation and the display current while waiting for the next `tick()`

### Clock sync

The client sends `game:ping` every 500 ms. The server responds with `game:pong` carrying `Date.now()`. The client computes round-trip latency and sets `CLIENT_LEAD`:

```js
C.CLIENT_LEAD = now - (serverNow + minPing)
```

`CLIENT_LEAD` represents the offset between client and server clocks. Both `canTick()` checks use `lastTick + CLIENT_LEAD`, so the client ticks slightly ahead of raw server time to absorb network latency. This reduces the perceived input delay.

### Turn history and garbage collection

The server keeps ~30 turns of history (`TURN_MAX_DELAY = ceil(500ms / TIME_STEP)`). Older turns are nulled out and `lava` (the oldest valid turn index) advances.

Clients keep roughly double that window (`TURN_MAX_DELAY * 2`) to handle their clock lead.

If a client references a turn older than `lava`, or turn data is missing during resimulation, an `InvalidTurnError` is thrown. Recovery:

- **Server side**: calls `bootstrapSocket()` to resend recent history
- **Client side**: emits `player:lost` to request a bootstrap

---

## Socket.io message reference

| Direction | Event | Payload | When |
|-----------|-------|---------|------|
| C→S | `game:join` | `(username, debug)` | On page load |
| C→S | `player:events` | `(events, turnIndex)` | Input changes each frame |
| C→S | `player:lost` | — | Client detects desync |
| C→S | `game:ping` | — | Every 500 ms |
| C→S | `msg` | `(text)` | Chat message |
| S→C | `game:bootstrap` | `{ initialTurn, map, turnsSlice, shipId, lastTick, sessionMode }` | Join, desync recovery, and track change |
| S→C | `player:events` | `(shipId, events, turnIndex)` | Any player's input change |
| S→C | `server:event` | `(event, turnIndex)` | Player spawn/destroy |
| S→C | `game:pong` | `(serverNow)` | Ping response |
| S→C | `game:debug` | `(turn)` | Debug clients only |
| S→C | `msg` | `(username, color, text)` | Chat broadcast |
| S→C | `system-msg` | `(text)` | Leaderboard / announcements |
| S→C | `the-crown` | `(username)` | Current track record holder |

---

## Key constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `TIME_STEP` | `1000/60` ≈ 16.67 ms | One simulation tick (~60 Hz) |
| `TURN_MAX_DELAY` | 30 turns | Turn history kept (~500 ms) |
| `CLIENT_LEAD` | 0 (dynamic on client) | Client clock offset, adjusted via ping |
| `FORCE` | 300 | Thruster force magnitude |
| `CELL_EDGE` | 10 | Grid cell size in world units |
| `MAX_LAPS` | 2 | Laps to finish a race |
| `START_COUNTDOWN_S` | 180 ticks (3 s) | Pre-race countdown |
| `FINISH_COUNTDOWN_S` | 900 ticks (15 s) | Post-first-finisher window |
| `RESULTS_SCREEN_S` | 300 ticks (5 s) | Results screen before reset |

---

## Design principles

1. **Lockstep, not state sync** — Only inputs travel over the wire. Positions, velocities, and lap times are derived locally by replaying the same simulation.

2. **Server authoritative with client prediction** — Clients store inputs and simulate locally every frame (`tick()` and `fakeTick()`), continuing to apply held inputs between server updates. Server broadcasts arrive late and trigger `resimulateFrom()` to bring the client back in sync.

3. **Turn-indexed events** — Every input is tagged with `turnIndex`, enabling precise replay regardless of network latency.

4. **Sliding window history** — Old turns are garbage-collected. Clients that fall too far behind get bootstrapped with a recent slice of history.

5. **Shared simulation code** — `Game.js`, `Turn.js`, and related modules run identically on server and client. The server is a thin networking and scheduling layer.

6. **Single p2.World, reset between steps** — The physics world is a module-level singleton in `Game.js`, fully reset during each resimulation step to ensure determinism.

---

## End-to-end example: pressing gas

1. Player presses Up Arrow. Client detects `gas` changed from `false` to `true`.
2. Client stores the event on turn 42 via `onPlayerEvents()` and sends `socket.emit('player:events', [event], 42)`. The game keeps simulating locally — the ship starts accelerating on the next `tick()` or `fakeTick()`, whichever runs first.
3. Server receives the event. Depending on where the server's clock is:
   - **Turn 42 is in the past** (server already at 43+): store event on turn 42, `resimulateFrom(42)` replays forward.
   - **Turn 42 is current**: store event on turn 42; applied on the next server `tick()`.
   - **Turn 42 is in the future** (server still at 41): store event in the future turn slot; applied when the server reaches turn 42.
4. Server broadcasts `player:events` with `(shipId, [event], 42)` to all clients.
5. Clients receive the broadcast — always late relative to when they sent it. Turn 42 is now in the past, so `resimulateFrom(42)` replays forward, reconciling all clients (including the sender) with the authoritative state.

If the client's local simulation matched the server's evolution, step 5 produces no visible correction. If they diverged (e.g. another player's late event altered turn 42), step 5 corrects it.
