/* eslint-env mocha */
const expect = require('unexpected')
const { COLLIDER_APPROACH } = require('../src/common/cellColliders')
const { track1, track2, track3, track4 } = require('../src/common/tracks')
const { simulateUntilWallHit } = require('./wallCollisionSimulation')

// Baseline ticks until wall contact, measured with MERGED_RECTANGLES colliders.
const WALL_TICK_LIMITS = {
  Chicane: { left: 184, right: 184, up: 98, down: 98 },
  Hairpin: { left: 283, right: 283, up: 155, down: 155 },
  'Miracle Park': { left: 1640, right: 1640, up: 1049, down: 1049 },
  'Bowser Castle': { left: 334, right: 334, up: 299, down: 299 }
}

const DIRECTIONS = ['left', 'right', 'up', 'down']

describe('Physics: directional wall collision with trapezoid colliders', function () {
  this.timeout(300000)

  ;[
    [track1, 'Chicane'],
    [track2, 'Hairpin'],
    [track3, 'Miracle Park'],
    [track4, 'Bowser Castle']
  ].forEach(([track, name]) => {
    DIRECTIONS.forEach((direction) => {
      it(`${name}: hits wall driving ${direction}`, () => {
        const limit = WALL_TICK_LIMITS[name][direction]
        const ticks = simulateUntilWallHit(
          track,
          direction,
          COLLIDER_APPROACH.TRAPEZOID,
          limit
        )
        expect(ticks, 'to be a number')
        expect(ticks, 'to be less than or equal to', limit)
      })
    })
  })
})
