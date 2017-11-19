// @flow
const PIXI = require('pixi.js')
const Ship = require('../common/Ship.js')
const { Howl } = require('howler')

const SMALL_THRUSTER_WIDTH = 0.5
const SMALL_THRUSTER_LONG = 0.4
const ENGINE_VOL_LOW = 0.4
const ENGINE_VOL_HIGH = 0.5
const FIRE_HIGH = 0x007AFF
const FIRE_LOW = 0x00FFD4

const turnSound = new Howl({
  urls: ['sounds/turn-brake2.wav'],
  volume: 0.7
})

const engineSound = new Howl({
  urls: ['sounds/engine.wav'],
  volume: ENGINE_VOL_LOW
})

function isSoundPaused (sound, nodeId) {
  const audioNode = sound._audioNode.find((node) => node.id === nodeId)
  if (audioNode == null) return true // doesn't exist, so consider it paused
  return audioNode.paused
}

class ShipController {
  sprite: PIXI.DisplayObject
  color: number
  frontLeftFire: PIXI.DisplayObject
  rearLeftFire: PIXI.DisplayObject
  frontRightFire: PIXI.DisplayObject
  rearRightFire: PIXI.DisplayObject
  mainFire: PIXI.DisplayObject
  engineSoundId: ?number

  turnLtimer: number
  turnRtimer: number

  constructor (ship: Ship) {
    this.regenerateSprites(ship)
    this.turnLtimer = 0
    this.turnRtimer = 0
  }

  regenerateSprites (ship: Ship) {
    this.color = ship.color
    // chasis
    const sprite = (this.sprite || new PIXI.Container())
    sprite.pivot = { x: 1, y: 1 }
    this.sprite = sprite

    const chasis = new PIXI.Graphics()
    chasis.beginFill(ship.color)
    chasis.moveTo(0.2, 0)
    chasis.lineTo(1.8, 0)
    chasis.lineTo(2, 2)
    chasis.lineTo(0, 2)
    chasis.endFill()

    // chasis peak
    chasis.beginFill(0x000000)
    chasis.fillAlpha = 0.2
    chasis.moveTo(0.7, 0.9)
    chasis.lineTo(1.3, 0.9)
    chasis.lineTo(1.5, 2)
    chasis.lineTo(0.5, 2)
    chasis.endFill()
    sprite.chasis = chasis

    const mainFire = new PIXI.Graphics()
    mainFire.position = new PIXI.Point(1, 1.85)
    mainFire.beginFill(0xFFFFFF)
    mainFire.drawRect(-0.5, 0, 1, 0.5)
    mainFire.endFill()
    sprite.addChild(mainFire)
    this.mainFire = sprite.mainFire = mainFire

    const frontThrusterHeight = 0.4
    const rearThrusterHeight = 1.5

    const frontLeftFire = new PIXI.Graphics()
    frontLeftFire.beginFill(0xFFFFFF)
    frontLeftFire.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
    frontLeftFire.endFill()
    frontLeftFire.position = new PIXI.Point(0.1, frontThrusterHeight)
    frontLeftFire.rotation = Math.PI / 2
    frontLeftFire.visible = false
    frontLeftFire.alpha = 0.5
    sprite.addChild(frontLeftFire)
    this.frontLeftFire = sprite.frontLeftFire = frontLeftFire

    const rearLeftFire = new PIXI.Graphics()
    rearLeftFire.beginFill(0xFFFFFF)
    rearLeftFire.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
    rearLeftFire.endFill()
    rearLeftFire.position = new PIXI.Point(0, rearThrusterHeight)
    rearLeftFire.rotation = Math.PI / 2
    rearLeftFire.visible = false
    rearLeftFire.alpha = 0.5
    sprite.addChild(rearLeftFire)
    this.rearLeftFire = sprite.rearLeftFire = rearLeftFire

    const frontRightFire = new PIXI.Graphics()
    frontRightFire.beginFill(0xFFFFFF)
    frontRightFire.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
    frontRightFire.endFill()
    frontRightFire.position = new PIXI.Point(1.9, frontThrusterHeight)
    frontRightFire.rotation = -Math.PI / 2
    frontRightFire.visible = false
    frontRightFire.alpha = 0.5
    sprite.addChild(frontRightFire)
    this.frontRightFire = sprite.frontRightFire = frontRightFire

    const rearRightFire = new PIXI.Graphics()
    rearRightFire.beginFill(0xFFFFFF)
    rearRightFire.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
    rearRightFire.endFill()
    rearRightFire.position = new PIXI.Point(2, rearThrusterHeight)
    rearRightFire.rotation = -Math.PI / 2
    rearRightFire.visible = false
    rearRightFire.alpha = 0.5
    sprite.addChild(rearRightFire)
    this.rearRightFire = sprite.rearRightFire = rearRightFire

    sprite.addChild(chasis)
  }

  update (ship: Ship) {
    if (this.color !== ship.color) this.regenerateSprites(ship)

    const { position, angle, input } = ship
    this.sprite.position = new PIXI.Point(position[0], position[1])
    this.sprite.rotation = angle

    // turning sound
    if (input.turnL || input.turnR) turnSound.play(() => {})

    let boost = 0
    if (input.gas) boost = input.boost ? 2 : 1

    // thruster animation
    const thrusters = [
      this.mainFire,
      this.frontLeftFire,
      this.rearLeftFire,
      this.frontRightFire,
      this.rearRightFire
    ]
    thrusters.forEach((thruster, k) => {
      // random flame shiverring
      thruster.scale.x = 1 - Math.random() * 0.5
      thruster.scale.y = Math.random() * 1 + 1

      // main thruster flame scale depending on gas+boost
      if (k === 0) thruster.scale.y *= boost

      // randomly select color for flame
      thruster.tint = Math.random() < 0.5
        ? FIRE_HIGH
        : FIRE_LOW
    })

    // active / deactivate support thrusters' sprites
    const timerCount = 7
    if (input.turnL) this.turnLtimer = timerCount
    if (input.turnR) this.turnRtimer = timerCount
    const displayTurnRight = (this.turnRtimer > 0)
    const displayTurnLeft = (this.turnLtimer > 0)
    this.turnRtimer--
    this.turnLtimer--

    this.frontLeftFire.visible = input.leanR || displayTurnRight
    this.rearLeftFire.visible = input.leanR || displayTurnLeft
    this.frontRightFire.visible = input.leanL || displayTurnLeft
    this.rearRightFire.visible = input.leanL || displayTurnRight
    let { engineSoundId } = this

    if (boost > 0 || input.leanL || input.leanR) {
      if (isSoundPaused(engineSound, engineSoundId) ||
         engineSound.pos(undefined, engineSoundId) > 0.1) {
        if (engineSoundId != null) engineSound.stop(engineSoundId)
        engineSound.play((nodeId) => { this.engineSoundId = nodeId })
      }

      const volume = boost === 2
        ? ENGINE_VOL_HIGH
        : ENGINE_VOL_LOW
      engineSound.volume(volume, engineSoundId)
    } else if (engineSoundId != null) {
      engineSound.stop(engineSoundId)
      this.engineSoundId = null
    }
  }
}

module.exports = ShipController
