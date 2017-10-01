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
  leftFire: PIXI.DisplayObject
  rightFire: PIXI.DisplayObject
  mainFire: PIXI.DisplayObject
  engineSoundId: ?number

  constructor (ship: Ship) {
    this.regenerateSprites(ship)
  }

  regenerateSprites (ship: Ship) {
    this.color = ship.color
    // chasis
    const sprite = (this.sprite || new PIXI.Graphics())
    sprite.pivot = { x: 1, y: 1 }
    sprite.beginFill(ship.color)
    sprite.moveTo(0.2, 0)
    sprite.lineTo(1.8, 0)
    sprite.lineTo(2, 2)
    sprite.lineTo(0, 2)
    sprite.endFill()

    /*
    // windshield
    sprite.moveTo(0.35, 0.1)
    sprite.beginFill(0xFFFFFF)
    sprite.fillAlpha = 0.75
    sprite.lineTo(1.65, 0.1)
    sprite.lineTo(1.3, 0.9)
    sprite.lineTo(0.7, 0.9)
    sprite.endFill()
    */

    // chasis peak
    sprite.beginFill(0x000000)
    sprite.fillAlpha = 0.2
    sprite.moveTo(0.7, 0.9)
    sprite.lineTo(1.3, 0.9)
    sprite.lineTo(1.5, 2)
    sprite.lineTo(0.5, 2)
    sprite.endFill()

    this.sprite = sprite

    const mainFire = new PIXI.Graphics()
    mainFire.position = new PIXI.Point(1, 1.85)
    mainFire.beginFill(0xFFFFFF)
    mainFire.drawRect(-0.5, 0, 1, 0.5)
    mainFire.endFill()
    sprite.addChild(mainFire)
    this.mainFire = sprite.mainFire = mainFire

    // left thruster
    const leftFire = new PIXI.Graphics()
    leftFire.beginFill(0xFFFFFF)
    leftFire.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
    leftFire.endFill()
    leftFire.position = new PIXI.Point(0, 1)
    leftFire.rotation = Math.PI / 2
    leftFire.visible = false
    leftFire.alpha = 0.5
    sprite.addChild(leftFire)
    this.leftFire = sprite.leftFire = leftFire

    // right thruster
    const rightFire = new PIXI.Graphics()
    rightFire.beginFill(0xFFFFFF)
    rightFire.drawRect(-SMALL_THRUSTER_WIDTH / 2, -0.1, SMALL_THRUSTER_WIDTH, SMALL_THRUSTER_LONG)
    rightFire.endFill()
    rightFire.position = new PIXI.Point(2, 1)
    rightFire.rotation = -Math.PI / 2
    rightFire.visible = false
    rightFire.alpha = 0.5
    sprite.addChild(rightFire)
    this.rightFire = sprite.rightFire = rightFire
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
    const thrusters = [this.mainFire, this.leftFire, this.rightFire]
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
    this.leftFire.visible = input.leanR
    this.rightFire.visible = input.leanL
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
