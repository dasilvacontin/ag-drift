// @flow
const PIXI = require('pixi.js')
const Game = require('../common/Game.js')
const Turn = require('../common/Turn.js')
const ShipController = require('./ShipController.js')
const C = require('../common/constants.js')

class GameController {
  game: Game
  stage: PIXI.Stage
  ships: Array<ShipController>

  constructor (game: Game, debug: boolean = false) {
    this.game = game
    this.stage = new PIXI.Container()
    this.ships = []

    // add sprites for map
    if (debug) return

    const background = new PIXI.Sprite.fromImage('images/track2.png')
    background.position.x = -C.HALF_EDGE
    background.position.y = -C.HALF_EDGE
    background.width = C.CELL_EDGE * 26;
    background.height = C.CELL_EDGE * 13;

    /*
    game.map.forEach((row, i) => {
      row.forEach((cell, j) => {
        const sprite = new PIXI.Graphics()
        if (cell !== '9') {
          if (cell === C.WALL) {
            sprite.beginFill(cell === C.WALL ? C.WALL_COLOR : C.ROAD_COLOR)
            sprite.drawRect(0, 0, C.CELL_EDGE, C.CELL_EDGE)
            sprite.endFill()
            this.stage.addChild(sprite)
          }
        } else {
          sprite.beginFill(C.ROAD_COLOR)
          sprite.drawRect(0, 0, C.CELL_EDGE, C.CELL_EDGE)
          sprite.endFill()
          const subs = 5
          const subEdge = C.CELL_EDGE / subs
          for (let fi = 0; fi < subs; ++fi) {
            for (let fj = 2; fj < subs; ++fj) {
              const color = (fi + fj) % 2 === 1 ? C.ROAD_COLOR : 0x111111
              sprite.beginFill(color)
              sprite.drawRect(fj * subEdge, fi * subEdge, subEdge, subEdge)
              sprite.endFill()
            }
          }
          this.stage.addChild(sprite)
        }

        sprite.position = new PIXI.Point(j * C.CELL_EDGE - C.HALF_EDGE, i * C.CELL_EDGE - C.HALF_EDGE)
      })
    })
    */

    this.stage.addChild(background)
  }

  update (turn: Turn) {
    turn.ships.forEach((ship, i) => {
      if (ship == null) {
        const shipController = this.ships[i]
        if (shipController) {
          this.stage.removeChild(shipController.sprite)
          delete this.ships[i]
        }
        return
      }

      let shipController = this.ships[i]
      if (shipController == null) {
        shipController = new ShipController(ship)
        this.stage.addChild(shipController.sprite)
        this.ships[i] = shipController
      }
      shipController.update(ship)
    })
  }
}

module.exports = GameController
