/* global FPSMeter, twttr, brain */
// @flow
const PIXI = global.PIXI = require('pixi.js')
const { Howl } = require('howler')
const kbd = require('@dasilvacontin/keyboard')
const { vec2 } = require('p2')
const io = require('socket.io-client')
const socket = io()
const mixpanel = require('mixpanel-browser')

const Ship = require('../common/Ship.js')
const Turn = require('../common/Turn.js')
const Game = require('../common/Game.js')
const GameController = require('./GameController.js')
const PlayerEvent = require('../common/PlayerEvent.js')
const PlayerInput = require('../common/PlayerInput.js')
const C = require('../common/constants.js')
const { timeToString, repeat } = require('../common/utils.js')

const DEBUG_MODE = Boolean(localStorage.getItem('DEBUG'))

mixpanel.init('e8281c4dfc67e5a7954bcb73f5633584', {
  debug: true,
  loaded: function () {
    setTimeout(function () {
      if (mixpanel.get_distinct_id() !== username) {
        mixpanel.identify(username)
      }
      mixpanel.people.set({ username: username, $name: username })
    }, 1000)
  }
})
mixpanel.track('Client game load')

let bgMusic
let bgMusicFinalLap
let finishedRaceMusic
let lapSound
let setupBackgroundMusic = function (config) {
  bgMusic = new Howl({
    src: [config.bgmusicURL],
    preload: true,
    loop: true,
    autoplay: false
  })
  if (config.finalLapMusicURL) {
    bgMusicFinalLap = new Howl({
      src: [config.finalLapMusicURL],
      preload: true,
      loop: false,
      autoplay: false
    })
  }
  finishedRaceMusic = new Howl({
    src: [config.finishedRaceMusicURL || 'sounds/race-end.mp3'],
    preload: true,
    loop: false,
    autoplay: false
  })
  lapSound = new Howl({
    src: ['sounds/lapSound.wav'],
    preload: true,
    loop: false,
    autoplay: false
  })
  setupBackgroundMusic = () => {}
}

let musicBeingPlayed = null
let lastLap = null
const TWITTER_EVENT_RACE_COMPLETE = 'o8dsg'
function switchBgMusic () {
  if (!gameController || !gameController.game) return
  const lap = gameController.game.lapForPlayer(username)
  if (lastLap === null) lastLap = lap

  if (lastLap < lap && lap >= 2 && lap <= C.MAX_LAPS) {
    lapSound.play()
  }
  lastLap = lap

  switch (gameController.game.turn.state) {
    case C.GAME_STATE.START_COUNTDOWN:
      bgMusic.stop()
      bgMusicFinalLap && bgMusicFinalLap.stop()
      musicBeingPlayed = ''
      const player = gameController.ships[myShipId]
      if (camera && player) {
        camera.rotation = -player.sprite.rotation
      }
      break

    case C.GAME_STATE.IN_PROGRESS:
    case C.GAME_STATE.FINISH_COUNTDOWN:
      if (lap < C.MAX_LAPS && musicBeingPlayed !== 'BG_MUSIC') {
        bgMusicFinalLap && bgMusicFinalLap.stop()
        bgMusic.play()
        musicBeingPlayed = 'BG_MUSIC'
      } else if (lap === C.MAX_LAPS && musicBeingPlayed !== 'FINAL_LAP') {
        if (bgMusicFinalLap) {
          bgMusic.stop()
          bgMusicFinalLap.play()
        }
        musicBeingPlayed = 'FINAL_LAP'
      } else if ((lap === C.MAX_LAPS + 1) && musicBeingPlayed !== 'VICTORY_MUSIC') {
        bgMusic.stop()
        bgMusicFinalLap && bgMusicFinalLap.stop()
        finishedRaceMusic.play()
        musicBeingPlayed = 'VICTORY_MUSIC'
        twttr.conversion.trackPid(TWITTER_EVENT_RACE_COMPLETE, { tw_sale_amount: 0, tw_order_quantity: 0 })
      }
      break

    case C.GAME_STATE.RESULTS_SCREEN:
      if (musicBeingPlayed !== 'RESULTS_SCREEN_MUSIC') {
        bgMusic.stop()
        bgMusicFinalLap && bgMusicFinalLap.stop()
        if (lap === C.MAX_LAPS + 1 && musicBeingPlayed !== 'VICTORY_MUSIC') {
          finishedRaceMusic.play()
          twttr.conversion.trackPid(TWITTER_EVENT_RACE_COMPLETE, { tw_sale_amount: 0, tw_order_quantity: 0 })
        }
        musicBeingPlayed = 'RESULTS_SCREEN_MUSIC'
      }
      break
  }
}

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
let isBgMusicPlaying = false
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (isBgMusicPlaying === false && bgMusic) {
    setInterval(switchBgMusic, 100)
    isBgMusicPlaying = true
  }
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
      mixpanel.track('Player sent a msg')
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
  input = input.replace(/\n/g, '<br>')
  return input
}

