// @flow
const PIXI = require('pixi.js')
const p2 = require('p2')
const C = require('../common/constants.js')

const COLORS = [0xFF4444, 0x44FF44, 0x4488FF, 0xFFFF44, 0xFF44FF, 0x44FFFF]

const WALL_LABEL_STYLE = {
  font: '11px monospace',
  fill: 0xFFFFFF,
  stroke: 0x000000,
  strokeThickness: 3
}

function roadBounds (grid) {
  let minI = null
  let maxI = null
  let minJ = null
  let maxJ = null

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      if (grid[i][j] === C.WALL) continue
      minI = minI == null ? i : Math.min(minI, i)
      maxI = maxI == null ? i : Math.max(maxI, i)
      minJ = minJ == null ? j : Math.min(minJ, j)
      maxJ = maxJ == null ? j : Math.max(maxJ, j)
    }
  }

  if (minI == null) return null

  return {
    minI,
    maxI,
    minJ,
    maxJ,
    centerI: (minI + maxI + 1) / 2,
    centerJ: (minJ + maxJ + 1) / 2
  }
}

function cellCenter (i, j) {
  return [
    j * C.CELL_EDGE - C.HALF_EDGE + C.CELL_EDGE / 2,
    i * C.CELL_EDGE - C.HALF_EDGE + C.CELL_EDGE / 2
  ]
}

function addWallDirectionLabels (container, map) {
  const bounds = roadBounds(map.grid)
  if (!bounds) return

  const { minI, maxI, minJ, maxJ, centerI, centerJ } = bounds
  const labels = [
    { text: 'WEST\n(−x)', i: centerI, j: minJ - 1 },
    { text: 'EAST\n(+x)', i: centerI, j: maxJ + 1 },
    { text: 'NORTH\n(−y)', i: minI - 1, j: centerJ },
    { text: 'SOUTH\n(+y)', i: maxI + 1, j: centerJ }
  ]

  labels.forEach(({ text, i, j }) => {
    const [x, y] = cellCenter(i, j)
    const label = new PIXI.Text(text, WALL_LABEL_STYLE)
    label.anchor.x = 0.5
    label.anchor.y = 0.5
    label.position.set(x, y)
    container.addChild(label)
  })
}

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

  addWallDirectionLabels(container, game.map)

  return container
}

module.exports = { buildCollisionOverlay }
