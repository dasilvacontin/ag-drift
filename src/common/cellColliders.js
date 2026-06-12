// @flow
const p2 = require('p2')
const C = require('./constants.js')

const COLLIDER_APPROACH = {
  TRAPEZOID: 'trapezoid',
  MERGED_RECTANGLES: 'merged-rectangles'
}

const DEFAULT_COLLIDER_APPROACH = COLLIDER_APPROACH.MERGED_RECTANGLES

function generateMergedRectangleBodies (grid) {
  const cellBodies = []
  const rows = grid.length
  const cols = (grid[0] || []).length
  const E = C.CELL_EDGE
  const HE = C.HALF_EDGE

  const flushRun = (run) => {
    const width = (run.endJ - run.startJ + 1) * E
    const height = (run.endI - run.startI + 1) * E
    const cx = run.startJ * E + width / 2 - HE
    const cy = run.startI * E + height / 2 - HE
    const body = new p2.Body({ mass: 0, position: [cx, cy] })
    const shape = new p2.Box({ width, height, material: C.WALL_MTRL })
    body.addShape(shape)
    cellBodies.push(body)
  }

  let activeRuns = new Map()

  for (let i = 0; i < rows; i++) {
    const currentRuns = new Map()
    let j = 0
    while (j < cols) {
      if (grid[i][j] === C.WALL) {
        const startJ = j
        while (j < cols && grid[i][j] === C.WALL) j++
        const endJ = j - 1
        currentRuns.set(`${startJ},${endJ}`, { startJ, endJ })
      } else {
        j++
      }
    }

    const nextActiveRuns = new Map()
    for (const [key, run] of activeRuns) {
      if (currentRuns.has(key)) {
        nextActiveRuns.set(key, { ...run, endI: i })
        currentRuns.delete(key)
      } else {
        flushRun(run)
      }
    }

    for (const [key, { startJ, endJ }] of currentRuns) {
      nextActiveRuns.set(key, { startJ, endJ, startI: i, endI: i })
    }

    activeRuns = nextActiveRuns
  }

  for (const [, run] of activeRuns) {
    flushRun(run)
  }

  return cellBodies
}

function generateTrapezoidBodies (grid) {
  const cellBodies = []
  const rows = grid.length
  const cols = (grid[0] || []).length
  const E = C.CELL_EDGE
  const HE = C.HALF_EDGE

  const isWall = (i, j) => {
    if (i < 0 || i >= rows || j < 0 || j >= cols) return false
    return grid[i][j] === C.WALL
  }

  const isRoad = (i, j) => {
    if (i < 0 || i >= rows || j < 0 || j >= cols) return false
    return grid[i][j] !== C.WALL
  }

  const body = new p2.Body({ mass: 0, position: [0, 0] })

  // Each template is CCW and oriented so p2 blocks approach from the road side.
  const addConvexCCW = (vertices) => {
    if (vertices.length < 3) return
    try {
      const shape = new p2.Convex({ vertices, material: C.WALL_MTRL })
      shape.material = C.WALL_MTRL
      body.addShape(shape)
    } catch (e) {
      // Skip degenerate shapes
    }
  }

  for (let j = 0; j < cols; j++) {
    let i = 0
    while (i < rows) {
      if (!isWall(i, j) || !isRoad(i, j - 1)) {
        i++
        continue
      }
      let endI = i
      while (
        endI + 1 < rows &&
        isWall(endI + 1, j) &&
        isRoad(endI + 1, j - 1)
      ) endI++
      const xFace = j * E - HE
      const xInner = j * E
      addConvexCCW([
        [xFace, i * E - HE],
        [xInner, i * E],
        [xInner, endI * E],
        [xFace, endI * E + HE]
      ])
      i = endI + 1
    }
  }

  for (let i = 0; i < rows; i++) {
    let j = 0
    while (j < cols) {
      if (!isWall(i, j) || !isRoad(i - 1, j)) {
        j++
        continue
      }
      let endJ = j
      while (
        endJ + 1 < cols &&
        isWall(i, endJ + 1) &&
        isRoad(i - 1, endJ + 1)
      ) endJ++
      const yFace = i * E - HE
      const yInner = i * E
      addConvexCCW([
        [j * E - HE, yFace],
        [j * E, yInner],
        [endJ * E, yInner],
        [endJ * E + HE, yFace]
      ])
      j = endJ + 1
    }
  }

  for (let j = 0; j < cols; j++) {
    let i = 0
    while (i < rows) {
      if (!isWall(i, j) || !isRoad(i, j + 1)) {
        i++
        continue
      }
      let endI = i
      while (
        endI + 1 < rows &&
        isWall(endI + 1, j) &&
        isRoad(endI + 1, j + 1)
      ) endI++
      const xFace = j * E + HE
      const xInner = j * E
      addConvexCCW([
        [xInner, endI * E],
        [xInner, i * E],
        [xFace, i * E - HE],
        [xFace, endI * E + HE]
      ])
      i = endI + 1
    }
  }

  for (let i = 0; i < rows; i++) {
    let j = 0
    while (j < cols) {
      if (!isWall(i, j) || !isRoad(i + 1, j)) {
        j++
        continue
      }
      let endJ = j
      while (
        endJ + 1 < cols &&
        isWall(i, endJ + 1) &&
        isRoad(i + 1, endJ + 1)
      ) endJ++
      const yFace = i * E + HE
      const yInner = i * E
      addConvexCCW([
        [endJ * E, yFace],
        [j * E, yFace],
        [j * E - HE, yInner],
        [endJ * E + HE, yInner]
      ])
      j = endJ + 1
    }
  }

  if (body.shapes.length > 0) {
    cellBodies.push(body)
  }

  return cellBodies
}

function generateCellBodies (grid, approach = DEFAULT_COLLIDER_APPROACH) {
  switch (approach) {
    case COLLIDER_APPROACH.MERGED_RECTANGLES:
      return generateMergedRectangleBodies(grid)
    case COLLIDER_APPROACH.TRAPEZOID:
    default:
      return generateTrapezoidBodies(grid)
  }
}

module.exports = {
  COLLIDER_APPROACH,
  DEFAULT_COLLIDER_APPROACH,
  generateCellBodies,
  generateMergedRectangleBodies,
  generateTrapezoidBodies
}
