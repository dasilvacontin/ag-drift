/* eslint-env mocha */
const expect = require('unexpected')
const Game = require('../src/common/Game')
const Turn = require('../src/common/Turn')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const C = require('../src/common/constants')
const PlayerEvent = require('../src/common/PlayerEvent')
const { SHIP_COLOR_VALUES } = require('../src/common/colors')

const testTrack = {
  name: 'test',
  grid: [
    ['#', '#', '#', '#', '#'],
    ['#', '1', ' ', ' ', '#'],
    ['#', '#', '#', '#', '#']
  ],
  startingCheckpoint: '1',
  boostDisabled: true
}

function createServerGame () {
  return new Game(testTrack, true)
}

function mockSocket () {
  const emitted = []
  return {
    id: `socket-${emitted.length}`,
    emit (event, payload) {
      emitted.push({ event, payload })
    },
    emitted
  }
}

describe('Game event batching', () => {
  describe('coalescePlayerEventBroadcasts', () => {
    it('merges same ship and turn entries', () => {
      const game = createServerGame()
      const eventA = new PlayerEvent(C.PLAYER_EVENT.GAS, true)
      const eventB = new PlayerEvent(C.PLAYER_EVENT.TURN_L, true)

      const result = game.coalescePlayerEventBroadcasts([
        { shipId: 0, turnIndex: 5, events: [eventA] },
        { shipId: 0, turnIndex: 5, events: [eventB] }
      ])

      expect(result, 'to equal', [
        { shipId: 0, turnIndex: 5, events: [eventA, eventB] }
      ])
    })

    it('preserves distinct keys in first-seen order', () => {
      const game = createServerGame()
      const eventA = new PlayerEvent(C.PLAYER_EVENT.GAS, true)
      const eventB = new PlayerEvent(C.PLAYER_EVENT.GAS, false)

      const result = game.coalescePlayerEventBroadcasts([
        { shipId: 0, turnIndex: 5, events: [eventA] },
        { shipId: 1, turnIndex: 5, events: [eventB] },
        { shipId: 0, turnIndex: 7, events: [eventA] }
      ])

      expect(result, 'to equal', [
        { shipId: 0, turnIndex: 5, events: [eventA] },
        { shipId: 1, turnIndex: 5, events: [eventB] },
        { shipId: 0, turnIndex: 7, events: [eventA] }
      ])
    })
  })

  describe('flushEventBroadcasts', () => {
    it('emits a single game:events:batch with coalesced payload', () => {
      const game = createServerGame()
      const socket = mockSocket()
      game.sockets[0] = socket

      const playerEvent = new PlayerEvent(C.PLAYER_EVENT.GAS, true)
      const serverEvent = {
        type: C.SERVER_EVENT.SPAWN_PLAYER,
        val: 0,
        username: 'tester',
        color: 0xff0000
      }

      game.pendingPlayerEventBroadcasts.push(
        { shipId: 0, turnIndex: 0, events: [playerEvent] },
        { shipId: 0, turnIndex: 0, events: [new PlayerEvent(C.PLAYER_EVENT.TURN_L, true)] }
      )
      game.pendingServerEventBroadcasts.push({ event: serverEvent, turnIndex: 0 })

      game.flushEventBroadcasts()

      expect(socket.emitted, 'to have length', 1)
      expect(socket.emitted[0].event, 'to be', 'game:events:batch')
      expect(socket.emitted[0].payload, 'to satisfy', {
        player: [
          {
            shipId: 0,
            turnIndex: 0,
            events: [
              playerEvent,
              new PlayerEvent(C.PLAYER_EVENT.TURN_L, true)
            ]
          }
        ],
        server: [{ event: serverEvent, turnIndex: 0 }]
      })
    })

    it('skips emit when queues are empty', () => {
      const game = createServerGame()
      const socket = mockSocket()
      game.sockets[0] = socket

      game.flushEventBroadcasts()

      expect(socket.emitted, 'to equal', [])
    })
  })

  describe('applyEventsBatch', () => {
    it('returns the minimum changed turn index', () => {
      const game = createServerGame()
      game.turnIndex = 10
      game.turns[3] = new Turn([], [], [])
      game.turns[7] = new Turn([], [], [])

      const minTurnIndex = game.applyEventsBatch({
        player: [
          { shipId: 0, turnIndex: 7, events: [new PlayerEvent(C.PLAYER_EVENT.GAS, true)] },
          { shipId: 1, turnIndex: 3, events: [new PlayerEvent(C.PLAYER_EVENT.GAS, true)] }
        ],
        server: []
      })

      expect(minTurnIndex, 'to be', 3)
    })

    it('applies server events before player events', () => {
      const game = createServerGame()
      game.turnIndex = 1

      const minTurnIndex = game.applyEventsBatch({
        server: [{
          event: {
            type: C.SERVER_EVENT.SPAWN_PLAYER,
            val: 0,
            username: 'tester',
            color: 0xff0000
          },
          turnIndex: 0
        }],
        player: [{
          shipId: 0,
          turnIndex: 0,
          events: [new PlayerEvent(C.PLAYER_EVENT.GAS, true)]
        }]
      })

      expect(minTurnIndex, 'to be', 0)
      game.resimulateFrom(0)
      expect(game.turn.ships[0], 'to be truthy')
      expect(game.turn.ships[0].username, 'to be', 'tester')
    })
  })

  describe('resetForTrackChange', () => {
    it('excludes bots from the starting grid when includeBots is false', () => {
      const game = createServerGame()
      const makeShip = (username) => new Ship({
        position: [0, 0],
        velocity: [0, 0],
        angle: 0,
        username,
        color: 0xff0000,
        input: new PlayerInput(),
        checkpoint: 1,
        lap: 0,
        currentLaptime: 0,
        laptimes: [0],
        isDrafting: false
      })

      game.turn.ships[0] = makeShip('Alice')
      game.turn.ships[1] = makeShip('Bob (Bot)')
      game.turn.ships[3] = makeShip('Carol')
      game.resetForTrackChange(testTrack, { includeBots: false })

      expect(game.turn.ships[0].username, 'to be', 'Alice')
      expect(game.turn.ships[1], 'to be', undefined)
      expect(game.turn.ships[3].username, 'to be', 'Carol')
      expect(
        game.turn.ships[3].position[0],
        'to be',
        game.turn.ships[0].position[0] + 3
      )
    })

    it('orders the starting grid by finish position when gridOrder is provided', () => {
      const game = createServerGame()
      const makeShip = (username, lap, laptimes) => new Ship({
        position: [0, 0],
        velocity: [0, 0],
        angle: 0,
        username,
        color: 0xff0000,
        input: new PlayerInput(),
        checkpoint: 1,
        lap,
        currentLaptime: 0,
        laptimes,
        isDrafting: false
      })

      game.turn.ships[0] = makeShip('Alice', 2, [0, 5000])
      game.turn.ships[1] = makeShip('Bob (Bot)', 2, [0, 3000])
      game.turn.ships[2] = makeShip('Carol', 2, [0, 4000])

      game.resetForTrackChange(testTrack, {
        gridOrder: ['Bob (Bot)', 'Carol', 'Alice']
      })

      expect(game.turn.ships[1].position[0], 'to be less than', game.turn.ships[2].position[0])
      expect(game.turn.ships[2].position[0], 'to be less than', game.turn.ships[0].position[0])
    })
  })

  describe('onPlayerJoin', () => {
    it('assigns an unused palette color when joining a race', () => {
      const game = createServerGame()
      const socket = mockSocket()
      game.onPlayerJoin(socket, 'Alice')
      game.lastTick = Date.now() - C.TIME_STEP - 1
      game.tick()

      const ship = game.turn.ships[0]
      expect(ship, 'to be truthy')
      expect(SHIP_COLOR_VALUES, 'to contain', ship.color)
    })

    it('avoids colors already used by visible racers', () => {
      const game = createServerGame()
      game.turn.ships[0] = new Ship({
        position: [0, 0],
        velocity: [0, 0],
        angle: 0,
        username: 'Alice',
        color: 0xFF0000,
        input: new PlayerInput(),
        checkpoint: 1,
        lap: 0,
        currentLaptime: 0,
        laptimes: [0],
        isDrafting: false
      })

      const socket = mockSocket()
      game.onPlayerJoin(socket, 'Bob')
      game.lastTick = Date.now() - C.TIME_STEP - 1
      game.tick()

      const ship = game.turn.ships[1]
      expect(ship, 'to be truthy')
      expect(ship.color, 'not to be', 0xFF0000)
      expect(SHIP_COLOR_VALUES, 'to contain', ship.color)
    })
  })

  describe('applyPlayerEvents', () => {
    it('deduplicates same-type same-val events', () => {
      const game = createServerGame()
      const gasOn = new PlayerEvent(C.PLAYER_EVENT.GAS, true)

      expect(game.applyPlayerEvents(0, [gasOn], 0), 'to be truthy')
      expect(game.applyPlayerEvents(0, [gasOn], 0), 'to be falsy')
    })
  })
})
