// @flow
class PlayerEvent {
  type: string
  val: any

  constructor (type: string, val: any) {
    this.type = type
    this.val = val
  }
}

module.exports = PlayerEvent
