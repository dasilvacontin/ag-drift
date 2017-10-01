// @flow
const p2 = require('p2')
const Socket = require('socket.io-client/lib/socket.js')
const Turn = require('./Turn.js')
const C = require('./constants.js')

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

function getId (socket: Socket) { return socket.client.id || socket.id }

function randomColor () {
  const tri1 = Math.floor(Math.random() * 3)
  let tri2 = tri1
  while (tri2 === tri1) tri2 = Math.floor(Math.random() * 3)
  const weak = Math.floor(Math.random() * (0xFF + 1))
  const color = (0xFF << (tri1 * 8)) +
                (weak << (tri2 * 8))
  return color
}

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

  constructor (map : Track, isServer: boolean = false) {
    this.map = map
    this.isServer = isServer

    this.turn = new Turn([], [], [])
    this.turnIndex = 0
    this.turns = [this.turn]
    this.sockets = []
    this.debugSockets = []
    this.socketToShip = {}

    this.generateCellBodies()
    this.lava = 0
    this.lastTick = Date.now()
  }

  generateCellBodies () {
    this.cellBodies = []

    this.map.forEach((row, i) => {
      row.forEach((cell, j) => {
        // if it's a wall, add a collider
        if (cell === C.WALL) {
          const cellShape = new p2.Box({
            width: C.CELL_EDGE,
            height: C.CELL_EDGE,
            material: C.WALL_MTRL
          })
          const cellBody = new p2.Body({
            mass: 0,
            position: [j * C.CELL_EDGE, i * C.CELL_EDGE]
          })
          cellBody.addShape(cellShape)
          this.cellBodies.push(cellBody)
        }
      })
    })
  }

  getShipIdForSocket (socket: Socket) {
    const socketId = getId(socket)
    return this.socketToShip[socketId]
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

      nextTurn = currentTurn.evolve(this.map, world, bodies, C.TIME_STEP)
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

  onPlayerJoin (socket: Socket, username: string, debug: boolean = false) {
    if (!this.isServer) return

    const socketId = getId(socket)
    const shipId = this.turn.getFreeShipSlot()
    this.socketToShip[socketId] = shipId

    const event = {
      type: C.SERVER_EVENT.SPAWN_PLAYER,
      val: shipId,
      username,
      color: randomColor()
    }
    this.onServerEvent(event, this.turnIndex)

    this.sockets[shipId] = socket
    this.bootstrapSocket(socket)
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
      lastTick: this.lastTick
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

  onPlayerEvents (
    shipId: number,
    events: Array<GameEvent>,
    turnIndex: number
  ) {
    let turn = this.turns[turnIndex]
    if (turn == null && turnIndex > this.turnIndex) {
      turn = new Turn([], [], [])
      this.turns[turnIndex] = turn
    }
    if (turn == null) {
      throw new C.InvalidTurnError(`Player sent event for turn ${turnIndex}, and only accepting events for turn ${this.lava} minimum.`)
    }

    const changed = turn.addEvents(shipId, events)
    if (changed) {
      this.resimulateFrom(turnIndex)

      if (this.isServer) {
        this.sockets.forEach((socket) => {
          if (socket == null) return
          socket.emit('player:events', shipId, events, turnIndex)
        })
      }
    }
  }

  onServerEvent (event: GameEvent, turnIndex: number) {
    let turn = this.turns[turnIndex]
    if (turn == null) {
      turn = new Turn([], [], [])
      this.turns[turnIndex] = turn
    }

    const changed = turn.addServerEvent(event)
    if (changed) {
      this.resimulateFrom(turnIndex)

      if (this.isServer) {
        this.sockets.forEach((socket) => {
          if (socket == null) return
          socket.emit('server:event', event, turnIndex)
        })
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

    return this.turn
  }

  fakeTick () {
    let dt = Math.max(
      0,
      Date.now() - (this.lastTick + C.CLIENT_LEAD)
    )
    dt = Math.min(dt, C.TIME_STEP - 1)
    dt = Math.floor(dt)
    if (dt === 0) return this.turn
    console.log(`fake tick of ${dt}ms`)

    // reset world and re-add map bodies
    resetWorld(world)
    this.cellBodies.forEach((body) => {
      body.id = p2.Body._idCounter++
      world.addBody(body)
    })

    return this.turn.evolve(this.map, world, bodies, dt)
  }
}

module.exports = Game
