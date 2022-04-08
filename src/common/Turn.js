// @flow
const p2 = require('p2')
const clone = require('clone')
const { vec2 } = p2
const PlayerInput = require('./PlayerInput.js')
const Ship = require('./Ship.js')
const C = require('./constants.js')
const { log, timeToString } = require('./utils.js')
// const Mixpanel = require('mixpanel')

const RACE_RESULTS_DATABASE_ID = '9fd03df83faf4347b8289223fb46e6bd'
const LAP_RESULTS_DATABASE_ID = 'd8e17e9c905c4d19acfffbb33d6c7258'

let notion
if (process.env.IS_SERVER) {
  const dotenv = require('dotenv')
  dotenv.config()
  const NotionClient = require('@notionhq/client').Client
  notion = new NotionClient({ auth: process.env.NOTION_API_KEY })
  console.log('set up notion client')
}

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

function positionForShipId (map: Track, shipId: number) {
  // Find starting cell
  let startI = -1
  let startJ = -1
  for (let i = 0; i < map.grid.length; ++i) {
    for (let j = 0; j < map.grid[i].length; ++j) {
      if (map.grid[i][j] === map.startingCheckpoint) {
        startI = i + 0.20
        startJ = j + 1 - 0.25
        break
      }
    }
    if (startJ !== -1) break
  }

  const dx = shipId * 3
  const dy = (shipId % 2 === 0) ? 0 : -4
  return [startJ * C.CELL_EDGE + dx, startI * C.CELL_EDGE + dy]
}

class Turn {
  ships: Array<?Ship>
  events: Array<?Array<GameEvent>>
  serverEvents: Array<Object>
  state: string
  counter: number

