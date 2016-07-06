// @flow
const PIXI = require('pixi.js')
const p2 = require('p2')
const kbd = require('@dasilvacontin/keyboard')

// eslint-disable-next-line new-cap
const renderer = new PIXI.autoDetectRenderer(
  window.innerWidth,
  window.innerHeight,
  { backgroundColor: 0xAAAAFF })
document.body.appendChild(renderer.view)

const stage = new PIXI.Container()
stage.scale = { x: 50, y: 50 }

function onResize () {
  renderer.view.style.width = window.innerWidth + 'px'
  renderer.view.style.height = window.innerHeight + 'px'
  stage.position = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}
onResize()
window.addEventListener('resize', onResize)

const world = new p2.World({ gravity: [0, -9.82] })
const carBody = new p2.Body({
  mass: 5,
  position: [0, 3],
  angularVelocity: 20
})
const carShape = new p2.Box({ width: 2, height: 1 })
carBody.addShape(carShape)
world.addBody(carBody)

var groundBody = new p2.Body()
var groundShape = new p2.Plane()
groundBody.addShape(groundShape)
world.addBody(groundBody)

const car = global.car = new PIXI.Graphics()
car.beginFill(0xFFFFFF)
car.drawRect(0, 0, 2, 1)
car.endFill()
car.pivot = { x: 1, y: 0.5 }
stage.addChild(car)

const timeStep = 1 / 60

function loop () {
  requestAnimationFrame(loop)
  world.step(timeStep)
  car.position = { x: carBody.position[0], y: -carBody.position[1] }
  car.rotation = carBody.angle
  if (kbd.isKeyDown(kbd.RIGHT_ARROW)) car.position.x += 1
  renderer.render(stage)
}
loop()
