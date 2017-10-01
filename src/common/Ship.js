// @flow
const PlayerInput = require('./PlayerInput.js')
const { vec2 } = require('p2')
const C = require('./constants.js')

class Ship {
  position: vec2
  velocity: vec2
  angle: number
  username: string
  color: number
  input: PlayerInput
  checkpoint: number
  lap: number
  currentLaptime: number
  laptimes: Array<number>

  constructor ({
    position,
    velocity,
    angle,
    username,
    color,
    input,
    checkpoint,
    lap,
    currentLaptime,
    laptimes
  } : {
    position: vec2,
    velocity: vec2,
    angle: number,
    username: string,
    color: number,
    input: PlayerInput,
    checkpoint: number,
    lap: number,
    currentLaptime: number,
    laptimes: Array<number>
  }) {
    this.position = position
    this.velocity = velocity
    this.angle = angle
    this.username = username
    this.color = color
    this.input = input
    this.checkpoint = checkpoint
    this.lap = lap
    this.currentLaptime = currentLaptime
    this.laptimes = laptimes
  }

  hasFinishedRace () {
    return (this.lap > C.MAX_LAPS)
  }
}

module.exports = Ship
