// @flow
const PlayerInput = require('./PlayerInput.js')
const { vec2 } = require('p2')

class Ship {
  position: vec2
  velocity: vec2
  angle: number
  color: number
  input: PlayerInput

  constructor ({
    position,
    velocity,
    angle,
    color,
    input
  } : {
    position: vec2,
    velocity: vec2,
    angle: number,
    color: number,
    input: PlayerInput
  }) {
    this.position = position
    this.velocity = velocity
    this.angle = angle
    this.color = color
    this.input = input
  }
}

module.exports = Ship
