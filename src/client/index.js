/* global FPSMeter */
// @flow
const PIXI = global.PIXI = require('pixi.js')
const p2 = require('p2')
const { vec2 } = p2
const kbd = require('@dasilvacontin/keyboard')
const clone = require('clone')

const renderer = new PIXI.autoDetectRenderer(
  window.innerWidth,
  window.innerHeight,
  { backgroundColor: 0xAAAAFF })
document.body.appendChild(renderer.view)

const stage = global.stage = new PIXI.Container()
stage.scale = { x: 12, y: 12 }

function onResize () {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.view.style.width = width + 'px'
  renderer.view.style.height = height + 'px'
  renderer.resize(width, height)
}
onResize()
window.addEventListener('resize', onResize)

const cars = []
function addCar () {
  const body = new p2.Body({
    mass: 5,
    position: [15, 12 + Math.random() * 5],
    fixedRotation: true
  })

  const shape = new p2.Box({ width: 2, height: 2 })
  body.addShape(shape)
  world.addBody(body)

  const sprite = new PIXI.Graphics()
  sprite.pivot = { x: 1, y: 1 }
  sprite.beginFill(0xFFFFFF * Math.random())
  sprite.drawRect(0, 0, 2, 2)
  sprite.endFill()

  const fire = new PIXI.Graphics()
  fire.position = { x: 0.5, y: 1.5 }
  fire.beginFill(0xFF0000)
  fire.drawRect(0, 0, 1, 0.5)
  fire.endFill()
  sprite.addChild(fire)
  sprite.fire = fire

  const fireLeft = new PIXI.Graphics()
  fireLeft.beginFill(0xFF0000)
  fireLeft.drawRect(-0.5, 0.75, 0.5, 0.5)
  fireLeft.endFill()
  fireLeft.visible = false
  sprite.addChild(fireLeft)
  sprite.fireLeft = fireLeft

  const fireRight = new PIXI.Graphics()
  fireRight.beginFill(0xFF0000)
  fireRight.drawRect(2, 0.75, 0.5, 0.5)
  fireRight.endFill()
  fireRight.visible = false
  sprite.addChild(fireRight)
  sprite.fireRight = fireRight

  stage.addChild(sprite)

  const username = ' ' || prompt(`Username for Player #${cars.length + 1}:`)
  const car = { body, shape, sprite, username }
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
    if (cell !== '1') return
    const cellShape = new p2.Box({ width: CELL_EDGE, height: CELL_EDGE })
    const cellBody = new p2.Body({
      mass: 0,
      position: [j * CELL_EDGE, i * CELL_EDGE]
    })
    cellBody.addShape(cellShape)
    world.addBody(cellBody)
    const sprite = new PIXI.Graphics()
    sprite.beginFill(0x3F51B5)
    sprite.drawRect(0, 0, 10, 10)
    sprite.endFill()
    sprite.position = { x: j * CELL_EDGE - HALF_EDGE, y: i * CELL_EDGE - HALF_EDGE }
    stage.addChild(sprite)
  })
})

function onAssetsLoaded () {
  addCar()
  addCar()
  loop()
}

PIXI.loader
.add('images/sheet.json')
.load(onAssetsLoaded)

let oldGamepads: Array<?Object> = []

const timeStep = 1 / 60
const force = 300
function padIsKeyDown (gamepad, key) {
  if (gamepad == null) return false
  const { buttons } = gamepad
  const axes = gamepad.axes.map(Math.round)

  switch (key) {
    case kbd.RIGHT_ARROW: return axes[0] === 1 || buttons[15].pressed
    case kbd.LEFT_ARROW: return axes[0] === -1 || buttons[14].pressed
    case kbd.UP_ARROW: return axes[1] === -1
    case kbd.DOWN_ARROW: return axes[1] === 1
    case 'q': return buttons[4].pressed
    case 'e': return buttons[5].pressed || buttons[6].pressed
    default: throw new Error('Unsupported key')
  }
}

const meter = new FPSMeter()
function loop () {
  requestAnimationFrame(loop)
  meter.tickStart()

  let gamepads = navigator.getGamepads()

  if (gamepads.length > 0) {
    cars.forEach((car, i) => {
      const { body } = car
      const gamepad = gamepads[i]
      const nowLeft = padIsKeyDown(gamepad, kbd.LEFT_ARROW)
      const nowRight = padIsKeyDown(gamepad, kbd.RIGHT_ARROW)

      const oldGamepad = oldGamepads[i]
      const oldLeft = oldGamepad && padIsKeyDown(oldGamepad, kbd.LEFT_ARROW)
      const oldRight = oldGamepad && padIsKeyDown(oldGamepad, kbd.RIGHT_ARROW)
      console.log(nowLeft, oldLeft)
      if (nowLeft && !oldLeft) body.angle += -Math.PI / 2
      if (nowRight && !oldRight) body.angle += Math.PI / 2
      body.applyForceLocal([0, -force]) // thrust

      const leftThrusterOn = padIsKeyDown(gamepad, 'q')
      if (leftThrusterOn) body.applyForceLocal([force, 0])
      car.sprite.fireLeft.visible = leftThrusterOn

      const rightThrusterOn = padIsKeyDown(gamepad, 'e')
      if (rightThrusterOn) body.applyForceLocal([-force, 0])
      car.sprite.fireRight.visible = rightThrusterOn

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

  world.step(timeStep)

  cars.forEach((car) => {
    const { body, sprite } = car
    sprite.position = { x: body.position[0], y: body.position[1] }
    sprite.rotation = body.angle
    sprite.fire.scale.y = Math.random() * 0.5 + 1
    sprite.fire.tint = Math.random() < 0.5
      ? 0xFF0000
      : 0xFFFFFF
  })

  stage.position = {
    x: window.innerWidth / 2 / stage.scale.x,
    y: window.innerHeight / 2 / stage.scale.y
  }
  renderer.render(stage)
  meter.tick()
}
