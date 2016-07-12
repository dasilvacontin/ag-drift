module.exports = {
  TIME_STEP: 1 / 60,
  FORCE: 300,
  CELL_EDGE: 10,
  HALF_EDGE: 10 / 2,

  WALL_COLOR: 0x3F51B5,
  ROAD_COLOR: 0xAAAAFF,

  EVENT_TYPE: {
    SPAWN_PLAYER: 'spawnPlayer'
  },

  PLAYER_EVENT: {
    TURN_L: 'turnL',
    TURN_R: 'turnR',
    GAS: 'gas',
    BOOST: 'boost',
    LEAN_L: 'leanL',
    LEAN_R: 'leanR'
  }
}
