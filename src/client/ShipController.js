// @flow
const PIXI = require('pixi.js')
const Ship = require('../common/Ship.js')
const { Howl } = require('howler')
const { vec2 } = require('p2')

const SMALL_THRUSTER_WIDTH = 0.5
const SMALL_THRUSTER_LONG = 0.4
const ENGINE_VOL_LOW = 0.1
const ENGINE_VOL_HIGH = 0.2
const FIRE_HIGH = 0x007AFF
const FIRE_LOW = 0x00FFD4
const FIRE_HIGH_CROWN = 0xFFFB00
const FIRE_LOW_CROWN = 0xFFB800

const turnSound = new Howl({
  src: ['sounds/turn-brake2.wav'],
  preload: true,
  volume: 0.1
})

const engineSound = new Howl({
  src: ['sounds/engine.wav'],
  preload: true,
  volume: ENGINE_VOL_LOW
})

class ShipController {
  sprite: PIXI.DisplayObject
  color: number
  frontLeftFire: PIXI.DisplayObject
  rearLeftFire: PIXI.DisplayObject
  frontRightFire: PIXI.DisplayObject
  rearRightFire: PIXI.DisplayObject
  mainFire: PIXI.DisplayObject
  engineSoundId: ?number
  ship: Ship

  turnLtimer: number
  turnRtimer: number

  constructor (ship: Ship) {
    this.regenerateSprites(ship)
    this.turnLtimer = 0
    this.turnRtimer = 0
    this.ship = ship
  }

  regenerateSprites (ship: Ship) {
    if (ship == null) return
    this.ship = ship
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
    const hasCrown = (ship.username === window.theCrown)
    chasis.beginFill(hasCrown ? FIRE_LOW_CROWN : 0x000000)
    chasis.fillAlpha = ((ship.isABot() || hasCrown) ? 0.88 : 0.2)
    chasis.moveTo(0.7, 0.9)
    chasis.lineTo(1.3, 0.9)
    chasis.lineTo(1.5, 2)
    chasis.lineTo(0.5, 2)
    chasis.endFill()
    sprite.chasis = chasis

    if (!this.mainFire) {
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
    }
    sprite.addChild(chasis)
    if (this.draftVFX) sprite.addChild(this.draftVFX)

    // draft point
    if (this.draftPointSprite != null) return
    this.draftPointSprite = new PIXI.Graphics()
    this.draftPointSprite.beginFill(0x00ffff)
    this.draftPointSprite.drawCircle(0, 0, 2)
    this.draftPointSprite.endFill()
    this.draftPointSprite.alpha = 0.2
    this.draftPointSprite2 = new PIXI.Graphics()
    this.draftPointSprite2.beginFill(0x00ffff)
    this.draftPointSprite2.drawCircle(0, 0, 2)
    this.draftPointSprite2.endFill()
    this.draftPointSprite2.alpha = 0.2
    this.draftPointSprite3 = new PIXI.Graphics()
    this.draftPointSprite3.beginFill(0x00ffff)
    this.draftPointSprite3.drawCircle(0, 0, 2)
    this.draftPointSprite3.endFill()
    this.draftPointSprite3.alpha = 0.2

    this.draftVFX = new PIXI.Graphics()
    this.draftVFX.beginFill(0x44E9FF)
    this.draftVFX.drawCircle(1, 1, 2)
    this.draftVFX.endFill()
    this.draftVFX.alpha = 0.24
    sprite.addChild(this.draftVFX)
  }

  update (ship: Ship) {
    if (this.color !== ship.color) this.regenerateSprites(ship)
    this.ship = ship

    const { position, angle, input } = ship
    this.sprite.position = new PIXI.Point(position[0], position[1])
    this.sprite.rotation = angle

    const canMove = !ship.hasFinishedRace()
    // turning sound
    if (canMove && (input.turnL || input.turnR)) turnSound.play()

    let boost = 0
    if (canMove && input.gas) boost = input.boost ? 2 : 1

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
      if (ship.username === window.theCrown) {
        thruster.tint = Math.random() < 0.5
          ? FIRE_HIGH_CROWN
          : FIRE_LOW_CROWN
      } else {
        thruster.tint = Math.random() < 0.5
          ? FIRE_HIGH
          : FIRE_LOW
      }
    })

    // active / deactivate support thrusters' sprites
    const timerCount = 7
    if (canMove && input.turnL) this.turnLtimer = timerCount
    if (canMove && input.turnR) this.turnRtimer = timerCount
    const displayTurnRight = (this.turnRtimer > 0)
    const displayTurnLeft = (this.turnLtimer > 0)
    this.turnRtimer--
    this.turnLtimer--

    this.frontLeftFire.visible = canMove && (input.leanR || displayTurnRight)
    this.rearLeftFire.visible = canMove && (input.leanR || displayTurnLeft)
    this.frontRightFire.visible = canMove && (input.leanL || displayTurnLeft)
    this.rearRightFire.visible = canMove && (input.leanL || displayTurnRight)
    let { engineSoundId } = this

    if (canMove && (boost > 0 || input.leanL || input.leanR)) {
      if (engineSound.playing(engineSoundId) ||
        engineSound.seek(undefined, engineSoundId) > 0.1) {
        if (engineSoundId != null) engineSound.stop(engineSoundId)
        this.engineSoundId = engineSound.play()
      }

      const volume = boost === 2
        ? ENGINE_VOL_HIGH
        : ENGINE_VOL_LOW
      engineSound.volume(volume, engineSoundId)
    } else if (engineSoundId != null) {
      engineSound.stop(engineSoundId)
      this.engineSoundId = null
    }

    this.draftVFX.alpha = ship.isDrafting ? 0.24 : 0
    this.draftVFX.alpha = 0

    const speed = vec2.length(ship.velocity)
    this.draftPointSprite.alpha = (speed < 40) ? 0.4 : 0.8

    let draftPoint = vec2.clone(ship.velocity)
    draftPoint = vec2.scale(draftPoint, draftPoint, -0.05)
    draftPoint = vec2.add(draftPoint, draftPoint, ship.position)
    this.draftPointSprite.position = new PIXI.Point(draftPoint[0], draftPoint[1]) // new PIXI.Point(draftPoint[0], draftPoint[1])

    draftPoint = vec2.clone(ship.velocity)
    draftPoint = vec2.scale(draftPoint, draftPoint, -0.1)
    draftPoint = vec2.add(draftPoint, draftPoint, ship.position)
    this.draftPointSprite2.position = new PIXI.Point(draftPoint[0], draftPoint[1]) // new PIXI.Point(draftPoint[0], draftPoint[1])

    draftPoint = vec2.clone(ship.velocity)
    draftPoint = vec2.scale(draftPoint, draftPoint, -0.15)
    draftPoint = vec2.add(draftPoint, draftPoint, ship.position)
    this.draftPointSprite3.position = new PIXI.Point(draftPoint[0], draftPoint[1]) // new PIXI.Point(draftPoint[0], draftPoint[1])
  }
}

module.exports = ShipController
