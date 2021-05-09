// @flow
const p2 = require('p2')
const subError = require('subclass-error')

const TIME_STEP = 1000 / 60
const SHIP_MTRL = new p2.Material()
const WALL_MTRL = new p2.Material()

const constants = {
  TIME_STEP,
  TURN_MAX_DELAY: Math.ceil(500 / TIME_STEP), // quantity of turns stored in server
  CLIENT_LEAD: 0,
  FORCE: 300,
  CELL_EDGE: 10,
  HALF_EDGE: 10 / 2,

  WALL: '#',
  WALL_COLOR: 0x000000,
  ROAD_COLOR: 0xEBEBEB, // 0xAAAAFF

  MAX_LAPS: 5,

  GAME_STATE: {
    COUNTDOWN: 'gameCountdown',
    IN_PROGRESS: 'gameInProgress',
    FINISH_COUNTDOWN: 'gameFinishCountdown',
    RESULTS_SCREEN: 'gameResultsScreen'
  },
  FINISH_COUNTDOWN_S: 15 * 1000 / TIME_STEP,
  RESULTS_SCREEN_S: 5 * 1000 / TIME_STEP,

  SERVER_EVENT: {
    SPAWN_PLAYER: 'spawnPlayer',
    DESTROY_PLAYER: 'destroyPlayer'
  },

  PLAYER_EVENT: {
    TURN_L: 'turnL',
    TURN_R: 'turnR',
    GAS: 'gas',
    BOOST: 'boost',
    LEAN_L: 'leanL',
    LEAN_R: 'leanR'
  },

  InvalidTurnError: subError('InvalidTurnError'),

  SHIP_MTRL,
  WALL_MTRL,
  SHIP_VS_WALL_CONTACT_MTRL: new p2.ContactMaterial(
    SHIP_MTRL,
    WALL_MTRL,
    {
      restitution: 0.001,
      friction: 5,
      frictionRelaxation: 4,
      frictionStiffness: 1000000,
      stiffness: Number.MAX_VALUE
    }
  ),
  SHIP_VS_SHIP_CONTACT_MTRL: new p2.ContactMaterial(
    SHIP_MTRL,
    SHIP_MTRL,
    {
      restitution: 0.4,
      friction: 0.95,
      stiffness: Number.MAX_VALUE
    }
  )
}

module.exports = constants
