/* global FPSMeter */
// @flow
const PIXI = global.PIXI = require('pixi.js')
const { Howl } = require('howler')
const kbd = require('@dasilvacontin/keyboard')

const Game = require('../common/Game.js')
const GameController = require('./GameController.js')
const PlayerEvent = require('../common/PlayerEvent.js')
const PlayerInput = require('../common/PlayerInput.js')
const C = require('../common/constants.js')

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
  let index = localStorage.getItem('trackIndex')
  if (index == null) {
    index = Math.floor(Math.random() * musicTracks.length)
  } else index = Number(index)
  index = 1 // such random
  const track = musicTracks[index]
  console.log(track)
  return 'sounds/' + track
}
const bgMusic = new Howl({
  urls: [getRandomMusicTrack()],
  buffer: true,
  loop: true
})
bgMusic.play()

const map = [
  '111111111111111',
  '100001110000001',
  '101000000111001',
  '101111111111101',
  '101111111111001',
  '100000000000001',
  '111111111111111'
].map((row) => row.split('').map(Number))

const renderer = new PIXI.autoDetectRenderer(
  window.innerWidth,
  window.innerHeight,
  { backgroundColor: C.WALL_COLOR })
document.body.appendChild(renderer.view)

const camera = new PIXI.Container()
const stage = global.stage = new PIXI.Container()
camera.addChild(stage)
const ZOOM = 12
stage.scale = { x: ZOOM, y: ZOOM }

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

const game = new Game(map)
const gameController = new GameController(game, stage)
const oldInputs = []

const meter = new FPSMeter()
function gameLoop () {
  requestAnimationFrame(gameLoop)
  meter.tickStart()

  // get inputs for this turn
  let gamepads = navigator.getGamepads() || []
  game.turn.ships.forEach((ship, i) => {
    if (ship == null) return

    const gamepad = gamepads[i]
    const oldInput = oldInputs[i] || new PlayerInput()
    const input = new PlayerInput()

    input.turnL = padIsKeyDown(gamepad, kbd.LEFT_ARROW)
    input.turnR = padIsKeyDown(gamepad, kbd.RIGHT_ARROW)
    input.leanL = padIsKeyDown(gamepad, 'a')
    input.leanR = padIsKeyDown(gamepad, 'd')
    input.gas = padIsKeyDown(gamepad, kbd.UP_ARROW)
    input.boost = padIsKeyDown(gamepad, 's')

    // let ship #1 be able to be controlled by keyboard as well
    if (i === 0) {
      input.turnL = input.turnL || kbd.isKeyDown(kbd.LEFT_ARROW)
      input.turnR = input.turnR || kbd.isKeyDown(kbd.RIGHT_ARROW)
      input.leanL = input.leanL || kbd.isKeyDown('a')
      input.leanR = input.leanR || kbd.isKeyDown('d')
      input.gas = input.gas || kbd.isKeyDown(kbd.UP_ARROW)
      input.boost = input.boost || kbd.isKeyDown('s')
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
    game.onPlayerEvent({ id: String(i) }, events)
    oldInputs[i] = input
  })

  // perform physics updates
  game.tick()

  // update ship sprites
  gameController.update()

  // update camera
  const [halfWidth, halfHeight] = [
    window.innerWidth,
    window.innerHeight
  ].map(e => e / 2)

  const player = gameController.ships[0]
  if (player) {
    stage.position = new PIXI.Point(
      halfWidth - player.sprite.position.x * stage.scale.x,
      halfHeight - player.sprite.position.y * stage.scale.y)
    camera.pivot = { x: halfWidth, y: halfHeight }
    camera.position = new PIXI.Point(halfWidth, halfHeight)
    camera.rotation += (-player.sprite.rotation - camera.rotation) / 15
  }
  renderer.render(camera)
  meter.tick()
}
game.onPlayerJoin({ id: '0' })
gameLoop()

// avoid moving the page around
document.addEventListener('keydown', (e: KeyboardEvent) => {
  switch (e.keyCode) {
    case kbd.LEFT_ARROW:
    case kbd.RIGHT_ARROW:
    case kbd.UP_ARROW:
    case kbd.DOWN_ARROW:
      e.preventDefault()
  }
}, false)
