// @flow
const p2 = require('p2')
const Socket = require('socket.io-client/lib/socket.js')
const Turn = require('./Turn.js')
const PlayerInput = require('./PlayerInput.js')
const Ship = require('./Ship.js')
const C = require('./constants.js')

const { positionForShipId } = Turn
const { maxLapsForMap } = require('./tracks.js')
const { pickShipColor } = require('./colors.js')

const gravity = [0, 0]
let world = new p2.World({ gravity })
let bodies = []

function resetWorld (world) {
  const { solver, islandManager, broadphase, overlapKeeper } = world

  world.springs.length = 0
  world.bodies.length = 0
  world.contactMaterials.length = 0
  world.disabledBodyCollisionPairs.length = 0

  solver.removeAllEquations()
  delete solver._listeners

  world.narrowphase.reset()

  islandManager.equations.length = 0
  islandManager.islands.forEach((island) => {
    islandManager.islandPool.release(island)
  })
  islandManager.islands.length = 0
  islandManager.nodes.forEach((node) => {
    islandManager.nodePool.release(node)
  })
  islandManager.nodes.length = 0
  // no need to reset islandManager.queue

  // my gravity is always the same, no need to reset

  broadphase.result.length = 0
  broadphase.axisList.length = 0

  world.constraints.length = 0
  world.contactMaterials.length = 0
  world.time = 0.0
  world.accumulator = 0
  world._constraintIdCounter = 0 // unused?
  world._bodyIdCounter = 0 // unused?

  overlapKeeper.overlappingShapesLastState.reset()
  overlapKeeper.overlappingShapesCurrentState.reset()
  overlapKeeper.tmpDict.reset() // accumulator
  overlapKeeper.tmpArray1.length = 0

  p2.Body._idCounter = 0
  world.addContactMaterial(C.SHIP_VS_WALL_CONTACT_MTRL)
  world.addContactMaterial(C.SHIP_VS_SHIP_CONTACT_MTRL)
}

function getId (socket: Socket) { return (socket.client && socket.client.id) || socket.id }

class Game {
  map: Track
  isServer: boolean

  turn: Turn
  turnIndex: number
  turns: Array<?Turn>

  sockets: Array<?Socket>
  debugSockets: Array<?Socket>
  socketToShip: Object
  cellBodies: Array<p2.Body>

  lava: number
  lastTick: number
  sessionMode: string
  pendingPlayerEventBroadcasts: Array<{ shipId: number, events: Array<GameEvent>, turnIndex: number }>
  pendingServerEventBroadcasts: Array<{ event: GameEvent, turnIndex: number }>

  constructor (map : Track, isServer: boolean = false) {
    this.map = map
    this.isServer = isServer
    this.sessionMode = C.SESSION_MODE.IDLE

    this.turn = new Turn([], [], [])
    this.turnIndex = 0
    this.turns = [this.turn]
    this.sockets = []
    this.debugSockets = []
    this.socketToShip = {}
    this.pendingPlayerEventBroadcasts = []
    this.pendingServerEventBroadcasts = []

    this.generateCellBodies()
    this.lava = 0
    this.lastTick = Date.now()
  }

