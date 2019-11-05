/* global FPSMeter */
// @flow
const PIXI = global.PIXI = require('pixi.js')
const { Howl } = require('howler')
const kbd = require('@dasilvacontin/keyboard')
const { vec2 } = require('p2')
const io = require('socket.io-client')
const socket = io()

const Ship = require('../common/Ship.js')
const Turn = require('../common/Turn.js')
const Game = require('../common/Game.js')
const GameController = require('./GameController.js')
const PlayerEvent = require('../common/PlayerEvent.js')
const PlayerInput = require('../common/PlayerInput.js')
const C = require('../common/constants.js')
const { timeToString, repeat } = require('../common/utils.js')

const DEBUG_MODE = Boolean(localStorage.getItem('DEBUG'))
const MUSIC_OFF = Boolean(localStorage.getItem('MUSIC_OFF'))

let playing = false
const musicTracks = [
  'POL-divide-by-zero-short.wav', // +2
  'POL-night-in-motion-short.wav', // +2
  'POL-parallel-fields-short.wav' // +2
  /*
  'POL-catch-me-short.wav', // +1
  'POL-grid-breaking-short.wav', // +1
  'POL-higher-short.wav', // +1
  'POL-humanoid-short.wav', // +1
  'POL-mathrix-short.wav' // +1
  */
]
function getRandomMusicTrack () {
  // night in motion is bae
  const index = Number(localStorage.getItem('trackIndex') || 1)
  const track = musicTracks[index]
  console.log(track)
  return 'sounds/' + track
}
const bgMusic = new Howl({
  urls: [getRandomMusicTrack()],
  buffer: true,
  loop: true
})

function bool (a) {
  return (a === 'true' || a === '1' || a === true || a === 1)
}

const renderer = new PIXI.autoDetectRenderer(
  window.innerWidth,
  window.innerHeight,
  { backgroundColor: C.WALL_COLOR })
document.body.appendChild(renderer.view)

// so that you can lose focus from the chat box
const chatContainer = document.getElementById('chat')
const tempChatInput = chatContainer.querySelector('input')
let chatInput: HTMLInputElement
if (!(tempChatInput instanceof HTMLInputElement)) throw new Error('kek')
chatInput = tempChatInput

function loseFocus () {
  if (document.activeElement) document.activeElement.blur()
}
renderer.view.addEventListener('click', loseFocus)
const TAB_KEYCODE = 9
const ESC_KEYCODE = 27
const RETURN_KEYCODE = 13
const SPACEBAR_KEYCODE = 32
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.keyCode === ESC_KEYCODE) loseFocus()
  if (e.keyCode === TAB_KEYCODE) {
    console.log('got tab')
    if (document.activeElement === chatInput) document.activeElement.blur()
    else chatInput.focus()
    e.preventDefault()
  }
  if (e.keyCode === RETURN_KEYCODE) {
    if (document.activeElement === chatInput) {
      const text = chatInput.value
      chatInput.value = ''
      socket.emit('msg', text)
      // lose focus so that player can continue racing
      document.activeElement.blur()
    } else {
      // additional way for chat input to gain focus
      chatInput.focus()
    }
  }
  if (e.keyCode === SPACEBAR_KEYCODE) {
    if (document.activeElement !== chatInput) e.preventDefault()
  }
})

function magic (input) {
  input = input.replace(/&/g, '&amp;')
  input = input.replace(/</g, '&lt;')
  input = input.replace(/>/g, '&gt;')
  return input
}
socket.on('msg', (username: string, color: number, text: string) => {
  const msgWrapper = document.createElement('div')
  msgWrapper.className = 'chat-message'

  const msg = document.createElement('p')
  msg.innerHTML = `<b><span style="color: ${numberToHexColor(color)}">${magic(username)}:</b> ${magic(text)}`

  msgWrapper.appendChild(msg)
  chatContainer.appendChild(msgWrapper)

  chatContainer.scrollTop = chatContainer.scrollHeight
})

const camera = new PIXI.Container()
const ZOOM = 12

function onResize () {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.view.style.width = width + 'px'
  renderer.view.style.height = height + 'px'
  renderer.resize(width, height)
}
onResize()
window.addEventListener('resize', onResize)

