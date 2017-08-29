// @flow
const p2 = require('p2')
const subError = require('subclass-error')

const constants = {
  TURN_MAX_DELAY: Math.floor(1000 / 60), // quantity of turns stored in server
  TIME_STEP: 1000 / 60,
  CLIENT_LEAD: 0,
  FORCE: 300,
  CELL_EDGE: 10,
  HALF_EDGE: 10 / 2,

  WALL: '#',
  WALL_COLOR: 0x000000,
  ROAD_COLOR: 0xAAAAFF,

  MAX_LAPS: 5,

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
  },

  InvalidTurnError: subError('InvalidTurnError'),

  SHIP_MTRL: new p2.Material(),
  WALL_MTRL: new p2.Material(),
  SHIP_VS_WALL_CONTACT_MTRL: null,
  SHIP_VS_SHIP_CONTACT_MTRL: null
}

constants.SHIP_VS_WALL_CONTACT_MTRL = new p2.ContactMaterial(
  constants.SHIP_MTRL,
  constants.WALL_MTRL,
  {
    restitution: 0.5,
    stiffness: Number.MAX_VALUE
  }
)

constants.SHIP_VS_SHIP_CONTACT_MTRL = new p2.ContactMaterial(
  constants.SHIP_MTRL,
  constants.SHIP_MTRL,
  {
    restitution: 1.0,
    stiffness: Number.MAX_VALUE
  }
)

constants.TIME_STEP = 1000 / 60
constants.TURN_MAX_DELAY = Math.ceil(500 / constants.TIME_STEP)

module.exports = constants
