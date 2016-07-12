const p2 = require('p2')
const Turn = require('./Turn.js')
const C = require('./constants.js')

class Game {
  map: Track
  socketToShip: Object
  turn: Turn
  turns: Array<Turn>
  world: p2.World

  constructor (map : Track) {
    this.map = map
    this.socketToShip = {}
    this.turn = new Turn(map, [], [], [])
    this.turns = [this.turn]

    const world = new p2.World({ gravity: [0, 0] })
    this.world = world

    map.forEach((row, i) => {
      row.split('').forEach((cell, j) => {
        // if it's a wall, add a collider
        if (cell === '1') {
          const cellShape = new p2.Box({
            width: C.CELL_EDGE,
            height: C.CELL_EDGE
          })
          const cellBody = new p2.Body({
            mass: 0,
            position: [j * C.CELL_EDGE, i * C.CELL_EDGE]
          })
          cellBody.addShape(cellShape)
          world.addBody(cellBody)
        }
      })
    })
  }

  onPlayerJoin (socket) {
    const shipId = this.turn.getFreeShipSlot()
    this.socketToShip[socket.id] = shipId
    this.turn.addServerEvent(C.EVENT_TYPE.SPAWN_PLAYER, shipId)
  }

  onPlayerEvent (socket, events, turnIndex) {
    // TO-DO: take into account turnIndex and rollback/resimulate
    if (!Array.isArray(events)) events = [events]
    this.turn.addEvent(events)
  }

  tick () {
    const nextTurn = this.turn.evolve()
    this.turn = nextTurn
    this.turns.push(nextTurn)
  }
}

module.exports = Game
