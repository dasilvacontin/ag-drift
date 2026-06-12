const Game = require('../src/common/Game')
const Turn = require('../src/common/Turn')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const PlayerEvent = require('../src/common/PlayerEvent')
const C = require('../src/common/constants')

const DIRECTIONS = {
  left: { di: 0, dj: -1, angle: -Math.PI / 2, axis: 0, sign: -1 },
  right: { di: 0, dj: 1, angle: Math.PI / 2, axis: 0, sign: 1 },
  up: { di: -1, dj: 0, angle: 0, axis: 1, sign: -1 },
  down: { di: 1, dj: 0, angle: Math.PI, axis: 1, sign: 1 }
}

function isRoad (grid, i, j) {
  if (i < 0 || j < 0 || i >= grid.length) return false
  const row = grid[i]
  if (j >= row.length) return false
  return row[j] !== C.WALL
}

function cellCenter (i, j) {
  return [j * C.CELL_EDGE, i * C.CELL_EDGE]
}

function shipGridCell (ship) {
  const ci = Math.floor((ship.position[1] + C.CELL_EDGE / 2) / C.CELL_EDGE)
  const cj = Math.floor((ship.position[0] + C.CELL_EDGE / 2) / C.CELL_EDGE)
  return [ci, cj]
}

function isInWallCell (ship, grid) {
  const [ci, cj] = shipGridCell(ship)
  return ((grid[ci] || [])[cj] || ' ') === C.WALL
}

// Default ship angle is -π/2 (faces left on screen). Relative to the player:
// - behind → thrust +x (world "right")
// - left   → thrust +y (world "down")
const PLAYER_WALL_SIDES = {
  behind: 'right',
  left: 'down'
}

function hasPhysicsBounce (ship, prevVelocity, direction) {
  const { axis, sign } = DIRECTIONS[direction]
  const v = ship.velocity[axis]
  const pv = prevVelocity[axis]
  if (sign < 0 && pv < -1 && v > pv + 1) return true
  if (sign > 0 && pv > 1 && v < pv - 1) return true
  return false
}

function hasWallContact (ship, prevVelocity, direction, grid) {
  const { axis, sign } = DIRECTIONS[direction]
  if (isInWallCell(ship, grid)) return true
  const v = ship.velocity[axis]
  const pv = prevVelocity[axis]
  if (sign < 0 && pv < -0.5 && v > -0.5) return true
  if (sign > 0 && pv > 0.5 && v < 0.5) return true
  return false
}

// Longest straight road run ending at a wall in the given direction.
function findWallTestStart (track, direction) {
  const grid = track.grid
  const { di, dj } = DIRECTIONS[direction]
  let best = null

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      if (!isRoad(grid, i, j)) continue
      const wi = i + di
      const wj = j + dj
      if (((grid[wi] || [])[wj] || ' ') !== C.WALL) continue

      let run = 1
      let si = i
      let sj = j
      while (true) {
        const pi = si - di
        const pj = sj - dj
        if (!isRoad(grid, pi, pj)) break
        si = pi
        sj = pj
        run++
      }

      if (!best || run > best.run) {
        best = { i: si, j: sj, run }
      }
    }
  }

  return best
}

function makeWallTestShip (track, direction, start) {
  const position = cellCenter(start.i, start.j)
  return new Ship({
    position,
    velocity: [0, 0],
    angle: DIRECTIONS[direction].angle,
    username: 'WallBot',
    color: 0xff0000,
    input: new PlayerInput({ gas: true }),
    checkpoint: 1,
    lap: 0,
    currentLaptime: 0,
    laptimes: [0],
    isDrafting: false
  })
}

// Requires a real physics bounce while still on road. Passing into a wall
// grid cell without bouncing means the collider failed to block the ship.
function simulateStrictWallBounce (track, direction, colliderApproach, maxTicks = 500) {
  const start = findWallTestStart(track, direction)
  if (!start) return { bounced: false, reason: 'no-start' }

  const game = new Game(track, true, { colliderApproach })
  const ship = makeWallTestShip(track, direction, start)
  game.turn = new Turn([ship], [], [], C.GAME_STATE.IN_PROGRESS, 0)
  game.turnIndex = 0
  game.turns = [game.turn]
  game.applyPlayerEvents(0, [new PlayerEvent(C.PLAYER_EVENT.GAS, true)], 0)

  let prevVelocity = [0, 0]

  for (let tick = 1; tick <= maxTicks; tick++) {
    game.turnIndex++
    game.turns[game.turnIndex] = new Turn([], [], [])
    game.resimulateFrom(game.turnIndex - 1)

    const currentShip = game.turn.ships[0]
    if (isInWallCell(currentShip, track.grid)) {
      return { bounced: false, reason: 'passed-through', tick }
    }
    if (hasPhysicsBounce(currentShip, prevVelocity, direction)) {
      return { bounced: true, tick }
    }
    prevVelocity = [currentShip.velocity[0], currentShip.velocity[1]]
  }

  return { bounced: false, reason: 'timeout', tick: null }
}

function simulatePlayerRelativeWallBounce (
  track,
  side,
  colliderApproach,
  maxTicks = 500
) {
  const direction = PLAYER_WALL_SIDES[side]
  return simulateStrictWallBounce(track, direction, colliderApproach, maxTicks)
}

function simulateUntilWallHit (track, direction, colliderApproach, maxTicks = 500) {
  const start = findWallTestStart(track, direction)
  if (!start) return null

  const game = new Game(track, true, { colliderApproach })
  const ship = makeWallTestShip(track, direction, start)
  game.turn = new Turn([ship], [], [], C.GAME_STATE.IN_PROGRESS, 0)
  game.turnIndex = 0
  game.turns = [game.turn]
  game.applyPlayerEvents(0, [new PlayerEvent(C.PLAYER_EVENT.GAS, true)], 0)

  let prevVelocity = [0, 0]

  for (let tick = 1; tick <= maxTicks; tick++) {
    game.turnIndex++
    game.turns[game.turnIndex] = new Turn([], [], [])
    game.resimulateFrom(game.turnIndex - 1)

    const currentShip = game.turn.ships[0]
    if (hasWallContact(currentShip, prevVelocity, direction, track.grid)) {
      return tick
    }
    prevVelocity = [currentShip.velocity[0], currentShip.velocity[1]]
  }

  return null
}

module.exports = {
  DIRECTIONS,
  PLAYER_WALL_SIDES,
  findWallTestStart,
  hasPhysicsBounce,
  simulatePlayerRelativeWallBounce,
  simulateStrictWallBounce,
  simulateUntilWallHit
}