  generateCellBodies () {
    this.cellBodies = []

    // Merge wall cells into non-overlapping rectangles.
    // First scan each row for horizontal runs, then extend runs
    // downward across consecutive rows when the run is identical
    // (same start column and width). This avoids interior seams
    // inside solid rectangular wall blocks.
    let activeRuns = new Map()

    const flushRun = (run) => {
      const cellBody = new p2.Body({
        mass: 0,
        position: [run.startJ * C.CELL_EDGE, run.startI * C.CELL_EDGE]
      })
      const shape = new p2.Box({
        width: run.width * C.CELL_EDGE,
        height: run.height * C.CELL_EDGE,
        material: C.WALL_MTRL
      })
      cellBody.addShape(shape, [
        (run.width - 1) * C.CELL_EDGE / 2,
        (run.height - 1) * C.CELL_EDGE / 2
      ])
      this.cellBodies.push(cellBody)
    }

    this.map.grid.forEach((row, i) => {
      const currentRuns = new Map()
      let j = 0
      while (j < row.length) {
        if (row[j] === C.WALL) {
          const startJ = j
          while (j < row.length && row[j] === C.WALL) ++j
          currentRuns.set(startJ, j - startJ)
        } else {
          ++j
        }
      }

      const continuedKeys = new Set()
      for (const [startJ, width] of currentRuns) {
        const active = activeRuns.get(startJ)
        if (active && active.width === width) {
          active.height++
          continuedKeys.add(startJ)
        }
      }

      for (const [, run] of activeRuns) {
        if (!continuedKeys.has(run.startJ)) flushRun(run)
      }

      const nextActiveRuns = new Map()
      for (const startJ of continuedKeys) {
        nextActiveRuns.set(startJ, activeRuns.get(startJ))
      }
      for (const [startJ, width] of currentRuns) {
        if (!continuedKeys.has(startJ)) {
          nextActiveRuns.set(startJ, { startJ, startI: i, width, height: 1 })
        }
      }

      activeRuns = nextActiveRuns
    })

    for (const [, run] of activeRuns) {
      flushRun(run)
    }
  }

  getShipIdForSocket (socket: Socket) {
    const socketId = getId(socket)
    return this.socketToShip[socketId]
  }

  changeMap (map: Track) {
    this.map = map
    this.generateCellBodies()
  }

  resetForTrackChange (
    map: Track,
    { includeBots = true, gridOrder }: { includeBots?: boolean, gridOrder?: Array<string> } = {}
  ) {
    if (!this.isServer) return

    const roster = this.turn.ships
      .map((ship, shipId) => {
        if (!ship) return null
        if (!includeBots && ship.isABot()) return null
        return { shipId, username: ship.username, color: ship.color }
      })
      .filter(entry => entry != null)

    if (gridOrder && gridOrder.length > 0) {
      const orderIndex = new Map(gridOrder.map((username, i) => [username, i]))
      roster.sort((a, b) => {
        const aIdx = orderIndex.has(a.username) ? orderIndex.get(a.username) : Number.MAX_SAFE_INTEGER
        const bIdx = orderIndex.has(b.username) ? orderIndex.get(b.username) : Number.MAX_SAFE_INTEGER
        if (aIdx !== bIdx) return aIdx - bIdx
        return a.shipId - b.shipId
      })
    }

    this.changeMap(map)
    this.pendingPlayerEventBroadcasts = []
    this.pendingServerEventBroadcasts = []

    const ships = []
    let gridSlot = 0
    roster.forEach((entry) => {
      const position = positionForShipId(map, gridSlot)
      ships[entry.shipId] = new Ship({
        position: [position[0], position[1]],
        velocity: [0, 0],
        angle: -Math.PI / 2,
        username: entry.username,
        color: entry.color,
        input: new PlayerInput(),
        checkpoint: 1,
        lap: 0,
        currentLaptime: 0,
        laptimes: [0],
        isDrafting: false
      })
      gridSlot++
    })

    this.turnIndex = 0
    this.lava = 0
    this.lastTick = Date.now()
    this.turn = new Turn(
      ships,
      [],
      [],
      C.GAME_STATE.START_COUNTDOWN,
      C.START_COUNTDOWN_S
    )
    this.turns = [this.turn]
  }

  bootstrapAllSockets () {
    if (!this.isServer) return
    this.sockets.forEach((socket) => {
      if (socket != null) this.bootstrapSocket(socket)
    })
  }

  resimulateFrom (turnIndex: number) {
    if (this.turnIndex <= turnIndex) return new Error('wtf')

    for (let i = turnIndex; i < this.turnIndex; ++i) {
      const currentTurn = this.turns[i]
      let nextTurn = this.turns[i + 1]
      if (nextTurn == null && i + 1 === this.turnIndex) nextTurn = new Turn([], [], [])
      if (!currentTurn || !nextTurn) {
        throw new C.InvalidTurnError(`Got lost ${turnIndex}, ${i}, ${this.lava}, ${this.turnIndex}`)
      }

      const { events, serverEvents } = nextTurn

      // reset world and re-add map bodies
      resetWorld(world)
      this.cellBodies.forEach((body) => {
        body.id = p2.Body._idCounter++
        world.addBody(body)
      })

      nextTurn = currentTurn.evolve(this.map, world, bodies, C.TIME_STEP, this.isServer, this.sessionMode)
      nextTurn.events = events
      nextTurn.serverEvents = serverEvents
      this.turns[i + 1] = nextTurn
      this.turn = nextTurn
    }

    if (this.isServer) {
      this.debugSockets.forEach((socket) => {
        if (socket != null) socket.emit('game:debug', this.turn)
      })
    }
  }

