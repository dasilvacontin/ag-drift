// @flow
const p2 = require('p2')
const { vec2 } = p2
const PlayerInput = require('./PlayerInput.js')
const Ship = require('./Ship.js')
const C = require('./constants.js')

function resetBody (body) {
  delete body._listeners
  body.id = p2.Body._idCounter++
  body.world = null

  // no need to reset shapes / boundingRadius / AABB
  // no need to reset mass/invMass/inertia/invInertia/Solve
  // no need to reset fixedRotation, massMultipler

  vec2.set(body.position, 0, 0)
  vec2.set(body.interpolatedPosition, 0, 0)
  vec2.set(body.previousPosition, 0, 0)
  vec2.set(body.velocity, 0, 0)

  body.angle = body.previousAngle = body.interpolatedAngle = 0
  body.angularVelocity = 0

  // no need to reset damping/angularDamping

  body.setZeroForce()
  body.resetConstraintVelocity()

  body.idleTime = body.timeLastSleepy = 0
  body.concavePath = null
  body._wakeUpAfterNarrowphase = false
}

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
    this.events[shipId] = existingEvents

    // check if new events are meaningful, and save them if so.
    // let the caller know.
    let changed = false

    evs.forEach((ev) => {
      let foundRelated = false

      for (let i = existingEvents.length - 1; i >= 0; --i) {
        const exEv = existingEvents[i]

        if (exEv.type === ev.type) {
          foundRelated = true

          if (exEv.val !== ev.val) {
            changed = true
            existingEvents.push(ev)
          }

          break
        }
      }

      if (!foundRelated) {
        changed = true
        existingEvents.push(ev)
      }
    })

    return changed
  }

  addServerEvent (evs: GameEvent | Array<GameEvent>) : boolean {
    if (!Array.isArray(evs)) evs = [evs]
    this.serverEvents = this.serverEvents.concat(evs)

    // TO-DO: actually check if significant changes were made
    return true
  }

  evolve (map: Track, world: p2.World, bodies: Array<p2.Body>, dt: number) {
    const nextInputs = []

    // create / remove bodies
    const length = Math.max(this.ships.length, bodies.length)
    for (let i = 0; i < length; ++i) {
      const ship = this.ships[i]
      let body = bodies[i]

      if (ship) {
        if (body == null) {
          body = new p2.Body({
            mass: 5,
            position: [102, 52],
            angle: -Math.PI / 2,
            fixedRotation: true
          })

          const shape = new p2.Box({
            width: 2,
            height: 2,
            material: C.SHIP_MTRL
          })
          body.addShape(shape)
          bodies[i] = body
        } else {
          resetBody(body)
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

          const shape = new p2.Box({
            width: 2,
            height: 2,
            material: C.SHIP_MTRL
          })
          body.addShape(shape)
          world.addBody(body)

          const ship = new Ship({
            position: vec2.clone(body.position),
            velocity: vec2.clone(body.velocity),
            angle: body.angle,
            username: sev.username,
            color: sev.color,
            input: new PlayerInput(),
            checkpoint: 1,
            lap: 0
          })
          this.ships[shipId] = ship

          break
      }
    })

    // apply player inputs
    this.ships.forEach((ship, i) => {
      if (ship == null) return

      let body = bodies[i]

      // init / reset props for determinism
      vec2.copy(body.position, ship.position)
      vec2.copy(body.velocity, ship.velocity)
      body.angle = ship.angle
      vec2.set(body.force, 0, 0)
      body.angularForce = 0

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

    world.step(dt)

    const nextShips = bodies.map((body, i) => {
      const ship = this.ships[i]
      if (!ship) return

      const ci = Math.floor((body.position[1] + C.CELL_EDGE / 2) / C.CELL_EDGE)
      const cj = Math.floor((body.position[0] + C.CELL_EDGE / 2) / C.CELL_EDGE)

      const oldCheckpoint = ship.checkpoint
      const cell = map[ci][cj]
      let lap = ship.lap

      // obtain current checkpoint
      let checkpoint = (cell === ' ' ? NaN : Number(map[ci][cj]))
      if (isNaN(checkpoint)) checkpoint = oldCheckpoint

      // detect checkpoint change
      // checkpoint number is descending, lap is indicated as a
      // jump from low number to high number
      if (checkpoint !== oldCheckpoint) {
        if (checkpoint == oldCheckpoint - 1) {
          // cool, progressing
        } else if (checkpoint == oldCheckpoint + 1) {
          // going backwards
        } else if (checkpoint > oldCheckpoint + 1) {
          // number jump indicates going from last checkpoint to
          // first checkpoint, i.e. crossed finish line
          lap++
        } else if (checkpoint < oldCheckpoint - 1) {
          // going backwards and crossed finish line
          lap--
        }
      }

      return new Ship({
        position: vec2.clone(body.position),
        velocity: vec2.clone(body.velocity),
        angle: body.angle,
        username: ship.username,
        color: ship.color,
        input: nextInputs[i],
        checkpoint,
        lap
      })
    })

    const nextTurn = new Turn(nextShips, [], [])
    return nextTurn
  }
}

module.exports = Turn
