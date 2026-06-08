/* eslint-env mocha */
const expect = require('unexpected')
const Ship = require('../src/common/Ship')
const PlayerInput = require('../src/common/PlayerInput')
const C = require('../src/common/constants')
const Turn = require('../src/common/Turn')
const {
  CUP_POINTS,
  compareShipsForPlacement,
  computePlacements,
  shuffleTracksOrder,
  shouldAdvanceCupRace,
  CupManager
} = require('../src/server/cup')

const tracks = [
  { id: 'A', name: 'Track A' },
  { id: 'B', name: 'Track B' },
  { id: 'C', name: 'Track C' },
  { id: 'D', name: 'Track D' }
]

function makeShip ({ username, lap = 0, checkpoint = 1, laptimes = [0, 1000] }) {
  return new Ship({
    position: [0, 0],
    velocity: [0, 0],
    angle: 0,
    username,
    color: 0xff0000,
    input: new PlayerInput(),
    checkpoint,
    lap,
    currentLaptime: 0,
    laptimes,
    isDrafting: false
  })
}

describe('cup', () => {
  describe('compareShipsForPlacement', () => {
    it('sorts by lap desc, then checkpoint asc, then total time asc', () => {
      const finished = makeShip({ username: 'Alice', lap: 6, checkpoint: 1, laptimes: [0, 5000] })
      const midRace = makeShip({ username: 'Bob', lap: 3, checkpoint: 2, laptimes: [0, 2000, 3000] })
      const dnf = makeShip({ username: 'Carol', lap: 1, checkpoint: 5, laptimes: [0, 9000] })

      const sorted = [dnf, finished, midRace].sort(compareShipsForPlacement)
      expect(sorted.map(s => s.username), 'to equal', ['Alice', 'Bob', 'Carol'])
    })
  })

  describe('computePlacements', () => {
    it('includes bots and assigns DNF racers a placement', () => {
      const ships = [
        makeShip({ username: 'Alice (Bot)', lap: 6, laptimes: [0, 3000] }),
        makeShip({ username: 'Alice', lap: 6, laptimes: [0, 4000] }),
        makeShip({ username: 'Bob', lap: 2, checkpoint: 3, laptimes: [0, 8000] })
      ]

      expect(computePlacements(ships), 'to equal', [
        { username: 'Alice (Bot)', position: 1 },
        { username: 'Alice', position: 2 },
        { username: 'Bob', position: 3 }
      ])
    })
  })

  describe('CUP_POINTS', () => {
    it('awards Mario Kart-style points by finishing position', () => {
      expect(CUP_POINTS[0], 'to be', 15)
      expect(CUP_POINTS[1], 'to be', 12)
      expect(CUP_POINTS[11], 'to be', 1)
    })
  })

  describe('CupManager', () => {
    it('shuffleTracks produces a permutation of four tracks', () => {
      const cup = new CupManager(tracks)
      cup.shuffleTracks()
      const sorted = cup.trackOrder.slice().sort()
      expect(sorted, 'to equal', [0, 1, 2, 3])
    })

    it('shuffleTracks avoids repeating the last played track as race 1', () => {
      const cup = new CupManager(tracks)

      for (let i = 0; i < 20; i++) {
        cup.trackOrder = [2, 0, 1, 3]
        cup.raceIndex = 3
        cup.startNewCup()
        expect(cup.trackOrder[0], 'not to be', 3)
        expect(cup.trackOrder.slice().sort(), 'to equal', [0, 1, 2, 3])
      }
    })

    it('restartCup avoids repeating the current track as race 1', () => {
      const cup = new CupManager(tracks)

      for (let i = 0; i < 20; i++) {
        cup.trackOrder = [1, 3, 0, 2]
        cup.raceIndex = 1
        cup.restartCup('Alice')
        expect(cup.trackOrder[0], 'not to be', 3)
        expect(cup.trackOrder.slice().sort(), 'to equal', [0, 1, 2, 3])
      }
    })

    it('shuffleTracksOrder avoids a specific track in first slot', () => {
      for (let i = 0; i < 20; i++) {
        const order = shuffleTracksOrder(2)
        expect(order[0], 'not to be', 2)
        expect(order.slice().sort(), 'to equal', [0, 1, 2, 3])
      }
    })

    it('start and resetForNextSession manage cup lifecycle', () => {
      const cup = new CupManager(tracks)
      cup.start('Alice')
      cup.awardPoints([{ username: 'Alice', position: 1 }])
      expect(cup.active, 'to be', true)
      expect(cup.scores.get('Alice'), 'to be', 15)

      cup.resetForNextSession()
      expect(cup.active, 'to be', false)
      expect(cup.hostUsername, 'to be', null)
      expect(cup.scores.size, 'to be', 0)
      expect(cup.raceIndex, 'to be', 0)
    })

    it('restartCup clears scores and resets race index', () => {
      const cup = new CupManager(tracks)
      cup.start('Alice')
      cup.raceIndex = 2
      cup.awardPoints([{ username: 'Alice', position: 1 }])
      cup.restartCup('Bob')
      expect(cup.raceIndex, 'to be', 0)
      expect(cup.scores.size, 'to be', 0)
      expect(cup.hostUsername, 'to be', 'Bob')
    })

    it('detects cup completion on race 4', () => {
      const cup = new CupManager(tracks)
      cup.start('Alice')
      cup.raceIndex = 3
      expect(cup.isCupComplete(), 'to be', true)
      cup.startNewCup()
      expect(cup.raceIndex, 'to be', 0)
      expect(cup.isCupComplete(), 'to be', false)
    })

    it('awards and accumulates points', () => {
      const cup = new CupManager(tracks)
      cup.start('Alice')
      const results = cup.awardPoints([
        { username: 'Alice', position: 1 },
        { username: 'Bob', position: 2 }
      ])
      expect(results[0].pointsEarned, 'to be', 15)
      expect(results[0].total, 'to be', 15)
      expect(results[1].pointsEarned, 'to be', 12)
      cup.awardPoints([{ username: 'Alice', position: 2 }])
      expect(cup.scores.get('Alice'), 'to be', 27)
    })

    it('transfers host to a remaining human', () => {
      const cup = new CupManager(tracks)
      cup.start('Alice')
      const next = cup.transferHost(['Bob', 'Carol'])
      expect(next, 'to be', cup.hostUsername)
      expect(['Bob', 'Carol'], 'to contain', next)
    })

    it('formats host and cup start messages with command hints', () => {
      const cup = new CupManager(tracks)
      expect(
        cup.formatCupStartMessage('Alice', 'Chicane', 1),
        'to contain',
        '/restart-cup'
      )
      expect(
        cup.formatHostTransferMessage('Bob'),
        'to contain',
        '/timeattack'
      )
    })

    it('formats time attack track prompt with numbered tracks', () => {
      const cup = new CupManager(tracks)
      const prompt = cup.formatTimeAttackTrackPrompt(tracks)
      expect(prompt, 'to contain', '1. Track A')
      expect(prompt, 'to contain', '4. Track D')
    })
  })

  describe('session mode and RESULTS_SCREEN', () => {
    const testTrack = {
      id: 'test',
      name: 'test',
      grid: [
        ['#', '#', '#', '#', '#'],
        ['#', '1', ' ', ' ', '#'],
        ['#', '#', '#', '#', '#']
      ],
      startingCheckpoint: '1',
      boostDisabled: true
    }

    it('holds at counter 0 in cup mode', () => {
      const turn = new Turn([], [], [], C.GAME_STATE.RESULTS_SCREEN, 0)
      const next = turn.evolve(
        testTrack,
        new (require('p2').World)({ gravity: [0, 0] }),
        [],
        C.TIME_STEP,
        true,
        C.SESSION_MODE.CUP
      )
      expect(next.state, 'to be', C.GAME_STATE.RESULTS_SCREEN)
      expect(next.counter, 'to be', 0)
    })

    it('auto-resets in idle/timeattack mode when countdown reaches zero', () => {
      const turn = new Turn([], [], [], C.GAME_STATE.RESULTS_SCREEN, 1)
      const next = turn.evolve(
        testTrack,
        new (require('p2').World)({ gravity: [0, 0] }),
        [],
        C.TIME_STEP,
        true,
        C.SESSION_MODE.TIMEATTACK
      )
      expect(next.state, 'to be', C.GAME_STATE.START_COUNTDOWN)
    })
  })

  describe('shouldAdvanceCupRace', () => {
    it('advances when counter crosses to 0 from a single tick', () => {
      expect(shouldAdvanceCupRace({
        sessionMode: C.SESSION_MODE.CUP,
        cupActive: true,
        state: C.GAME_STATE.RESULTS_SCREEN,
        counter: 0,
        counterBeforeTick: 1,
        resultsHoldEmitted: false
      }), 'to be', true)
    })

    it('advances when batched ticks skip the 1→0 edge', () => {
      expect(shouldAdvanceCupRace({
        sessionMode: C.SESSION_MODE.CUP,
        cupActive: true,
        state: C.GAME_STATE.RESULTS_SCREEN,
        counter: 0,
        counterBeforeTick: 2,
        resultsHoldEmitted: false
      }), 'to be', true)
    })

    it('does not advance when already holding at counter 0', () => {
      expect(shouldAdvanceCupRace({
        sessionMode: C.SESSION_MODE.CUP,
        cupActive: true,
        state: C.GAME_STATE.RESULTS_SCREEN,
        counter: 0,
        counterBeforeTick: 0,
        resultsHoldEmitted: false
      }), 'to be', false)
    })
  })

  describe('Ship.isABot', () => {
    it('matches bot suffix naming', () => {
      const bot = makeShip({ username: 'Alice (Bot)' })
      const human = makeShip({ username: 'Alice' })
      expect(bot.isABot(), 'to be', true)
      expect(human.isABot(), 'to be', false)
    })
  })
})
