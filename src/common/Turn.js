// @flow
const p2 = require('p2')
const { vec2 } = p2
const PlayerInput = require('./PlayerInput.js')
const Ship = require('./Ship.js')
const C = require('./constants.js')

class Turn {
  ships: Array<Ship>
  events: Array<Array<GameEvent>>
  serverEvents: Array<GameEvent>

  constructor (
    ships: Array<Ship>,
    events: Array<Array<GameEvent>>,
    serverEvents: Array<GameEvent>
  ) {
    this.ships = ships
    this.events = events
    this.serverEvents = serverEvents
  }

  getFreeShipSlot () : number {
    let freeSlot = 0

    const reservedSlots = {}
    this.serverEvents.forEach(serverEvent => {
      if (serverEvent.type !== C.SERVER_EVENT.SPAWN_PLAYER) return
      reservedSlots[serverEvent.val] = true
    })

    while (this.ships[freeSlot] != null || reservedSlots[freeSlot]) ++freeSlot
    return freeSlot
  }

  addEvent (evs: GameEvent | Array<GameEvent>, shipId: number) {
    if (!Array.isArray(evs)) evs = [evs]
    const existingEvents = this.events[shipId] || []
    this.events[shipId] = existingEvents.concat(evs)
  }

  addServerEvent (evs: GameEvent | Array<GameEvent>) {
    if (!Array.isArray(evs)) evs = [evs]
    this.serverEvents = this.serverEvents.concat(evs)
  }

  evolve (world: p2.World, bodies: Array<p2.Body>) {
    const nextInputs = []
    this.ships.forEach((ship, i) => {
      const body = bodies[i]
      body.position = vec2.clone(ship.position)
      body.velocity = vec2.clone(ship.velocity)
      body.angle = ship.angle

      const playerEvents = this.events[i]
      const input = new PlayerInput(ship.input)
      input.turnL = false
      input.turnR = false
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

      nextInputs[i] = input
    })

    // consume server events
    this.serverEvents.forEach((sev) => {
      switch (sev.type) {
        case C.SERVER_EVENT.SPAWN_PLAYER:
          const shipId = sev.val

          const body = new p2.Body({
            mass: 5,
            position: [7, 15],
            fixedRotation: true
          })
          bodies[shipId] = body

          const shape = new p2.Box({ width: 2, height: 2 })
          body.addShape(shape)
          world.addBody(body)
          break
      }
    })

    world.step(C.TIME_STEP)

    const nextShips = bodies.map((body, i) => {
      const ship = this.ships[i]
      const color = ship != null ? ship.color : Math.random() * 0xFFFFFF

      return new Ship(
        vec2.clone(body.position),
        vec2.clone(body.velocity),
        body.angle,
        color,
        nextInputs[i] || new PlayerInput()
      )
    })

    const nextTurn = new Turn(nextShips, [], [])
    return nextTurn
  }
}

module.exports = Turn