  constructor (
    ships: Array<?Ship>,
    events: Array<?Array<GameEvent>>,
    serverEvents: Array<Object>,
    state: string = C.GAME_STATE.IN_PROGRESS,
    counter: number = 0
  ) {
    this.ships = ships
    this.events = events
    this.serverEvents = serverEvents
    this.state = state
    this.counter = counter
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

  evolve (map: Track, world: p2.World, bodies: Array<p2.Body>, dt: number, isServer: boolean) {
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
    let ships: Array<?Ship> = clone(this.ships)
    let {state, counter} = this
    this.serverEvents.forEach((sev) => {
      const shipId = sev.val

      switch (sev.type) {
        case C.SERVER_EVENT.SPAWN_PLAYER:
          const body = new p2.Body({
            mass: 5,
            position: positionForShipId(map, shipId),
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
            lap: 0,
            currentLaptime: 0,
            laptimes: [0]
          })
          ships[shipId] = ship

          break

        case C.SERVER_EVENT.DESTROY_PLAYER:
          delete ships[shipId]
          // TODO: should probably do something with the ship's body?
          break
      }
    })

    // apply player inputs
    ships.forEach((ship, i) => {
      if (ship == null) return

      let body = bodies[i]

      // init / reset props for determinism
      vec2.copy(body.position, ship.position)
      vec2.copy(body.velocity, ship.velocity)
      body.angle = ship.angle
      vec2.set(body.force, 0, 0)
      body.angularForce = 0

      const playerEvents = this.events[i] || []
      let input = new PlayerInput(ship.input)
      input.turnL = false
      input.turnR = false

      if (!ship.hasFinishedRace() &&
          (state === C.GAME_STATE.IN_PROGRESS ||
           state === C.GAME_STATE.FINISH_COUNTDOWN)) {
        // only apply inputs if still racing
        // otherwise vfx for the boosters will show
        playerEvents.forEach(input.applyPlayerEvent, input)

        if (map.boostDisabled) {
          input.boost = false
        }

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
      } else input = new PlayerInput()

      // air drag
      vec2.scale(body.velocity, body.velocity, 0.99)

      // ground drag
      const ci = Math.floor((body.position[1] + C.CELL_EDGE / 2) / C.CELL_EDGE)
      const cj = Math.floor((body.position[0] + C.CELL_EDGE / 2) / C.CELL_EDGE)
      const cell = ((map.grid[ci] || {})[cj] || ' ')
      if (cell === ';') {
        vec2.scale(body.velocity, body.velocity, 0.95)
      }

      ship.input = input
    })

    world.step(dt / 1000)

    const nextShips = bodies.map((body, i) => {
      const ship = ships[i]
      if (!ship) return

      const ci = Math.floor((body.position[1] + C.CELL_EDGE / 2) / C.CELL_EDGE)
      const cj = Math.floor((body.position[0] + C.CELL_EDGE / 2) / C.CELL_EDGE)

      const oldCheckpoint = ship.checkpoint
      const cell = ((map.grid[ci] || {})[cj] || ' ')

      // obtain current checkpoint
      let checkpoint = (cell === ' ' ? NaN : Number(map.grid[ci][cj]))
      if (isNaN(checkpoint)) checkpoint = oldCheckpoint

      // local vars to calc temp store new values
      let currentLaptime = ship.currentLaptime
      let laptimes = Array.from(ship.laptimes)

      // increase current lap's time
      if (!ship.hasFinishedRace()) laptimes[currentLaptime] += (dt / 1000)

      // detect checkpoint change
      // checkpoint number is descending, lap is indicated as a
      // jump from low number to high number
      if (checkpoint !== oldCheckpoint) {
        if (checkpoint === oldCheckpoint - 1) {
          // cool, progressing
        } else if (checkpoint === oldCheckpoint + 1) {
          // going backwards
        } else if (checkpoint > oldCheckpoint + 1) {
          // number jump indicates going from last checkpoint to
          // first checkpoint, i.e. crossed finish line
          const hadFinishedRace = ship.hasFinishedRace()
          ship.lap++

          // complete laptime if it applies
          if (ship.lap > ship.currentLaptime) {
            if (isServer && ship.currentLaptime > 0 && !ship.isABot()) {
              notion.pages.create({
                parent: {
                  database_id: LAP_RESULTS_DATABASE_ID
                },
                properties: {
                  Name: {
                    title: [
                      {
                        text: {
                          content: `${ship.username} finished a lap`
                        }
                      }
                    ]
                  },
                  'Username': {
                    rich_text: [
                      {
                        type: 'text',
                        text: {
                          content: ship.username
                        }
                      }
                    ]
                  },
                  'Track name': {
                    rich_text: [
                      {
                        type: 'text',
                        text: {
                          content: map.name
                        }
                      }
                    ]
                  },
                  'Lap time': {
                    number: ship.laptimes[ship.currentLaptime]
                  }
                }
              })
            }
            ship.currentLaptime = ship.lap
            laptimes.push(0)
          }

          if (!hadFinishedRace && ship.hasFinishedRace()) {
            const position = ships.reduce((sum, ship, i) => sum + (ship && ship.hasFinishedRace() ? 1 : 0), 0)
            if (!ship.isABot()) {
              // sending race results to telegram
              log(
                ship.username,
                map.name,
                timeToString(ship.totalTime()),
                timeToString(ship.bestLap()),
                position
              )
              if (isServer) {
                notion.pages.create({
                  parent: {
                    database_id: RACE_RESULTS_DATABASE_ID
                  },
                  properties: {
                    Name: {
                      title: [
                        {
                          text: {
                            content: `${ship.username} finished a race`
                          }
                        }
                      ]
                    },
                    'Username': {
                      rich_text: [
                        {
                          type: 'text',
                          text: {
                            content: ship.username
                          }
                        }
                      ]
                    },
                    'Track name': {
                      rich_text: [
                        {
                          type: 'text',
                          text: {
                            content: map.name
                          }
                        }
                      ]
                    },
                    'Total time': {
                      number: ship.totalTime()
                    },
                    'Final position': {
                      number: position
                    },
                    'Number of players': {
                      number: this.ships.filter(s => s).length
                    },
                    'Number of human players': {
                      number: this.ships.filter(s => s && !s.isABot()).length
                    },
                    'Number of laps': {
                      number: ship.lap
                    }
                  }
                })
                /*
                Mixpanel.singleton.track('Player finished race', {
                  username: ship.username,
                  track: map.id,
                  totalTime: ship.totalTime(),
                  bestLap: ship.bestLap(),
                  position: position
                })
                */
              }
            }

            if (state === C.GAME_STATE.IN_PROGRESS) {
              state = C.GAME_STATE.FINISH_COUNTDOWN
              counter = C.FINISH_COUNTDOWN_S
            }
          }
        } else if (checkpoint < oldCheckpoint - 1) {
          // going backwards and crossed finish line
          ship.lap--
        }
      }

      // TO-DO: get rid of this section, no need to re-clone the struct
      return new Ship({
        position: vec2.clone(body.position),
        velocity: vec2.clone(body.velocity),
        angle: body.angle,
        username: ship.username,
        color: ship.color,
        input: ship.input,
        checkpoint,
        lap: ship.lap,
        currentLaptime: ship.currentLaptime,
        laptimes
      })
    })

    // game state machine
    counter = Math.ceil(counter - 1)
    switch (state) {
      case C.GAME_STATE.FINISH_COUNTDOWN:
        if (counter === 0 ||
            ships.every(ship => !ship || ship.hasFinishedRace() || ship.isABot())) {
          state = C.GAME_STATE.RESULTS_SCREEN
          counter = C.RESULTS_SCREEN_S
        }
        break

      case C.GAME_STATE.RESULTS_SCREEN:
        if (counter === 0) {
          // game reset
          state = C.GAME_STATE.IN_PROGRESS
          nextShips.forEach((ship, i) => {
            if (!ship) return
            ship.position = positionForShipId(map, i)
            ship.velocity = [0, 0]
            ship.angle = -Math.PI / 2
            ship.checkpoint = 1
            ship.lap = 0
            ship.currentLaptime = 0
            ship.laptimes = [0]
          })
        }
        break
    }

    const nextTurn = new Turn(
      nextShips,
      [], // events
      [], // server events
      state,
      counter
    )
    return nextTurn
  }
}

module.exports = Turn
