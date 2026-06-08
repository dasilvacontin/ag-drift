// @flow
const C = require('./constants.js')

const DIRECTION_CHARS = new Set(['u', 'r', 'd', 'l'])

function aiGridRowCells (row: string | Array<string>) {
  return typeof row === 'string' ? row.split('') : row
}

function aiGridCellAtPosition (track: Track, position: Array<number>) {
  const ci = Math.floor((position[1] + C.CELL_EDGE / 2) / C.CELL_EDGE)
  const cj = Math.floor((position[0] + C.CELL_EDGE / 2) / C.CELL_EDGE)
  return ((track.aiGrid[ci] || {})[cj] || ' ')
}

function isValidAiGridDirection (cell: string) {
  return DIRECTION_CHARS.has(cell)
}

function assertAiGridMatchesGrid (track: Track) {
  if (track.aiGrid.length !== track.grid.length) {
    throw new Error(`${track.id}: aiGrid row count ${track.aiGrid.length} !== grid ${track.grid.length}`)
  }
  track.grid.forEach((row, i) => {
    const aiRow = aiGridRowCells(track.aiGrid[i])
    if (aiRow.length !== row.length) {
      throw new Error(`${track.id} row ${i}: aiGrid width ${aiRow.length} !== grid ${row.length}`)
    }
  })
}

module.exports = {
  aiGridCellAtPosition,
  aiGridRowCells,
  isValidAiGridDirection,
  assertAiGridMatchesGrid
}
