// @flow
module.exports = {
  TURN_MAX_DELAY: 30, // 500ms at 1/60 steps per s
  TIME_STEP: 1000 / 60,
  FORCE: 300,
  CELL_EDGE: 10,
  HALF_EDGE: 10 / 2,

  WALL_COLOR: 0x3F51B5,
  ROAD_COLOR: 0xAAAAFF,

  SERVER_EVENT: {
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