  onPlayerJoin (socket: Socket, username: string, debug: boolean = false, colorOverride: ?number = null, skipBootstrap: boolean = false) {
    if (!this.isServer) return

    const socketId = getId(socket)
    const shipId = this.turn.getFreeShipSlot()
    this.socketToShip[socketId] = shipId

    const reservedColors = this.turn.serverEvents
      .filter((sev) => sev.type === C.SERVER_EVENT.SPAWN_PLAYER)
      .map((sev) => sev.color)
    const color = colorOverride != null
      ? colorOverride
      : pickShipColor(this.turn.ships, Math.random, reservedColors)
    const event = {
      type: C.SERVER_EVENT.SPAWN_PLAYER,
      val: shipId,
      username,
      color
    }
    this.onServerEvent(event, this.turnIndex)

    this.sockets[shipId] = socket
    if (!skipBootstrap) this.bootstrapSocket(socket)
    if (debug) this.debugSockets.push(socket)
  }

  bootstrapSocket (socket: Socket) {
    if (!this.isServer) return
    const initialTurn = Math.max(this.turnIndex - C.TURN_MAX_DELAY, 0)
    let turnsSlice = this.turns.slice(initialTurn)

    // delete `ships` info for all turns but the first one
    // client will obtain the data resimulating from the first turn
    turnsSlice = turnsSlice.map((turn, i) => {
      if (i === 0 || turn == null) return turn
      return {
        events: turn.events,
        serverEvents: turn.serverEvents,
        ships: []
      }
    })

    const socketId = getId(socket)
    const shipId = this.socketToShip[socketId]

    socket.emit('game:bootstrap', {
      initialTurn,
      map: this.map,
      turnsSlice,
      shipId,
      lastTick: this.lastTick,
      sessionMode: this.sessionMode
    })
  }

  onPlayerLeave (socket: Socket) {
    if (!this.isServer) return
    const socketId = getId(socket)
    const shipId = this.socketToShip[socketId]

    delete this.socketToShip[socketId]
    delete this.sockets[shipId]

    const event = {
      type: C.SERVER_EVENT.DESTROY_PLAYER,
      val: shipId
    }
    this.onServerEvent(event, this.turnIndex)
  }

  /**
   * Store player input events on a turn without resimulating or broadcasting.
   * Used by batch handlers to apply multiple updates before a single resimulate.
   *
   * @param {number} shipId - Ship slot receiving the events
   * @param {Array<GameEvent>} events - Input events to attach
   * @param {number} turnIndex - Turn the events belong to
   * @returns {boolean} changed - Whether any meaningful events were stored (deduped no-ops return false)
   * @throws {C.InvalidTurnError} If turnIndex is below lava and no turn data exists
   */
  applyPlayerEvents (
    shipId: number,
    events: Array<GameEvent>,
    turnIndex: number
  ) : boolean {
    let turn = this.turns[turnIndex]
    if (turn == null && turnIndex > this.turnIndex) {
      turn = new Turn([], [], [])
      this.turns[turnIndex] = turn
    }
    if (turn == null) {
      throw new C.InvalidTurnError(`Player sent event for turn ${turnIndex}, and only accepting events for turn ${this.lava} minimum.`)
    }

    const changed = turn.addEvents(shipId, events)
    return changed
  }

  /**
   * Store a server event on a turn without resimulating or broadcasting.
   * Used by batch handlers to apply multiple updates before a single resimulate.
   *
   * @param {GameEvent} event - Server event to attach (e.g. spawn/destroy player)
   * @param {number} turnIndex - Turn the event belongs to
   * @returns {boolean} changed - Whether the event was stored; currently always true (see Turn.addServerEvent)
   */
  applyServerEvent (event: GameEvent, turnIndex: number) : boolean {
    let turn = this.turns[turnIndex]
    if (turn == null) {
      turn = new Turn([], [], [])
      this.turns[turnIndex] = turn
    }

    const changed = turn.addServerEvent(event)
    return changed
  }

