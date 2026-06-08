// @flow
const SHIP_COLORS = [
  { name: 'red', value: 0xFF0000 },
  { name: 'green', value: 0x00FF00 },
  { name: 'blue', value: 0x0000FF },
  { name: 'cyan', value: 0x00FFFF },
  { name: 'magenta', value: 0xFF00FF },
  { name: 'yellow', value: 0xFFFF00 },
  { name: 'black', value: 0x000000 },
  { name: 'white', value: 0xFFFFFF },
  { name: 'orange', value: 0xFF8000 },
  { name: 'purple', value: 0x8000FF },
  { name: 'lime', value: 0x80FF00 },
  { name: 'pink', value: 0xFF4080 }
]

const SHIP_COLOR_VALUES = SHIP_COLORS.map(({ value }) => value)

const colorUsageCounts = new Map(
  SHIP_COLOR_VALUES.map((value) => [value, 0])
)

function countShipColorUsage (
  ships: Array<?Ship>,
  reservedColors: Array<number> = []
) {
  const counts = new Map(colorUsageCounts)

  ships.forEach((ship) => {
    if (ship == null) return
    if (!counts.has(ship.color)) return
    counts.set(ship.color, counts.get(ship.color) + 1)
  })

  reservedColors.forEach((color) => {
    if (!counts.has(color)) return
    counts.set(color, counts.get(color) + 1)
  })

  return counts
}

/**
 * Pick a ship color from the palette, preferring colors used least among
 * visible racers. When some colors are unused (count 0), only those are
 * candidates; when every color is already taken, the least-used colors are
 * eligible and may be reused.
 */
function pickShipColor (
  ships: Array<?Ship>,
  random: () => number = Math.random,
  reservedColors: Array<number> = []
) : number {
  const counts = countShipColorUsage(ships, reservedColors)
  let minUsage = Infinity

  SHIP_COLOR_VALUES.forEach((value) => {
    const usage = counts.get(value) || 0
    if (usage < minUsage) minUsage = usage
  })

  const candidates = SHIP_COLOR_VALUES.filter(
    (value) => (counts.get(value) || 0) === minUsage
  )

  return candidates[Math.floor(random() * candidates.length)]
}

module.exports = {
  SHIP_COLORS,
  SHIP_COLOR_VALUES,
  countShipColorUsage,
  pickShipColor
}
