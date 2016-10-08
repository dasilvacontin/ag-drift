// @flow
const PlayerInput = require('./PlayerInput.js')
const { vec2 } = require('p2')

class Ship {
  position: vec2
  velocity: vec2
  angle: number
  username: string
  color: number
  input: PlayerInput
  checkpoint: number
  lap: number

  constructor ({
    position,
    velocity,
    angle,
    username,
    color,
    input,
    checkpoint,
    lap
  } : {
    position: vec2,
    velocity: vec2,
    angle: number,
    username: string,
    color: number,
    input: PlayerInput,
    checkpoint: number,
    lap: number
  }) {
    this.position = position
    this.velocity = velocity
    this.angle = angle
    this.username = username
    this.color = color
    this.input = input
    this.checkpoint = checkpoint
    this.lap = lap
  }
}

module.exports = Ship
