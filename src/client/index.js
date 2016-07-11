/* global FPSMeter */
// @flow
const PIXI = global.PIXI = require('pixi.js')
const p2 = require('p2')
const { vec2 } = p2
const { Howl } = require('howler')
const kbd = require('@dasilvacontin/keyboard')
const clone = require('clone')
const C = require('../common/constants.js')

const WALL_COLOR = 0x3F51B5
const ROAD_COLOR = 0xAAAAFF
const FIRE_HIGH = 0x007AFF
const FIRE_LOW = 0x00FFD4

const musicTracks = [
  'POL-aggressor-short.wav',
  'POL-catch-me-short.wav',
  'POL-divide-by-zero-short.wav', // +1
  'POL-future-shock-short.wav',
  'POL-grid-breaking-short.wav',
  'POL-higher-short.wav',
  'POL-humanoid-short.wav',
  'POL-mathrix-short.wav',
  'POL-night-in-motion-short.wav',
  'POL-parallel-fields-short.wav'
]
function getRandomMusicTrack () {
  const track = musicTracks[Math.floor(Math.random() * musicTracks.length)]
  console.log(track)
  return 'sounds/' + track
}
const bgMusic = new Howl({
  urls: [getRandomMusicTrack()],
  buffer: true,
  loop: true
})
bgMusic.play()

const renderer = new PIXI.autoDetectRenderer(
  window.innerWidth,
  window.innerHeight,
  { backgroundColor: WALL_COLOR })
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

const SMALL_THRUSTER_WIDTH = 0.5
const SMALL_THRUSTER_LONG = 0.4
const cars = []
function addCar () {
  const i = cars.length
  const body = new p2.Body({
    mass: 5,
    position: [7 + (i % 2 !== 0 ? 5 : 0), 15 + 3 * i],
    fixedRotation: true
  })

  const shape = new p2.Box({ width: 2, height: 2 })
  body.addShape(shape)
  world.addBody(body)

  // chasis
  const color = 0xFFFFFF * Math.random()
  const sprite = new PIXI.Graphics()
  sprite.pivot = { x: 1, y: 1 }
  sprite.beginFill(color)
  sprite.drawRect(0, 0, 2, 2)
  sprite.endFill()

  // windshield
  sprite.moveTo(0.35, 0.1)
  sprite.beginFill(0xFFFFFF)
  sprite.fillAlpha = 0.75
  sprite.lineTo(1.65, 0.1)
  sprite.lineTo(1.3, 0.9)
  sprite.lineTo(0.7, 0.9)
  sprite.endFill()

  // chasis peak
  sprite.beginFill(0x000000)
  sprite.fillAlpha = 0.1
  sprite.moveTo(0.7, 0.9)
  sprite.lineTo(1.3, 0.9)
  sprite.lineTo(1.5, 2)
  sprite.lineTo(0.5, 2)
  sprite.endFill()
  stage.addChild(sprite)

  // main thruster
  const fire = new PIXI.Graphics()
  fire.position = new PIXI.Point(1, 1.75)
  fire.beginFill(0xFFFFFF)
  fire.drawRect(-0.5, 0, 1, 0.5)
  fire.endFill()
  sprite.addChild(fire)
  sprite.fire = fire

  // left thruster
  const fireLeft = new PIXI.Graphics()
  fireLeft.beginFill(0xFFFFFF)
  fireLeft.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
  fireLeft.endFill()
  fireLeft.position = new PIXI.Point(0, 1)
  fireLeft.rotation = Math.PI / 2
  fireLeft.visible = false
  fireLeft.alpha = 0.5
  sprite.addChild(fireLeft)
  sprite.fireLeft = fireLeft

  // right thruster
  const fireRight = new PIXI.Graphics()
  fireRight.beginFill(0xFFFFFF)
  fireRight.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
  fireRight.endFill()
  fireRight.position = new PIXI.Point(2, 1)
  fireRight.rotation = -Math.PI / 2
  fireRight.visible = false
  fireRight.alpha = 0.5
  sprite.addChild(fireRight)
  sprite.fireRight = fireRight

  const car = { body, shape, sprite, color }
  cars.push(car)
}

const world = new p2.World({ gravity: [0, 0] })

const map = [
  '111111111111111',
  '100001110000001',
  '101000000111001',
  '101111111111101',
  '101111111111001',
  '100000000000001',
  '111111111111111'
]

const CELL_EDGE = 10
const HALF_EDGE = CELL_EDGE / 2
map.forEach((row, i) => {
  row.split('').forEach((cell, j) => {
    // if it's a wall, add a collider
    if (cell === '1') {
      const cellShape = new p2.Box({ width: CELL_EDGE, height: CELL_EDGE })
      const cellBody = new p2.Body({
        mass: 0,
        position: [j * CELL_EDGE, i * CELL_EDGE]
      })
      cellBody.addShape(cellShape)
      world.addBody(cellBody)
    }

    const sprite = new PIXI.Graphics()
    sprite.beginFill(cell === '1' ? WALL_COLOR : ROAD_COLOR)
    sprite.drawRect(0, 0, CELL_EDGE, CELL_EDGE)
    sprite.endFill()
    sprite.position = new PIXI.Point(j * CELL_EDGE - HALF_EDGE, i * CELL_EDGE - HALF_EDGE)
    stage.addChild(sprite)
  })
})

let oldGamepads: Array<?Object> = []

const TIME_STEP = 1 / 60
const FORCE = 300

