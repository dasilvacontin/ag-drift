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

  /**
   * Reconstruct the effective input for a turn, matching Turn.evolve().
   * Inherits held inputs, resets turnL/turnR, then applies events in order.
   *
   * @param {PlayerInput} inheritedInput - Input carried over from the prior turn
   * @param {Array<GameEvent>} events - Events already stored on this turn for the ship
   * @returns {PlayerInput} Effective input state after applying events
   */
  static computeEffectiveInput (inheritedInput: PlayerInput, events: Array<GameEvent>) : PlayerInput {
    const input = new PlayerInput(inheritedInput)
    input.turnL = false
    input.turnR = false
    events.forEach((ev) => input.applyPlayerEvent(ev))
    return input
  }

  /**
   * Compare two effective input states for equality across all input fields.
   *
   * @param {PlayerInput} a - First input state
   * @param {PlayerInput} b - Second input state
   * @returns {boolean} Whether all input fields match
   */
  static areEqual (a: PlayerInput, b: PlayerInput) : boolean {
    return a.gas === b.gas &&
           a.boost === b.boost &&
           a.leanL === b.leanL &&
           a.leanR === b.leanR &&
           a.turnL === b.turnL &&
           a.turnR === b.turnR
  }
}

module.exports = PlayerInput
