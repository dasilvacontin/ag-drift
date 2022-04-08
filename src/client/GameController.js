// @flow
const PIXI = require('pixi.js')
const Game = require('../common/Game.js')
const Turn = require('../common/Turn.js')
const ShipController = require('./ShipController.js')
const C = require('../common/constants.js')

const colors = {}
colors[C.WALL] = C.WALL_COLOR
colors[' '] = C.ROAD_COLOR
colors['1'] = C.ROAD_COLOR
colors['2'] = C.ROAD_COLOR
colors['3'] = C.ROAD_COLOR
colors['4'] = C.ROAD_COLOR
colors['5'] = C.ROAD_COLOR
colors['6'] = C.ROAD_COLOR
colors['7'] = C.ROAD_COLOR
colors['8'] = C.ROAD_COLOR
colors[';'] = 0x29A41A

class GameController {
  game: Game
  stage: PIXI.Stage
  ships: Array<ShipController>
  foreground: PIXI.Sprite
  lastTurn: Turn

  constructor (game: Game, debug: boolean = false) {
    this.game = game
    this.stage = new PIXI.Container()
    this.ships = []

    // add sprites for map
    if (debug) return

    if (game.map.background) {
      const background = new PIXI.Sprite.fromImage(game.map.background)
      background.position.x = -C.HALF_EDGE
      background.position.y = -C.HALF_EDGE
      background.width = C.CELL_EDGE * game.map.grid[0].length
      background.height = C.CELL_EDGE * game.map.grid.length
      this.stage.addChild(background)
    }

    if (game.map.wallColor) {
      C.WALL_COLOR = game.map.wallColor
      colors[C.WALL] = C.WALL_COLOR
    }

    if (!game.map.background) {
      game.map.grid.forEach((row, i) => {
        row.forEach((cell, j) => {
          const sprite = new PIXI.Graphics()
          if (cell !== game.map.startingCheckpoint) {
            sprite.beginFill(colors[cell])
            sprite.drawRect(0, 0, C.CELL_EDGE, C.CELL_EDGE)
            sprite.endFill()
            this.stage.addChild(sprite)
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
    }

    if (game.map.foreground) {
      const foreground = new PIXI.Sprite.fromImage(game.map.foreground)
      foreground.position.x = -C.HALF_EDGE
      foreground.position.y = -C.HALF_EDGE
      foreground.width = C.CELL_EDGE * game.map.grid[0].length
      foreground.height = C.CELL_EDGE * game.map.grid.length
      this.foreground = foreground
    }
  }

  update (turn: Turn) {
    this.lastTurn = turn
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
    this.foreground && this.stage.addChild(this.foreground)
  }

  regenerateAllShipSprites () {
    this.ships.forEach((s, i) => s && s.regenerateSprites(this.lastTurn.ships[i]))
  }
}

module.exports = GameController
