/* eslint-env mocha */
const expect = require('unexpected')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const {
  SHIP_COLOR_VALUES,
  countShipColorUsage,
  pickShipColor
} = require('../src/common/colors')

function makeShip (color) {
  return new Ship({
    position: [0, 0],
    velocity: [0, 0],
    angle: 0,
    username: 'racer',
    color,
    input: new PlayerInput(),
    checkpoint: 1,
    lap: 0,
    currentLaptime: 0,
    laptimes: [0],
    isDrafting: false
  })
}

describe('colors', () => {
  describe('countShipColorUsage', () => {
    it('ignores null slots and non-palette colors', () => {
      const ships = [
        makeShip(0xFF0000),
        null,
        makeShip(0x123456)
      ]

      const counts = countShipColorUsage(ships)
      expect(counts.get(0xFF0000), 'to be', 1)
      expect(counts.get(0x00FF00), 'to be', 0)
    })
  })

  describe('pickShipColor', () => {
    it('picks from unused palette colors when some are available', () => {
      const ships = [
        makeShip(0xFF0000),
        makeShip(0x00FF00)
      ]

      const color = pickShipColor(ships, () => 0)
      expect(SHIP_COLOR_VALUES, 'to contain', color)
      expect(color, 'not to be', 0xFF0000)
      expect(color, 'not to be', 0x00FF00)
    })

    it('reuses least-used colors when every palette color is taken', () => {
      const ships = SHIP_COLOR_VALUES.map((color, i) => {
        const ship = makeShip(color)
        ship.username = `racer-${i}`
        return ship
      })

      const color = pickShipColor(ships, () => 0)
      expect(SHIP_COLOR_VALUES, 'to contain', color)
    })

    it('counts reserved colors from pending spawns', () => {
      const ships = [makeShip(0xFF0000)]
      const color = pickShipColor(ships, () => 0, [0x00FF00, 0x0000FF])
      expect(color, 'not to be', 0xFF0000)
      expect(color, 'not to be', 0x00FF00)
      expect(color, 'not to be', 0x0000FF)
    })

    it('prefers colors with lower usage when some are duplicated', () => {
      const ships = SHIP_COLOR_VALUES.map((color, i) => {
        const ship = makeShip(color)
        ship.username = `racer-${i}`
        return ship
      })
      ships[0] = makeShip(0xFF0000)
      ships[1] = makeShip(0xFF0000)

      const color = pickShipColor(ships, () => 0)
      expect(color, 'not to be', 0xFF0000)
      expect(SHIP_COLOR_VALUES, 'to contain', color)
    })
  })
})