  coalescePlayerEventBroadcasts (queue) {
    const byKey = new Map()
    const keyOrder = []

    for (const entry of queue) {
      const key = `${entry.turnIndex}:${entry.shipId}`
      if (!byKey.has(key)) {
        keyOrder.push(key)
        byKey.set(key, { shipId: entry.shipId, turnIndex: entry.turnIndex, events: entry.events.slice() })
      } else {
        byKey.get(key).events.push(...entry.events)
      }
    }

    return keyOrder.map((key) => byKey.get(key))
  }

  applyEventsBatch ({ player = [], server = [] }) {
    let minTurnIndex = Infinity

    for (const { event, turnIndex } of server) {
      if (this.applyServerEvent(event, turnIndex)) {
        minTurnIndex = Math.min(minTurnIndex, turnIndex)
      }
    }
    for (const { shipId, events, turnIndex } of player) {
      if (this.applyPlayerEvents(shipId, events, turnIndex)) {
        minTurnIndex = Math.min(minTurnIndex, turnIndex)
      }
    }

    return minTurnIndex
  }

  flushEventBroadcasts () {
    if (!this.isServer) return

    const player = this.coalescePlayerEventBroadcasts(this.pendingPlayerEventBroadcasts)
    const server = this.pendingServerEventBroadcasts
    this.pendingPlayerEventBroadcasts = []
    this.pendingServerEventBroadcasts = []

    if (player.length === 0 && server.length === 0) return

    const batch = { player, server }
    this.sockets.forEach((socket) => {
      if (socket != null) socket.emit('game:events:batch', batch)
    })
  }

  onPlayerEvents (
    shipId: number,
    events: Array<GameEvent>,
    turnIndex: number
  ) {
    const changed = this.applyPlayerEvents(shipId, events, turnIndex)
    if (changed) {
      this.resimulateFrom(turnIndex)

      if (this.isServer) {
        this.pendingPlayerEventBroadcasts.push({ shipId, events, turnIndex })
      }
    }
  }

  onServerEvent (event: GameEvent, turnIndex: number) {
    const changed = this.applyServerEvent(event, turnIndex)
    if (changed) {
      this.resimulateFrom(turnIndex)

      if (this.isServer) {
        this.pendingServerEventBroadcasts.push({ event, turnIndex })
      }
    }
  }

  canTick () {
    return Date.now() - (this.lastTick + C.CLIENT_LEAD) >= C.TIME_STEP
  }

  tick () {
    while (this.canTick()) {
      this.lastTick += C.TIME_STEP
      const currentTurnIndex = this.turnIndex
      ++this.turnIndex
      this.resimulateFrom(currentTurnIndex)

      // get rid of old turns
      if (this.turnIndex - this.lava > C.TURN_MAX_DELAY * (this.isServer ? 1 : 2)) {
        this.turns[this.lava] = null
        ++this.lava
      }
    }

    this.flushEventBroadcasts()
    return this.turn
  }

  isPlayerInLastLap (username) {
    const ship = this.turn.ships.find(s => s && (s.username === username))
    if (!ship) return false
    return (ship.lap === maxLapsForMap(this.map))
  }

  lapForPlayer (username) {
    const ship = this.turn.ships.find(s => s && (s.username === username))
    if (!ship) return -1
    return ship.currentLaptime
  }

  fakeTick () {
    let dt = Math.max(
      0,
      Date.now() - (this.lastTick + C.CLIENT_LEAD)
    )
    dt = Math.min(dt, C.TIME_STEP - 1)
    dt = Math.floor(dt)
    if (dt === 0) return this.turn

    // reset world and re-add map bodies
    resetWorld(world)
    this.cellBodies.forEach((body) => {
      body.id = p2.Body._idCounter++
      world.addBody(body)
    })

    return this.turn.evolve(this.map, world, bodies, dt, false, this.sessionMode)
  }
}

module.exports = Game
