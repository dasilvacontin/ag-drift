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

    body.shapes.forEach((shape) => {
      const ox = shape.position[0]
      const oy = shape.position[1]
      const bx = body.position[0]
      const by = body.position[1]

      gfx.lineStyle(0.3, color, 0.9)
      gfx.beginFill(color, 0.15)

      if (shape instanceof p2.Box) {
        const cx = bx + ox
        const cy = by + oy
        gfx.drawRect(cx - shape.width / 2, cy - shape.height / 2, shape.width, shape.height)
      } else if (shape.vertices) {
        const verts = shape.vertices
        gfx.moveTo(bx + ox + verts[0][0], by + oy + verts[0][1])
        for (let i = 1; i < verts.length; i++) {
          gfx.lineTo(bx + ox + verts[i][0], by + oy + verts[i][1])
        }
        gfx.lineTo(bx + ox + verts[0][0], by + oy + verts[0][1])
      }

      gfx.endFill()
    })
  })

  container.addChild(gfx)
  return container
}

module.exports = { buildCollisionOverlay }
