/* eslint-env mocha */
const expect = require('unexpected')
const { COLLIDER_APPROACH } = require('../src/common/cellColliders')
const { track1, track2, track3, track4 } = require('../src/common/tracks')
const { simulateBotUntilTwoLaps } = require('./botLapSimulation')

// Baseline ticks until lap 2, measured with MERGED_RECTANGLES colliders.
const LAP_TICK_LIMITS = {
  Chicane: 474,
  Hairpin: 1057,
  'Miracle Park': 1029,
  'Bowser Castle': 1648
}

describe('Physics: bot lap with trapezoid colliders', function () {
  this.timeout(300000)

  ;[
    [track1, 'Chicane'],
    [track2, 'Hairpin'],
    [track3, 'Miracle Park'],
    [track4, 'Bowser Castle']
  ].forEach(([track, name]) => {
    it(`${name}: a bot completes one lap`, () => {
      const ticks = simulateBotUntilTwoLaps(
        track,
        COLLIDER_APPROACH.TRAPEZOID
      )
      expect(ticks, 'to be a number')
      expect(ticks, 'to be less than or equal to', LAP_TICK_LIMITS[name])
    })
  })
})