function padIsKeyDown (gamepad, key) {
  if (gamepad == null) return false
  const { buttons } = gamepad
  const axes = gamepad.axes.map(Math.round)

  switch (key) {
    case kbd.RIGHT_ARROW: return axes[0] === 1 || buttons[15] && buttons[15].pressed
    case kbd.LEFT_ARROW: return axes[0] === -1 || buttons[14] && buttons[14].pressed
    case kbd.UP_ARROW: return buttons[2].pressed
    case 'a': return buttons[4].pressed
    case 'd': return buttons[5].pressed || buttons[6].pressed
    case 's': return buttons[0].pressed
    default: throw new Error('Unsupported key')
  }
}

let sentPing
let ping
let minPing = Infinity
// client's Date.now() - server's Date.now()

function sendPing () {
  sentPing = Date.now()
  socket.emit('game:ping')
}
sendPing()

socket.on('game:pong', (serverNow) => {
  const now = Date.now()
  ping = (now - sentPing) / 2
  if (ping < minPing) {
    minPing = ping
    C.CLIENT_LEAD = now - (serverNow + minPing)
  }
  setTimeout(sendPing, 500)
})
setInterval(() => {
  console.log({ ping, clientLead: C.CLIENT_LEAD })
}, 5 * 1000)

let game, gameController, myShipId
let debugGame, debugGameController
const oldInputs = []

const getGamepads = navigator.getGamepads || (() => [])

const meter = typeof FPSMeter !== 'undefined' && DEBUG_MODE
  ? new FPSMeter()
  : { tickStart: () => {}, tick: () => {} }

const brain = []
window.brain = brain

function computeMemoryDistance (memory, ship) {
  return vec2.distance(memory[0], ship.position) +
         vec2.distance(memory[1], ship.velocity) / 10
}

function findClosestMemory (ship) {
  let closestMemory = null
  let closestDistance = Infinity
  brain.forEach(memory => {
    const distance = computeMemoryDistance(memory, ship)
    if (distance < closestDistance) {
      closestDistance = distance
      closestMemory = memory
    }
  })
  return closestMemory
}

function getAngle (angle) {
  angle += (Math.PI * 2)
  return Math.round((angle % (Math.PI * 2)) / (Math.PI / 2))
}

function gameLoop () {
  requestAnimationFrame(gameLoop)

  if (game == null) return
  meter.tickStart()

  // get inputs for this turn
  let gamepads = getGamepads.apply(navigator)
  game.turn.ships.forEach((ship, i) => {
    if (ship == null || i !== myShipId) return

    const gamepad = gamepads[i]
    const oldInput = oldInputs[i] || new PlayerInput()
    let input = new PlayerInput()

    if (shouldAILearn || (!shouldAILearn && !shouldAIExecute)) {
      input.turnL = padIsKeyDown(gamepad, kbd.LEFT_ARROW)
      input.turnR = padIsKeyDown(gamepad, kbd.RIGHT_ARROW)
      input.leanL = padIsKeyDown(gamepad, 'a')
      input.leanR = padIsKeyDown(gamepad, 'd')
      input.gas = padIsKeyDown(gamepad, kbd.UP_ARROW)
      input.boost = padIsKeyDown(gamepad, 's')

      // keyboard
      input.turnL = input.turnL || kbd.isKeyDown(kbd.LEFT_ARROW)
      input.turnR = input.turnR || kbd.isKeyDown(kbd.RIGHT_ARROW)
      input.leanL = input.leanL || kbd.isKeyDown('a')
      input.leanR = input.leanR || kbd.isKeyDown('d')
      input.gas = input.gas || kbd.isKeyDown(kbd.UP_ARROW)
      input.boost = input.boost || kbd.isKeyDown('s')
    }

    // save into brain if ai disabled
    const shipAngle = getAngle(ship.angle)

    if (shouldAILearn) {
      const anyKeyIsDown = input.leanL || input.leanR || input.gas
      if (Math.random() < 0.1 && anyKeyIsDown) {
        brain.push([ship.position, ship.velocity, getAngle(ship.angle), input])
      }
    } else if (shouldAIExecute) {
      const closestMemory = findClosestMemory(ship)
      input = new PlayerInput(closestMemory[3])
      const angle = closestMemory[2]
      input.turnL = ((shipAngle - 1) % 4 === angle) ||
                    ((shipAngle - 2) % 4 === angle)
      input.turnR = ((shipAngle + 1) % 4 === angle)
    }

    // generate PlayerEvents from input - oldInput
    const events = []
    if (input.turnL && !oldInput.turnL) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_L, input.turnL))
    }
    if (input.turnR && !oldInput.turnR) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_R, input.turnR))
    }
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

    if (events.length > 0) {
      game.onPlayerEvents(myShipId, events, game.turnIndex)
      socket.emit('player:events', events, game.turnIndex)
    }
    oldInputs[i] = input
  })

  // perform physics updates
  const currentTurn = game.canTick()
    ? game.tick()
    : game.fakeTick()

  // update ship sprites
  gameController.update(currentTurn)

  // update camera
  const [halfWidth, halfHeight] = [
    window.innerWidth,
    window.innerHeight
  ].map(e => e / 2)

  const player = gameController.ships[myShipId]
  if (player) {
    const { stage } = gameController
    stage.position = new PIXI.Point(
      halfWidth - player.sprite.position.x * stage.scale.x,
      halfHeight - player.sprite.position.y * stage.scale.y)
    camera.pivot = { x: halfWidth, y: halfHeight }
    camera.position = new PIXI.Point(halfWidth, halfHeight)
    camera.rotation += (-player.sprite.rotation - camera.rotation) / 15
  }
  renderer.render(camera)
  renderLeaderboard()
  meter.tick()
}

