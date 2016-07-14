// @flow
const p2 = require('p2')
const { vec2 } = p2
const PlayerInput = require('./PlayerInput.js')
const Ship = require('./Ship.js')
const C = require('./constants.js')

class Turn {
  ships: Array<?Ship>
  events: Array<?Array<GameEvent>>
  serverEvents: Array<Object>

  constructor (
    ships: Array<?Ship>,
    events: Array<?Array<GameEvent>>,
    serverEvents: Array<Object>
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

  addEvents (shipId: number, evs: Array<GameEvent>) : boolean {
    const existingEvents = this.events[shipId] || []
    this.events[shipId] = existingEvents.concat(evs)

    // TO-DO: actually check if significant changes were made
    return true
  }

  addServerEvent (evs: GameEvent | Array<GameEvent>) : boolean {
    if (!Array.isArray(evs)) evs = [evs]
    this.serverEvents = this.serverEvents.concat(evs)

    // TO-DO: actually check if significant changes were made
    return true
  }

  evolve (world: p2.World, bodies: Array<p2.Body>) {
    const nextInputs = []

    // create / remove bodies
    const length = Math.max(this.ships.length, bodies.length)
    for (let i = 0; i < length; ++i) {
      const ship = this.ships[i]
      let body = bodies[i]

      if (body) world.removeBody(body)

      if (ship) {
        if (body == null) {
          body = new p2.Body({
            mass: 5,
            position: [102, 52],
            angle: -Math.PI / 2,
            fixedRotation: true
          })

          const shape = new p2.Box({ width: 2, height: 2 })
          body.addShape(shape)
          bodies[i] = body
        }
        world.addBody(body)
      }
    }

    // consume server events
    this.serverEvents.forEach((sev) => {
      switch (sev.type) {
        case C.SERVER_EVENT.SPAWN_PLAYER:
          const shipId = sev.val

          const body = new p2.Body({
            mass: 5,
            position: [102, 52],
            angle: -Math.PI / 2,
            fixedRotation: true
          })
          bodies[shipId] = body

          const shape = new p2.Box({ width: 2, height: 2 })
          body.addShape(shape)
          world.addBody(body)

          const ship = new Ship({
            position: vec2.clone(body.position),
            velocity: vec2.clone(body.velocity),
            angle: body.angle,
            color: sev.color,
            input: new PlayerInput()
          })
          this.ships[shipId] = ship

          break
      }
    })

    // apply player inputs
    this.ships.forEach((ship, i) => {
      // TO-DO: get rid of body, if any. currently irrelevant til players
      // can actually leave the game
      if (ship == null) return

      let body = bodies[i]

      // init / reset props for determinism
      body.position = vec2.clone(ship.position)
      body.velocity = vec2.clone(ship.velocity)
      body.angle = ship.angle
      body.inertia = body.invInertia = 0
      body.vlambda = vec2.create()
      body.wlambda = 0
      body.angularVelocity = 0
      body.force = vec2.create()
      body.angularForce = 0
      body.damping = body.angularDamping = 0.1

      const playerEvents = this.events[i] || []
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

    world.step(C.TIME_STEP / 1000)

    const nextShips = bodies.map((body, i) => {
      const ship = this.ships[i]
      const color = ship != null ? ship.color : Math.random() * 0xFFFFFF

      return new Ship({
        position: vec2.clone(body.position),
        velocity: vec2.clone(body.velocity),
        vlambda: vec2.clone(body.vlambda),
        wlambda: body.wlambda,
        angle: body.angle,
        color: color,
        input: nextInputs[i] || new PlayerInput()
      })
    })

    const nextTurn = new Turn(nextShips, [], [])
    return nextTurn
  }
}

module.exports = Turn
