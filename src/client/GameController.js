const PIXI = require('pixi.js')
const ShipController = require('./ShipController.js')
const C = require('../common/constants.js')

class GameController {
  game: Game
  stage: PIXI.Stage
  ships: Array<ShipController>

  constructor (game: Game, stage: PIXI.Stage) {
    this.game = game
    this.stage = stage

    // add sprites for map
    game.map.forEach((row, i) => {
      row.split('').forEach((cell, j) => {
        const sprite = new PIXI.Graphics()
        sprite.beginFill(cell === '1' ? C.WALL_COLOR : C.ROAD_COLOR)
        sprite.drawRect(0, 0, C.CELL_EDGE, C.CELL_EDGE)
        sprite.endFill()
        sprite.position = new PIXI.Point(j * C.CELL_EDGE - C.HALF_EDGE, i * C.CELL_EDGE - C.HALF_EDGE)
        stage.addChild(sprite)
      })
    })
  }

  update () {
    this.game.turn.ships.forEach((ship, i) => {
      if (ship == null) return

      let shipController = this.ships[i]
      if (shipController == null) {
        shipController = new ShipController()
        this.ships[i] = shipController
      }
      shipController.update(ship)
    })
  }
}

module.exports = GameController
