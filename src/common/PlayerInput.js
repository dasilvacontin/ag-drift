// @flow
const C = require('./constants.js')

class PlayerInput {
  gas: boolean
  boost: boolean
  leanL: boolean
  leanR: boolean
  turnL: boolean
  turnR: boolean

  constructor ({
    gas = false,
    boost = false,
    leanL = false,
    leanR = false,
    turnL = false,
    turnR = false
  }: {
    gas: boolean,
    boost: boolean,
    leanL: boolean,
    leanL: boolean,
    leanR: boolean,
    turnL: boolean,
    turnR: boolean
  } = {}) {
    this.gas = gas
    this.boost = boost
    this.leanL = leanL
    this.leanR = leanR
    this.turnL = turnL
    this.turnR = turnR
  }

  applyPlayerEvent (ev : GameEvent) {
    switch (ev.type) {
      case C.PLAYER_EVENT.TURN_L: this.turnL = true; break
      case C.PLAYER_EVENT.TURN_R: this.turnR = true; break

      case C.PLAYER_EVENT.GAS: this.gas = ev.val; break
      case C.PLAYER_EVENT.BOOST: this.boost = ev.val; break

      case C.PLAYER_EVENT.LEAN_L: this.leanL = ev.val; break
      case C.PLAYER_EVENT.LEAN_R: this.leanR = ev.val; break
    }
  }
}

module.exports = PlayerInput
