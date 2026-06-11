/* eslint-env mocha */
const expect = require('unexpected')
const Game = require('../src/common/Game')
const Turn = require('../src/common/Turn')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const PlayerEvent = require('../src/common/PlayerEvent')
const C = require('../src/common/constants')
const p2 = require('p2')
const { tracks, track4 } = require('../src/common/tracks')

const { positionForShipId } = Turn

function makeShip (track, inputOverrides = {}) {
  const position = positionForShipId(track, 0)
  return new Ship({
    position: [position[0], position[1]],
    velocity: [0, 0],
    angle: -Math.PI / 2,
    username: 'TestPilot',
    color: 0xFF0000,
    input: new PlayerInput(inputOverrides),
    checkpoint: 1,
    lap: 0,
    currentLaptime: 0,
    laptimes: [0],
    isDrafting: false
  })
}

function createRace (track, initialInput) {
  const game = new Game(track, true)
  const ship = makeShip(track, initialInput)
  game.turn = new Turn([ship], [], [], C.GAME_STATE.IN_PROGRESS, 0)
  game.turnIndex = 0
  game.turns = [game.turn]
  return game
}

function applyInput (game, inputChanges) {
  const events = []
  const keyMap = {
    gas: C.PLAYER_EVENT.GAS,
    boost: C.PLAYER_EVENT.BOOST,
    leanL: C.PLAYER_EVENT.LEAN_L,
    leanR: C.PLAYER_EVENT.LEAN_R,
    turnL: C.PLAYER_EVENT.TURN_L,
    turnR: C.PLAYER_EVENT.TURN_R
  }
  for (const [key, val] of Object.entries(inputChanges)) {
    if (keyMap[key]) events.push(new PlayerEvent(keyMap[key], val))
  }
  if (events.length > 0) {
    game.applyPlayerEvents(0, events, game.turnIndex)
  }
}

function tickGame (game) {
  game.turnIndex++
  game.turns[game.turnIndex] = new Turn([], [], [])
  game.resimulateFrom(game.turnIndex - 1)
  return game.turn.ships[0]
}

function pointInShape (px, py, body, shape) {
  const ox = body.position[0] + shape.position[0]
  const oy = body.position[1] + shape.position[1]

  if (shape instanceof p2.Box) {
    return (
      px >= ox - shape.width / 2 &&
      px <= ox + shape.width / 2 &&
      py >= oy - shape.height / 2 &&
      py <= oy + shape.height / 2
    )
  }

  if (shape.vertices) {
    const verts = shape.vertices
    const n = verts.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ex = verts[j][0] - verts[i][0]
      const ey = verts[j][1] - verts[i][1]
      const tx = px - (ox + verts[i][0])
      const ty = py - (oy + verts[i][1])
      if (ex * ty - ey * tx < 0) return false
    }
    return true
  }

  return false
}

describe('Physics: wall collider coverage', () => {
  tracks.forEach((track) => {
    it(`${track.name}: non-wall cells should not overlap wall colliders`, () => {
      const game = new Game(track, true)
      const grid = track.grid

      for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
          if (grid[i][j] === C.WALL) continue

          const cx = j * C.CELL_EDGE
          const cy = i * C.CELL_EDGE

          for (const body of game.cellBodies) {
            for (const shape of body.shapes) {
              expect(
                pointInShape(cx, cy, body, shape),
                'to be false'
              )
            }
          }
        }
      }
    })
  })
})

describe('Physics: cell collider wall bounce', () => {
  it('hitting a side wall on Bowser Castle should not bounce the ship backward', () => {
    // Ship starts facing left (angle = -π/2) on Bowser Castle.
    // Gas accelerates it leftward (-x). LeanR pushes it upward (-y)
    // toward the upper wall. The ship should bounce away from the
    // wall (back toward +y) without reversing its forward (leftward)
    // velocity.
    //
    // BUG: the wall is composed of per-cell box colliders. Where a
    // horizontal bar and a vertical bar overlap at a cell boundary,
    // the ship can collide with the vertical bar's right face,
    // producing a +x (backward) impulse instead of the expected +y
    // (away from wall) impulse.
    const game = createRace(track4, { gas: true })

    // Accelerate for a few ticks, then engage leanR
    for (let t = 0; t < 4; t++) tickGame(game)
    applyInput(game, { leanR: true })

    // Simulate up to 80 ticks — the backward bounce occurs around tick 56
    const FRONT_WALL_X = 20
    let bouncedBackward = false

    for (let t = 4; t < 80; t++) {
      const ship = tickGame(game)
      if (!ship) break

      // vx > 0 means moving rightward = backward for a left-facing ship.
      // Only count it if we're far from the front wall (x > 20).
      if (ship.velocity[0] > 0.1 && ship.position[0] > FRONT_WALL_X) {
        bouncedBackward = true
        break
      }
    }

    // This test currently FAILS — demonstrating the bug.
    // When the cell collider overlap issue is fixed, this test will pass.
    expect(bouncedBackward, 'to be', false)
  })
})
