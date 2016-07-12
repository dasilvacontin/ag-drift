const p2 = require('p2')
const { vec2 } = p2
const PlayerInput = require('./PlayerInput.js')
const Ship = require('./Ship.js')
const C = require('./constants.js')

const world = new p2.World({ gravity: [0, 0] })

class Turn {
  ships: Array<Ship>
  events: Array<GameEvent>
  serverEvents: Array<GameEvent>

  constructor (ships: Array<Ship>, events: Array<GameEvent>, serverEvents: Array<GameEvent>) {
    this.ships = ships
    this.events = events
    this.serverEvents = serverEvents
  }

  getFreeShipSlot () : number {
    let freeSlot = 0

    const reservedSlots = {}
    this.serverEvents.forEach(serverEvent => {
      if (serverEvent.type !== C.EVENT_TYPE.SPAWN_PLAYER) return
      reservedSlots[serverEvent.shipId] = true
    })

    while (this.ships[freeSlot] != null || reservedSlots[freeSlot]) ++freeSlot
    return freeSlot
  }

  addEvent (evs: GameEvent | Array<GameEvent>) {
    if (!Array.isArray(evs)) evs = [evs]
    this.events = this.events.concat(evs)
  }

  addServerEvent (evs: GameEvent | Array<GameEvent>) {
    if (!Array.isArray(evs)) evs = [evs]
    this.serverEvents = this.serverEvents.concat(evs)
  }

  evolve (world, bodies) {
    this.ships.forEach((ship, i) => {
      let body = bodies[i]
      // TO-DO: handle when bodies haven't been created yet

      const playerEvents = this.events[i]

      const input = new PlayerInput(ship.input)
      playerEvents.forEach(input.applyPlayerEvent, input)

      // turn left
      if (input.turnL) body.angle += -Math.PI / 2

      // turn right
      if (input.turnR) body.angle += Math.PI / 2

      // main thruster force
      let boost = 0
      if (input.gas) boost = input.boost ? 2 : 1
      body.applyForceLocal([0, -C.FORCE * boost])

      // leaning right by engaging left thruster
      if (input.leanR) body.applyForceLocal([C.FORCE, 0])

      // leaning left by engaging right thruster
      if (input.leanL) body.applyForceLocal([-C.FORCE, 0])

      // air drag
      vec2.scale(body.velocity, body.velocity, 0.99)
    })

    world.step(C.TIME_STEP)

    const nextShips = this.ships.map((ship, i) => {
      let body = bodies[i]
      return new Ship(
        body.position.clone(),
        body.velocity.clone(),
        ship.color
      )
    })

    const nextTurn = new Turn(nextShips, [], [])
    return nextTurn
  }
}

module.exports = Turn