function numberToHexColor (color: number) {
  let hexcolor = color.toString(16)
  return `#${repeat('0', 6 - hexcolor.length)}${hexcolor}`
}

function filterNulls<T> (arr: Array<?T>) : Array<T> {
  const result = []
  arr.forEach((elem) => {
    if (elem != null) result.push(elem)
  })
  return result
}

const leaderboard = document.getElementById('leaderboard')
function renderLeaderboard () {
  const ships: Array<Ship> = filterNulls(game.turn.ships)
  ships.sort((a: Ship, b: Ship) => {
    if (a.lap > b.lap) return -1
    else if (b.lap > a.lap) return 1

    if (a.checkpoint !== b.checkpoint) return (a.checkpoint - b.checkpoint)
    const aTotalTime = a.laptimes.reduce((prev, curr, i) => prev + curr, 0)
    const bTotalTime = b.laptimes.reduce((prev, curr, i) => prev + curr, 0)
    return (aTotalTime - bTotalTime)
  })
  const maxUsernameLength = ships.reduce((max, ship) => {
    if (ship == null) return max
    return Math.max(max, ship.username.length)
  }, 0)

  let title = 'Username'
  let leaderboardContent = `| ${title}${repeat(' ', Math.max(0, maxUsernameLength - title.length))} | `

  title = 'Laps'
  leaderboardContent += `${title} | `

  title = 'Time'
  const timeLength = '0:00.000'.length
  leaderboardContent += `${title}${repeat(' ', timeLength - title.length)} | `

  title = 'Best lap'
  leaderboardContent += `${title}${repeat(' ', timeLength - title.length)} |<br>`

  const usernameSectionLength = Math.max(maxUsernameLength, 'Username'.length)

  leaderboardContent += `| ${repeat('-', usernameSectionLength)} | ${repeat('-', 'Laps'.length)} | ${repeat('-', timeLength)} | ${repeat('-', timeLength)} |<br>`

  ships.forEach((ship) => {
    if (ship == null) return
    const { color, username } = ship
    const lap = ship.lap > C.MAX_LAPS
      ? '⚑'
      : `${Math.max(1, ship.lap)}/${C.MAX_LAPS}`

    // time stuff
    const totalTime = ship.totalTime()
    let bestLap = ship.bestLap()
    bestLap = (bestLap === Infinity ? repeat(' ', timeLength) : timeToString(bestLap))

    leaderboardContent += `| <span style="color: ${numberToHexColor(color)}">${username}</span>${repeat(' ', usernameSectionLength - username.length)} | ${repeat(' ', 'Laps'.length - lap.length)}${lap} | ${timeToString(totalTime)} | ${bestLap} |<br>`
  })

  if (game.turn.state === C.GAME_STATE.FINISH_COUNTDOWN) {
    leaderboardContent += `&nbsp;&nbsp;Finishing race in ${Math.ceil(game.turn.counter * C.TIME_STEP / 1000)}...`
  } else if (game.turn.state === C.GAME_STATE.RESULTS_SCREEN) {
    leaderboardContent += `&nbsp;&nbsp;Restarting game in ${Math.ceil(game.turn.counter * C.TIME_STEP / 1000)}...`
  }

  if (leaderboard.innerHTML !== leaderboardContent) {
    leaderboard.innerHTML = leaderboardContent
  }
}

