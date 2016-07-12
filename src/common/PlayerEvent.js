class PlayerEvent {
  type: string
  val: any

  constructor (type, val) {
    this.type = type
    this.val = val
  }
}

module.exports = PlayerEvent
