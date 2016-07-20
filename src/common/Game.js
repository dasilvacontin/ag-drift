// @flow
const p2 = require('p2')
const Socket = require('socket.io-client/lib/socket.js')
const Turn = require('./Turn.js')
const C = require('./constants.js')

const gravity = [0, 0]
const world = new p2.World({ gravity })
const bodies = []

function resetWorld (world) {
  const { solver, islandManager, broadphase, overlapKeeper } = world
  delete world._listeners

  world.springs.length = 0
  world.bodies.length = 0
  world.disabledBodyCollisionPairs.length = 0

  solver.removeAllEquations()
  delete solver._listeners

  world.narrowphase.reset()

  islandManager.equations.length = 0
  islandManager.islands.forEach((island) => {
    islandManager.islandPool.release(island)
  })
  islandManager.nodes.forEach((node) => {
    islandManager.nodePool.release(node)
  })
  islandManager.nodes.length = 0
  // no need to reset islandManager.queue

  // my gravity is always the same, no need to reset

  broadphase.result.length = 0
  broadphase.setWorld(world)

  world.constraints.length = 0
  world.contactMaterials.length = 0
  world.time = 0.0
  world.accumulator = 0
  world._constraintIdCounter = 0
  world._bodyIdCounter = 0

  overlapKeeper.overlappingShapesLastState.reset()
  overlapKeeper.overlappingShapesCurrentState.reset()
  overlapKeeper.tmpDict.reset()
  overlapKeeper.tmpArray1.length = 0
}

function getId (socket: Socket) { return socket.client.id || socket.id }

class Game {
  map: Track
  isServer: boolean

  turn: Turn
  turnIndex: number
  turns: Array<?Turn>

  sockets: Array<?Socket>
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
    this.socketToShip = {}

    this.cellBodies = []

    map.forEach((row, i) => {
      row.forEach((cell, j) => {
        // if it's a wall, add a collider
        if (cell === 1) {
          const cellShape = new p2.Box({
            width: C.CELL_EDGE,
            height: C.CELL_EDGE
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

    this.lava = 0
    this.lastTick = Date.now()
  }

  getShipIdForSocket (socket: Socket) {
    const socketId = getId(socket)
    return this.socketToShip[socketId]
  }

  resimulateFrom (turnIndex: number) {
    if (this.turnIndex <= turnIndex) return new Error('wtf')

    for (let i = turnIndex; i < this.turnIndex; ++i) {
      const currentTurn = this.turns[i]
      let nextTurn = this.turns[i + 1] || new Turn([], [], [])
      if (!currentTurn) break

      const { events, serverEvents } = nextTurn
      resetWorld(world)
      this.cellBodies.forEach(body => world.addBody(body))

      nextTurn = currentTurn.evolve(world, bodies)
      nextTurn.events = events
      nextTurn.serverEvents = serverEvents
      this.turns[i + 1] = nextTurn
      this.turn = nextTurn
    }

    this.sockets.forEach((socket) => {
      if (socket == null) return
      socket.emit('game:debug', this.turn)
    })
  }

  onPlayerJoin (socket: Socket) {
    if (!this.isServer) return

    const socketId = getId(socket)
    const shipId = this.turn.getFreeShipSlot()
    this.socketToShip[socketId] = shipId

    const event = {
      type: C.SERVER_EVENT.SPAWN_PLAYER,
      val: shipId,
      color: Math.floor(Math.random() * 0xFFFFFF)
    }
    this.turn.addServerEvent(event)

    this.sockets.forEach((socket) => {
      if (socket == null) return
      socket.emit('server:event', event, this.turnIndex)
    })

    // TO-DO: send a single turn and for the following turns only
    // send the events - client can reach current turn evolving the
    // provided one using the events.
    const initialTurn = Math.max(this.turnIndex - C.TURN_MAX_DELAY, 0)
    const turnsSlice = this.turns.slice(initialTurn)
    socket.emit('game:bootstrap', {
      initialTurn,
      map: this.map,
      turnsSlice,
      shipId,
      lastTick: this.lastTick
    })
    this.sockets[shipId] = socket
  }

  onPlayerLeave (socket: Socket) {
    // TO-DO: implement
  }

  onPlayerEvents (
    shipId: number,
    events: Array<GameEvent>,
    turnIndex: number
  ) {
    let turn = this.turns[turnIndex]
    if (turn == null) {
      turn = new Turn([], [], [])
      this.turns[turnIndex] = turn
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
    if (this.isServer) return
    let turn = this.turns[turnIndex]
    if (turn == null) {
      turn = new Turn([], [], [])
      this.turns[turnIndex] = turn
    }

    const changed = turn.addServerEvent(event)
    if (changed) this.resimulateFrom(turnIndex)
  }

  canTick () {
    return Date.now() - this.lastTick >= C.TIME_STEP
  }

  tick () {
    while (this.canTick()) {
      this.lastTick += C.TIME_STEP
      const currentTurnIndex = this.turnIndex
      ++this.turnIndex
      this.resimulateFrom(currentTurnIndex)

      // get rid of old turns
      if (this.turnIndex - this.lava > C.TURN_MAX_DELAY) {
        this.turns[this.lava] = null
        ++this.lava
      }
    }
  }
}

module.exports = Game
