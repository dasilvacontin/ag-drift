const { vec2 } = require('p2')

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

module.exports = Ship