function padIsKeyDown (gamepad, key) {
  if (gamepad == null) return false
  const { buttons } = gamepad
  const axes = gamepad.axes.map(Math.round)

  switch (key) {
    case kbd.RIGHT_ARROW: return axes[0] === 1 || buttons[15] && buttons[15].pressed
    case kbd.LEFT_ARROW: return axes[0] === -1 || buttons[14] && buttons[14].pressed
    case kbd.UP_ARROW: return axes[1] === -1
    case kbd.DOWN_ARROW: return axes[1] === 1
    case 'q': return buttons[4].pressed
    case 'e': return buttons[5].pressed || buttons[6].pressed
    default: throw new Error('Unsupported key')
  }
}

let playerOldLeft, playerOldRight
const meter = new FPSMeter()

type Track = Array<Array<number>>
type GameEvent = Object

class Ship {
  position: vec2
  velocity: vec2
  color: number

  constructor (position: vec2, velocity: vec2, color: number) {
    this.position = position
    this.velocity = velocity
    this.color = color
  }
}

class Turn {
  map: Track
  ships: Array<Ship>
  events: Array<GameEvent>
  serverEvents: Array<GameEvent>

  constructor (map: Track, ships: Array<Ship>, events: Array<GameEvent>, serverEvents: Array<GameEvent>) {
    this.map = map
    this.ships = ships
    this.events = events
    this.serverEvents = serverEvents
  }

  addShip () : number {
    let freeSlot = 0
    const reservedSlots = {}
    this.serverEvents.forEach(serverEvent => {
      if (serverEvent.type !== C.SERVER_EVENT_TYPE.SPAWN_PLAYER) return
      reservedSlots[serverEvent.bikeId] = true
    })

    while (this.ships[freeSlot] != null) ++freeSlot
    return freeSlot
  }

  evolve () {}
}

class Game {
  socketToShip: Object
  turn: Turn
  turns: Array<Turn>

  constructor (map : Track) {
    this.socketToShip = {}
    this.turn = new Turn(map, [], [], [])
    this.turns = [this.turn]
  }

  onPlayerJoin (socket) {
    const shipId = this.turn.addShip()
    this.socketToShip[socket.id] = shipId
  }
}
function logic () {
  let gamepads = navigator.getGamepads()

  if (gamepads.length > 0) {
    cars.forEach((car, i) => {
      const { body, sprite } = car
      const { fireLeft, fireRight } = sprite
      const gamepad = gamepads[i]
      let nowLeft = padIsKeyDown(gamepad, kbd.LEFT_ARROW)
      let nowRight = padIsKeyDown(gamepad, kbd.RIGHT_ARROW)

      const oldGamepad = oldGamepads[i]
      let oldLeft = oldGamepad && padIsKeyDown(oldGamepad, kbd.LEFT_ARROW)
      let oldRight = oldGamepad && padIsKeyDown(oldGamepad, kbd.RIGHT_ARROW)

      if (i === 0) {
        nowLeft = nowLeft || kbd.isKeyDown('a')
        nowRight = nowRight || kbd.isKeyDown('d')
        oldLeft = oldLeft || playerOldLeft
        oldRight = oldRight || playerOldRight
      }

      if (nowLeft && !oldLeft) body.angle += -Math.PI / 2
      if (nowRight && !oldRight) body.angle += Math.PI / 2
      body.applyForceLocal([0, -FORCE]) // thrust

      if (i === 0) {
        playerOldLeft = nowLeft
        playerOldRight = nowRight
      }

      let leftThrusterOn = padIsKeyDown(gamepad, 'q')
      if (i === 0) leftThrusterOn = leftThrusterOn || kbd.isKeyDown(kbd.LEFT_ARROW)
      if (leftThrusterOn) body.applyForceLocal([FORCE, 0])
      fireLeft.visible = leftThrusterOn

      let rightThrusterOn = padIsKeyDown(gamepad, 'e')
      if (i === 0) rightThrusterOn = rightThrusterOn || kbd.isKeyDown(kbd.RIGHT_ARROW)
      if (rightThrusterOn) body.applyForceLocal([-FORCE, 0])
      fireRight.visible = rightThrusterOn

      // air drag
      vec2.scale(body.velocity, body.velocity, 0.99)
    })
  }

  oldGamepads = Array.from(gamepads).map((gamepad) => {
    if (gamepad == null) return null
    const { axes, buttons } = gamepad
    return {
      axes: clone(axes),
      buttons: Array.from(buttons).map((button) => {
        const { pressed, value } = button
        return { pressed, value }
      })
    }
  })

  world.step(TIME_STEP)
}

function loop () {
  requestAnimationFrame(loop)
  meter.tickStart()

  logic()

  // update ship sprites
  cars.forEach((car) => {
    const { body, sprite } = car
    const { fire, fireLeft, fireRight } = sprite
    sprite.position = new PIXI.Point(body.position[0], body.position[1])
    sprite.rotation = body.angle

    // thruster animation
    const thrusters = [fire, fireLeft, fireRight]
    thrusters.forEach((thruster) => {
      thruster.scale.x = 1 - Math.random() * 0.5
      thruster.scale.y = Math.random() * 1 + 1
      thruster.tint = Math.random() < 0.5
        ? FIRE_HIGH
        : FIRE_LOW
    })
  })

  // update camera
  const [halfWidth, halfHeight] = [window.innerWidth, window.innerHeight]
  .map(e => e / 2)
  const player = cars[0]
  stage.position = new PIXI.Point(
    halfWidth - player.sprite.position.x * stage.scale.x,
    halfHeight - player.sprite.position.y * stage.scale.y)
  camera.pivot = { x: halfWidth, y: halfHeight }
  camera.position = new PIXI.Point(halfWidth, halfHeight)
  camera.rotation += (-player.sprite.rotation - camera.rotation) / 15
  renderer.render(camera)
  meter.tick()
}

addCar()
loop()