const AI_ENABLED = bool(localStorage.AI_ENABLED)
let shouldAIExecute = false
let shouldAILearn = false
let leaderboardBgColor = ''

function updateLeaderboardBGColor () {
  let bg = ''
  if (shouldAILearn) bg = 'red'
  else if (shouldAIExecute) bg = 'blue'
  leaderboard.style.background = bg
}

// avoid moving the page around
document.addEventListener('keydown', (e: KeyboardEvent) => {
  switch (e.keyCode) {
    case kbd.LEFT_ARROW:
    case kbd.RIGHT_ARROW:
    case kbd.UP_ARROW:
    case kbd.DOWN_ARROW:
      e.preventDefault()
      break
    case kbd.SPACE_BAR:
      console.log('spacebar!')
      if (AI_ENABLED) {
        shouldAILearn = true
        updateLeaderboardBGColor()
      }
      break
    case 77: // 'm' for MODE
      if (AI_ENABLED) {
        shouldAIExecute = !shouldAIExecute
        updateLeaderboardBGColor()
      }
      break
    default:
      break
  }
}, false)
document.addEventListener('keyup', (e: KeyboardEvent) => {
  if (e.keyCode === kbd.SPACE_BAR) {
    if (AI_ENABLED) {
      shouldAILearn = false
      updateLeaderboardBGColor()
    }
  }
})

socket.on('game:bootstrap', (data) => {
  const { initialTurn, map, turnsSlice, shipId, lastTick } = data
  myShipId = shipId

  // so that I don't go cray cray with the music
  if (MUSIC_OFF || (DEBUG_MODE && shipId !== 0)) {
    console.log('not playing music')
  } else if (!playing) {
    console.log('play music')
    playing = true
    bgMusic.play()
  }

  game = new Game(map)
  game.turns = []
  let lastTurn
  for (let i = 0; i < turnsSlice.length; ++i) {
    let { ships, events, serverEvents } = turnsSlice[i]
    ships = ships.map((rawShip) => rawShip && new Ship(rawShip))
    const turn = new Turn(ships, events, serverEvents)
    game.turns[initialTurn + i] = turn
    lastTurn = turn
  }
  if (lastTurn == null) return
  game.turn = lastTurn
  game.turnIndex = game.turns.length - 1
  game.lastTick = lastTick
  game.lava = initialTurn
  game.resimulateFrom(initialTurn)

  if (gameController != null) {
    camera.removeChild(gameController.stage)
  }

  gameController = new GameController(game)
  gameController.stage.scale = { x: ZOOM, y: ZOOM }
  camera.addChild(gameController.stage)

  if (DEBUG_MODE) {
    debugGame = new Game(map)
    debugGameController = new GameController(debugGame, true)
    debugGameController.stage.alpha = 0.5
    gameController.stage.addChild(debugGameController.stage)
  }

  console.log('got bootstrapped by server')
  setTimeout(function () {
    const myShip = game.turn.ships[myShipId]
    if (myShip != null) {
      const hexColor = numberToHexColor(myShip.color)
      leaderboard.style.boxShadow = `${hexColor} 2px 2px`
      chatInput.style.boxShadow = `${hexColor} 2px 2px`
    }
  }, 0)
})

socket.on('server:event', (event, turnIndex) => {
  game.onServerEvent(event, turnIndex)
})

socket.on('player:events', (shipId, events, turnIndex) => {
  // applying own inputs since game might have been bootstrapped after
  // client issued such commands
  // if (shipId === myShipId) return
  if (game == null) return
  try {
    game.onPlayerEvents(shipId, events, turnIndex)
  } catch (e) {
    if (e instanceof C.InvalidTurnError) {
      console.log('got lost, requesting bootstrap')
      socket.emit('player:lost')
    }
  }
})

socket.on('game:debug', (turn) => {
  if (!DEBUG_MODE) return
  debugGameController.update(turn)
})

gameLoop()

const username = localStorage.getItem('username') || prompt('Username:')
localStorage.setItem('username', username)

socket.emit('game:join', username, DEBUG_MODE)

const version = require('../package.json').version
document.getElementById('gameVersion').innerHTML = `v${version}`
