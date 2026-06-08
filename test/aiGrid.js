/* eslint-env mocha */
const expect = require('unexpected')
const Game = require('../src/common/Game')
const Turn = require('../src/common/Turn')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const {
  aiGridCellAtPosition,
  isValidAiGridDirection,
  assertAiGridMatchesGrid
} = require('../src/common/aiGrid')
const { tracks } = require('../src/common/tracks')

const { positionForShipId } = Turn

function makeBotShip (track, shipId, username = 'Bot (Bot)') {
  const position = positionForShipId(track, shipId)
  return new Ship({
    position: [position[0], position[1]],
    velocity: [0, 0],
    angle: -Math.PI / 2,
    username,
    color: 0xff0000,
    input: new PlayerInput(),
    checkpoint: 1,
    lap: 0,
    currentLaptime: 0,
    laptimes: [0],
    isDrafting: false
  })
}

describe('aiGrid', () => {
  tracks.forEach((track) => {
    it(`${track.id}: aiGrid dimensions match race grid`, () => {
      expect(() => assertAiGridMatchesGrid(track), 'not to error')
    })
  })

  describe('after track switch (cup Hairpin first map)', () => {
    const chicane = tracks[0]
    const hairpin = tracks[1]

    it('resetForTrackChange uses Hairpin aiGrid at bot starting positions', () => {
      const game = new Game(chicane, true)
      const bots = [0, 1, 2, 3, 4].map((id) => makeBotShip(chicane, id))
      game.turn = new Turn(bots, [], [])
      game.turns = [game.turn]

      game.resetForTrackChange(hairpin)

      bots.forEach((_, shipId) => {
        const ship = game.turn.ships[shipId]
        expect(ship, 'to be truthy')
        const cell = aiGridCellAtPosition(hairpin, ship.position)
        expect(
          isValidAiGridDirection(cell),
          'to be',
          true
        )
      })
    })

    it('stale Chicane aiGrid gives wrong direction on Hairpin course cells', () => {
      const pos = [5, 5]
      const onHairpin = aiGridCellAtPosition(hairpin, pos)
      const onChicane = aiGridCellAtPosition(chicane, pos)

      expect(onHairpin, 'to be', 'd')
      expect(onChicane, 'to be', 'r')
      expect(onHairpin, 'not to be', onChicane)
    })

    it('game.map drives aiGrid lookup after resetForTrackChange', () => {
      const game = new Game(chicane, true)
      game.turn = new Turn([], [], [])
      game.turns = [game.turn]

      game.resetForTrackChange(hairpin)

      const pos = [5, 5]
      expect(aiGridCellAtPosition(game.map, pos), 'to be', 'd')
      expect(aiGridCellAtPosition(chicane, pos), 'to be', 'r')
    })

    it('lookup follows the active track object after switch', () => {
      let activeTrack = chicane
      const pos = positionForShipId(hairpin, 0)

      activeTrack = hairpin
      const cell = aiGridCellAtPosition(activeTrack, pos)
      expect(cell, 'to be', aiGridCellAtPosition(hairpin, pos))
      expect(isValidAiGridDirection(cell), 'to be', true)
    })
  })
})
