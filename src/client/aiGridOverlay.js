// @flow
const PIXI = require('pixi.js')
const C = require('../common/constants.js')
const { isValidAiGridDirection, aiGridRowCells } = require('../common/aiGrid.js')

const DIRECTION_COLORS = {
  u: 0x00FFFF,
  r: 0x44FF44,
  d: 0xFFAA00,
  l: 0xFF44FF
}

function buildAiGridOverlay (map: Track): ?PIXI.Container {
  if (!map.aiGrid || map.aiGrid.length === 0) return null

  const container = new PIXI.Container()
  const lineWidth = 1 / map.zoom
  const gridLines = new PIXI.Graphics()
  gridLines.lineStyle(lineWidth, 0xFF00FF, 0.2)

  map.aiGrid.forEach((row, i) => {
    aiGridRowCells(row).forEach((cell, j) => {
      const x = j * C.CELL_EDGE - C.HALF_EDGE
      const y = i * C.CELL_EDGE - C.HALF_EDGE
      gridLines.drawRect(x, y, C.CELL_EDGE, C.CELL_EDGE)

      if (cell === ' ' || cell === '#') return

      const label = new PIXI.Text(cell, {
        font: `${Math.max(4, Math.floor(C.CELL_EDGE * 0.55))}px monospace`,
        fill: isValidAiGridDirection(cell) ? DIRECTION_COLORS[cell] : 0xAAAAAA
      })
      label.anchor.x = 0.5
      label.anchor.y = 0.5
      label.position.set(x + C.CELL_EDGE / 2, y + C.CELL_EDGE / 2)
      container.addChild(label)
    })
  })

  container.addChildAt(gridLines, 0)
  return container
}

module.exports = {
  buildAiGridOverlay
}
