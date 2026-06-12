/* eslint-env mocha */
const expect = require('unexpected')
const { COLLIDER_APPROACH } = require('../src/common/cellColliders')
const { track1, track2, track3, track4 } = require('../src/common/tracks')
const { simulatePlayerRelativeWallBounce } = require('./wallCollisionSimulation')

// Max ticks from MERGED_RECTANGLES baselines × 1.15 for the thrust direction.
const WALL_BOUNCE_LIMITS = {
  Chicane: { behind: 184, left: 98 },
  Hairpin: { behind: 283, left: 155 },
  'Miracle Park': { behind: 1640, left: 1049 },
  'Bowser Castle': { behind: 334, left: 299 }
}

const PLAYER_SIDES = ['behind', 'left']

describe('Physics: trapezoid colliders block player-relative wall sides', function () {
  this.timeout(300000)

  ;[
    [track1, 'Chicane'],
    [track2, 'Hairpin'],
    [track3, 'Miracle Park'],
    [track4, 'Bowser Castle']
  ].forEach(([track, name]) => {
    PLAYER_SIDES.forEach((side) => {
      it(`${name}: wall ${side} the player bounces the ship on road`, () => {
        const limit = WALL_BOUNCE_LIMITS[name][side]
        const result = simulatePlayerRelativeWallBounce(
          track,
          side,
          COLLIDER_APPROACH.TRAPEZOID,
          limit
        )
        expect(result.bounced, 'to be', true)
        expect(result.tick, 'to be a number')
        expect(result.tick, 'to be less than or equal to', limit)
      })
    })
  })
})
