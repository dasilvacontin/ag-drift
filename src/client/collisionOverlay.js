// @flow
const PIXI = require('pixi.js')
const p2 = require('p2')

const COLORS = [0xFF4444, 0x44FF44, 0x4488FF, 0xFFFF44, 0xFF44FF, 0x44FFFF]

function buildCollisionOverlay (game): ?PIXI.Container {
  if (!game.cellBodies || game.cellBodies.length === 0) return null

  const container = new PIXI.Container()
  const gfx = new PIXI.Graphics()

  game.cellBodies.forEach((body, bodyIndex) => {
    const color = COLORS[bodyIndex % COLORS.length]

    body.shapes.forEach((shape, shapeIndex) => {
      if (!(shape instanceof p2.Box)) return

      const ox = shape.position[0]
      const oy = shape.position[1]
      const cx = body.position[0] + ox
      const cy = body.position[1] + oy
      const w = shape.width
      const h = shape.height

      gfx.lineStyle(0.3, color, 0.9)
      gfx.beginFill(color, 0.15)
      gfx.drawRect(cx - w / 2, cy - h / 2, w, h)
      gfx.endFill()
    })
  })

  container.addChild(gfx)
  return container
}

module.exports = { buildCollisionOverlay }
