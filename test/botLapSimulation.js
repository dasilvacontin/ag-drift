const Game = require('../src/common/Game')
const Turn = require('../src/common/Turn')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const PlayerEvent = require('../src/common/PlayerEvent')
const C = require('../src/common/constants')
const { buildBotInput } = require('../src/common/botDriver')

const { positionForShipId } = Turn

function makeBotShip (track, shipId = 0) {
  const position = positionForShipId(track, shipId)
  return new Ship({
    position: [position[0], position[1]],
    velocity: [0, 0],
    angle: -Math.PI / 2,
    username: 'LapBot (Bot)',
    color: 0xff0000,
    input: new PlayerInput(),
    checkpoint: 1,
    lap: 0,
    currentLaptime: 0,
    laptimes: [0],
    isDrafting: false
  })
}

// Lap 0→1 fires quickly at the start/finish line for timing; lap 2 means
// one full tour plus a short start straight.
function simulateBotUntilTwoLaps (track, colliderApproach, maxTicks = 100000) {
  const game = new Game(track, true, { colliderApproach })
  const ship = makeBotShip(track, 0)
  game.turn = new Turn([ship], [], [], C.GAME_STATE.IN_PROGRESS, 0)
  game.turnIndex = 0
  game.turns = [game.turn]

  let oldInput = new PlayerInput()
  game.applyPlayerEvents(0, [new PlayerEvent(C.PLAYER_EVENT.GAS, true)], 0)
  oldInput = new PlayerInput({ gas: true })

  let prevPosition = [ship.position[0], ship.position[1]]

  for (let tick = 1; tick <= maxTicks; tick++) {
    const currentShip = game.turn.ships[0]
    if (currentShip.lap >= 2) return tick

    const { input, events } = buildBotInput(
      track,
      currentShip,
      oldInput,
      prevPosition,
      game.turn.state
    )
    if (events.length > 0) {
      game.applyPlayerEvents(0, events, game.turnIndex)
    }
    oldInput = input

    game.turnIndex++
    game.turns[game.turnIndex] = new Turn([], [], [])
    game.resimulateFrom(game.turnIndex - 1)

    const nextShip = game.turn.ships[0]
    prevPosition = [nextShip.position[0], nextShip.position[1]]
  }

  return null
}

module.exports = {
  makeBotShip,
  simulateBotUntilTwoLaps
}
