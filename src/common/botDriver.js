// @flow
const { vec2 } = require('p2')
const PlayerEvent = require('./PlayerEvent.js')
const PlayerInput = require('./PlayerInput.js')
const C = require('./constants.js')
const { aiGridCellAtPosition } = require('./aiGrid.js')

const brainsByTrackId = {
  Chicane: require('./brains/brainChicane.js'),
  Hairpin: require('./brains/brainHairpin.js'),
  'Miracle Park': require('./brains/brainMiraclePark.js')
}

function getAngle (angle) {
  angle += Math.PI * 2
  return Math.round((angle % (Math.PI * 2)) / (Math.PI / 2))
}

function computeMemoryDistance (memory, ship) {
  return vec2.distance(memory[0], ship.position) +
         vec2.distance(memory[1], ship.velocity) / 7
}

function findClosestMemory (ship, brain) {
  let closestMemory = null
  let closestDistance = Infinity
  brain.forEach((memory) => {
    const distance = computeMemoryDistance(memory, ship)
    if (distance < closestDistance) {
      closestDistance = distance
      closestMemory = memory
    }
  })
  return closestMemory
}

function buildBotInput (track, ship, oldInput, prevPosition, gameState) {
  if (gameState === C.GAME_STATE.RESULTS_SCREEN) {
    return {
      input: new PlayerInput(),
      events: [new PlayerEvent(C.PLAYER_EVENT.GAS, false)]
    }
  }

  if (gameState === C.GAME_STATE.START_COUNTDOWN) {
    return { input: new PlayerInput(), events: [] }
  }

  const shipAngle = getAngle(ship.angle)
  let input = new PlayerInput()
  let targetAngle
  const brain = brainsByTrackId[track.id]
  const distanceMoved = prevPosition
    ? vec2.distance(ship.position, prevPosition)
    : 1
  const useMlPath = track.aiType === 'ml' &&
    brain &&
    brain.length > 0 &&
    !(gameState !== C.GAME_STATE.START_COUNTDOWN && distanceMoved === 0)

  if (useMlPath) {
    const closestMemory = findClosestMemory(ship, brain)
    if (!closestMemory) {
      return { input: new PlayerInput(), events: [] }
    }
    input = new PlayerInput(closestMemory[3])
    targetAngle = closestMemory[2]
    input.turnL = ((shipAngle - 1 + 4) % 4 === targetAngle) ||
                  ((shipAngle - 2 + 4) % 4 === targetAngle)
    input.turnR = ((shipAngle + 1 + 4) % 4 === targetAngle)
  } else {
    const gridCell = aiGridCellAtPosition(track, ship.position)
    switch (gridCell) {
      case 'u':
        targetAngle = 0
        break
      case 'r':
        targetAngle = 1
        break
      case 'l':
        targetAngle = 3
        break
      case 'd':
        targetAngle = 2
        break
      default:
        targetAngle = undefined
    }
    input.gas = true
    if (targetAngle !== undefined) {
      input.turnL = ((shipAngle - 1 + 4) % 4 === targetAngle) ||
                    ((shipAngle - 2 + 4) % 4 === targetAngle)
      input.turnR = ((shipAngle + 1 + 4) % 4 === targetAngle)
    }
    if (!track.boostDisabled) {
      input.boost = true
    }
  }

  const events = []
  if (input.turnL) events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_L, input.turnL))
  if (input.turnR) events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_R, input.turnR))
  if (input.leanL !== oldInput.leanL) {
    events.push(new PlayerEvent(C.PLAYER_EVENT.LEAN_L, input.leanL))
  }
  if (input.leanR !== oldInput.leanR) {
    events.push(new PlayerEvent(C.PLAYER_EVENT.LEAN_R, input.leanR))
  }
  if (input.gas !== oldInput.gas) {
    events.push(new PlayerEvent(C.PLAYER_EVENT.GAS, input.gas))
  }
  if (input.boost !== oldInput.boost) {
    events.push(new PlayerEvent(C.PLAYER_EVENT.BOOST, input.boost))
  }

  return { input, events }
}

module.exports = {
  buildBotInput
}