function addChatMessage (username, color, text) {
  const msgWrapper = document.createElement('div')
  msgWrapper.className = 'chat-message'

  const msg = document.createElement('p')
  msg.innerHTML = `<b><span style="color: ${numberToHexColor(color)}">${magic(username)}:</b> ${magic(text)}`

  msgWrapper.appendChild(msg)
  chatContainer.appendChild(msgWrapper)

  chatContainer.scrollTop = chatContainer.scrollHeight
}
function addSystemMessage (text) {
  const msgWrapper = document.createElement('div')
  msgWrapper.className = 'chat-message'

  const msg = document.createElement('p')
  msg.innerHTML = `${magic(text)}`

  msgWrapper.appendChild(msg)
  chatContainer.appendChild(msgWrapper)

  chatContainer.scrollTop = chatContainer.scrollHeight
}

socket.on('msg', (username: string, color: number, text: string) => {
  addChatMessage(username, color, text)
})
socket.on('system-msg', (text) => addSystemMessage(text))
socket.on('the-crown', (username) => {
  window.theCrown = username
  gameController && gameController.regenerateAllShipSprites()
})

const camera = new PIXI.Container()
let cameraZoom = 12

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
  if (isBgMusicPlaying === false && bgMusic && (buttons[1].pressed || buttons[2].pressed)) {
    setInterval(switchBgMusic, 100)
    isBgMusicPlaying = true
  }
  const axes = gamepad.axes.map(Math.round)

  switch (key) {
    case kbd.RIGHT_ARROW: return axes[0] === 1 || buttons[15] && buttons[15].pressed
    case kbd.LEFT_ARROW: return axes[0] === -1 || buttons[14] && buttons[14].pressed
    case kbd.UP_ARROW: return buttons[2].pressed || buttons[1].pressed
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

let game : Game, gameController, myShipId
let debugGame, debugGameController
let oldInputs = []

const getGamepads = navigator.getGamepads || (() => [])

const meter = typeof FPSMeter !== 'undefined' && DEBUG_MODE
  ? new FPSMeter()
  : { tickStart: () => {}, tick: () => {} }

type Memory = [[number, number], [number, number], number, {gas: boolean, boost: boolean, leanL: boolean, leanR: boolean, turnL: boolean, turnR: boolean}]

// eslint-disable-next-line
const brain1: Array<Memory> = require('../common/brains/brainChicane.js')
// eslint-disable-next-line
const brain2: Array<Memory> = require('../common/brains/brainHairpin.js')
// eslint-disable-next-line
const brain3: Array<Memory> = require('../common/brains/brainMiraclePark.js')
const brain4 = []
window.brain = brain4

function computeMemoryDistance (memory, ship) {
  return vec2.distance(memory[0], ship.position) +
         vec2.distance(memory[1], ship.velocity) / 10
}

function findClosestMemory (ship) : Memory {
  let closestMemory = brain[0]
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

const sentEvents = {}
function mixpanelTrackOnce (eventName, details) {
  if (sentEvents[eventName]) return
  mixpanel.track(eventName, details)
  sentEvents[eventName] = true
}

let hadFinishedRace = false
function gameLoop () {
  requestAnimationFrame(gameLoop)

  if (game == null) return
  meter.tickStart()

  // get inputs for this turn
  let gamepads = getGamepads.apply(navigator)
  const ships : Array<?Ship> = game.turn.ships
  ships.forEach((ship, i) => {
    if (ship == null || i !== myShipId) return

    if (!hadFinishedRace && ship.hasFinishedRace()) {
      mixpanel.people.increment('races finished')
      const position = ships.reduce((sum, ship, i) => sum + (ship && ship.hasFinishedRace() ? 1 : 0), 0)
      mixpanel.track('Player finished race', {
        username: ship.username,
        track: game.map.id,
        totalTime: ship.totalTime(),
        bestLap: ship.bestLap(),
        position: position
      })
    }
    hadFinishedRace = ship.hasFinishedRace()

    const gamepad = gamepads[0]
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
      if (closestMemory) {
        input = new PlayerInput(closestMemory[3])
        const angle = closestMemory[2]
        input.turnL = ((shipAngle - 1) % 4 === angle) ||
                      ((shipAngle - 2) % 4 === angle)
        input.turnR = ((shipAngle + 1) % 4 === angle)
      }
    }

    // generate PlayerEvents from input - oldInput
    const events = []
    if (input.turnL && !oldInput.turnL) {
      mixpanelTrackOnce('Player first interaction', { type: 'turnL' })
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_L, input.turnL))
    }
    if (input.turnR && !oldInput.turnR) {
      mixpanelTrackOnce('Player first interaction', { type: 'turnR' })
      events.push(new PlayerEvent(C.PLAYER_EVENT.TURN_R, input.turnR))
    }
    if (input.leanL !== oldInput.leanL) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.LEAN_L, input.leanL))
      mixpanelTrackOnce('Player first interaction', { type: 'turnL' })
      mixpanelTrackOnce('Player discovered lean', { type: 'leanL' })
    }
    if (input.leanR !== oldInput.leanR) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.LEAN_R, input.leanR))
      mixpanelTrackOnce('Player first interaction', { type: 'turnR' })
      mixpanelTrackOnce('Player discovered lean', { type: 'leanR' })
    }
    if (input.gas !== oldInput.gas) {
      mixpanelTrackOnce('Player first interaction', { type: 'gas' })
      events.push(new PlayerEvent(C.PLAYER_EVENT.GAS, input.gas))
    }
    if (input.boost !== oldInput.boost) {
      events.push(new PlayerEvent(C.PLAYER_EVENT.BOOST, input.boost))
      mixpanelTrackOnce('Player first interaction', { type: 'boost' })
      mixpanelTrackOnce('Player discovered boost')
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
    const currentZoom = cameraZoom
    const velocity = player.ship.velocity
    const speed = Math.sqrt(Math.pow(velocity[0], 2) + Math.pow(velocity[1], 2))
    const speedFactor = (Math.max(0, speed - 40) / 80)
    const targetZoom = 12 - 5 * speedFactor
    const newZoom = currentZoom + ((targetZoom - currentZoom) / 15)
    cameraZoom = newZoom
    gameController.stage.scale = {
      x: cameraZoom,
      y: cameraZoom
    }
    stage.position = new PIXI.Point(
      halfWidth - player.sprite.position.x * stage.scale.x,
      halfHeight - player.sprite.position.y * stage.scale.y)
    camera.pivot = { x: halfWidth, y: halfHeight }
    camera.position = new PIXI.Point(halfWidth, halfHeight)
    const deg360 = (Math.PI * 2)
    while (-player.sprite.rotation <= camera.rotation - deg360) {
      camera.rotation -= deg360
    }
    while (-player.sprite.rotation >= camera.rotation + deg360) {
      camera.rotation += deg360
    }
    camera.rotation += (-player.sprite.rotation - camera.rotation) / 15
    // camera.position.y += speedFactor * (window.innerHeight / 5)
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

const AI_ENABLED = bool(localStorage.getItem('AI_ENABLED'))
let shouldAIExecute = false
let shouldAILearn = false

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

let isFirstLoad = true
socket.on('game:bootstrap', (data) => {
  const initialTurn : number = data.initialTurn
  const track : Track = data.map
  cameraZoom = track.zoom
  const turnsSlice : Array<Turn> = data.turnsSlice
  const shipId : number = data.shipId
  const lastTick : number = data.lastTick
  myShipId = shipId

  setupBackgroundMusic({
    bgmusicURL: track.bgmusic,
    finalLapMusicURL: track.bgmusicFinalLap,
    finishedRaceMusicURL: track.finishedRaceMusic
  })

  game = new Game(track)
  renderer.backgroundColor = track.skyboxColor || 0x000000
  game.turns = []
  let lastTurn
  for (let i = 0; i < turnsSlice.length; ++i) {
    let { ships, events, serverEvents, state, counter } = turnsSlice[i]
    ships = ships.map((rawShip) => rawShip && new Ship(rawShip))
    const turn = new Turn(ships, events, serverEvents, state, counter)
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

  window.gameController = gameController = new GameController(game)
  gameController.stage.scale = { x: cameraZoom, y: cameraZoom }
  camera.addChild(gameController.stage)

  if (DEBUG_MODE) {
    debugGame = new Game(track)
    debugGameController = new GameController(debugGame, true)
    debugGameController.stage.alpha = 0.5
    gameController.stage.addChild(debugGameController.stage)
  }

  console.log('got bootstrapped by server')
  oldInputs = []
  setTimeout(function () {
    const myShip = game.turn.ships[myShipId]
    if (myShip != null) {
      const hexColor = numberToHexColor(myShip.color)
      leaderboard.style.boxShadow = `${hexColor} 2px 2px`
      chatInput.style.boxShadow = `${hexColor} 2px 2px`
    }
  }, 0)

  if (isFirstLoad) {
    isFirstLoad = false
    addSystemMessage(`Welcome to ag-drift! 🎶
    April 6, 2022: Added dynamic best lap leaderboards.
    April 9, 2022: Added Drafting game mechanic
    Enjoy!`)
    if (track.messages) {
      track.messages.forEach(addSystemMessage)
    }
  }
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
if (username) {
  localStorage.setItem('username', username)
  socket.emit('game:join', username, DEBUG_MODE)
}

const version = require('../package.json').version
document.getElementById('gameVersion').innerHTML = `v${version}`
