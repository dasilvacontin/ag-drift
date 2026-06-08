/* eslint-env mocha */
const expect = require('unexpected')
const C = require('../src/common/constants')
const {
  handleHostCommand,
  closestCommand,
  formatUnknownCommandMessage
} = require('../src/server/commands')

// Minimal 4-track list matching the real game
const TRACKS = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }]

function makeCtx (overrides = {}) {
  const calls = {
    restartSession: [],
    restartCupSession: [],
    restartCurrentRace: [],
    startTimeAttackSession: [],
    switchToTimeAttackTrack: [],
    setBotsEnabled: [],
    setBoostEnabled: [],
    broadcastTrackPrompt: [],
    replies: []
  }
  const pendingRef = { value: null }
  const ctx = {
    sessionMode: C.SESSION_MODE.CUP,
    tracks: TRACKS,
    botsEnabled: true,
    pendingTimeAttackTrack: pendingRef,
    replyFn: (msg) => calls.replies.push(msg),
    restartSession: (u) => calls.restartSession.push(u),
    restartCupSession: (u) => calls.restartCupSession.push(u),
    restartCurrentRace: () => calls.restartCurrentRace.push(true),
    startTimeAttackSession: (u) => calls.startTimeAttackSession.push(u),
    switchToTimeAttackTrack: (u, n) => calls.switchToTimeAttackTrack.push({ u, n }),
    // default: toggling always succeeds (returns true)
    setBotsEnabled: (enabled) => { calls.setBotsEnabled.push(enabled); return true },
    setBoostEnabled: (enabled) => { calls.setBoostEnabled.push(enabled); return true },
    broadcastTrackPrompt: () => calls.broadcastTrackPrompt.push(true),
    ...overrides
  }
  return { ctx, calls, pendingRef }
}

describe('handleHostCommand', () => {
  describe('unknown command', () => {
    it('replies with unrecognized message and does not run actions', () => {
      const { ctx, calls } = makeCtx()
      const handled = handleHostCommand('/unknown', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.restartCupSession, 'to equal', [])
      expect(calls.replies[0], 'to match', /unrecognized command/i)
    })

    it('suggests /gamemode timeattack for /timeattack', () => {
      expect(closestCommand('/timeattack'), 'to equal', '/gamemode timeattack')
      expect(formatUnknownCommandMessage('/timeattack'), 'to equal',
        'Unrecognized command. Did you mean /gamemode timeattack?')
    })

    it('suggests /restart for /restart-cup', () => {
      expect(closestCommand('/restart-cup'), 'to equal', '/restart')
    })

    it('suggests /boost on for /boost', () => {
      expect(closestCommand('/boost'), 'to equal', '/boost on')
    })

    it('suggests a gamemode command for /gamemode alone', () => {
      const suggestion = closestCommand('/gamemode')
      expect(['/gamemode cup', '/gamemode timeattack'], 'to contain', suggestion)
    })
  })

  describe('/restart', () => {
    it('calls restartSession', () => {
      const { ctx, calls } = makeCtx()
      const handled = handleHostCommand('/restart', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.restartSession, 'to equal', ['host'])
    })

    it('is case-insensitive', () => {
      const { ctx, calls } = makeCtx()
      handleHostCommand('/RESTART', 'host', ctx)
      expect(calls.restartSession, 'to equal', ['host'])
    })

    it('strips surrounding whitespace', () => {
      const { ctx, calls } = makeCtx()
      handleHostCommand('  /restart  ', 'host', ctx)
      expect(calls.restartSession, 'to equal', ['host'])
    })
  })

  describe('/gamemode cup', () => {
    it('calls restartCupSession when not already in cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      const handled = handleHostCommand('/gamemode cup', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.restartCupSession, 'to equal', ['host'])
    })

    it('replies with error when already in cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/gamemode cup', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.restartCupSession, 'to equal', [])
      expect(calls.replies[0], 'to match', /already in cup mode/i)
    })
  })

  describe('/gamemode timeattack', () => {
    it('calls startTimeAttackSession when not in time attack', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/gamemode timeattack', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.startTimeAttackSession, 'to equal', ['host'])
    })

    it('replies with error when already in time attack mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      const handled = handleHostCommand('/gamemode timeattack', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.startTimeAttackSession, 'to equal', [])
      expect(calls.replies[0], 'to match', /already in time attack/i)
    })

    it('is not matched by /gamemode alone', () => {
      const { ctx, calls } = makeCtx()
      const handled = handleHostCommand('/gamemode', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.startTimeAttackSession, 'to equal', [])
      expect(calls.replies[0], 'to match', /unrecognized command/i)
      expect(calls.replies[0], 'to match', /did you mean/i)
    })
  })

  describe('/track', () => {
    it('replies with error outside time attack mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/track', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.replies[0], 'to match', /time attack/i)
    })

    it('prompts for track number when no number given', () => {
      const { ctx, calls, pendingRef } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/track', 'host', ctx)
      expect(calls.broadcastTrackPrompt.length, 'to equal', 1)
      expect(pendingRef.value, 'to equal', { hostUsername: 'host' })
    })

    it('switches track immediately when number is provided', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/track 2', 'host', ctx)
      expect(calls.switchToTimeAttackTrack, 'to equal', [{ u: 'host', n: 2 }])
    })

    it('switches track for all valid track numbers', () => {
      for (let n = 1; n <= TRACKS.length; n++) {
        const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
        handleHostCommand(`/track ${n}`, 'host', ctx)
        expect(calls.switchToTimeAttackTrack, 'to equal', [{ u: 'host', n }])
      }
    })

    it('replies with error for out-of-range track number', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/track 99', 'host', ctx)
      expect(calls.switchToTimeAttackTrack, 'to equal', [])
      expect(calls.replies[0], 'to match', /invalid track/i)
    })
  })

  describe('/bots on', () => {
    it('restarts the current race after enabling bots in cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/bots on', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.setBotsEnabled, 'to equal', [true])
      expect(calls.restartCurrentRace, 'to equal', [true])
      expect(calls.restartCupSession, 'to equal', [])
    })

    it('replies with error when already on', () => {
      const { ctx, calls } = makeCtx({
        sessionMode: C.SESSION_MODE.CUP,
        setBotsEnabled: (enabled) => { calls.setBotsEnabled.push(enabled); return false }
      })
      handleHostCommand('/bots on', 'host', ctx)
      expect(calls.restartCupSession, 'to equal', [])
      expect(calls.replies[0], 'to match', /already on/i)
    })

    it('replies with error outside cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/bots on', 'host', ctx)
      expect(calls.setBotsEnabled, 'to equal', [])
      expect(calls.replies[0], 'to match', /cup mode/i)
    })
  })

  describe('/bots off', () => {
    it('restarts the current race after disabling bots in cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/bots off', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.setBotsEnabled, 'to equal', [false])
      expect(calls.restartCurrentRace, 'to equal', [true])
      expect(calls.restartCupSession, 'to equal', [])
    })

    it('replies with error when already off', () => {
      const { ctx, calls } = makeCtx({
        sessionMode: C.SESSION_MODE.CUP,
        setBotsEnabled: (enabled) => { calls.setBotsEnabled.push(enabled); return false }
      })
      handleHostCommand('/bots off', 'host', ctx)
      expect(calls.restartCupSession, 'to equal', [])
      expect(calls.replies[0], 'to match', /already off/i)
    })

    it('replies with error outside cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/bots off', 'host', ctx)
      expect(calls.setBotsEnabled, 'to equal', [])
      expect(calls.replies[0], 'to match', /cup mode/i)
    })
  })

  describe('/boost on', () => {
    it('restarts the current race after enabling boost in cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/boost on', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.setBoostEnabled, 'to equal', [true])
      expect(calls.restartCurrentRace, 'to equal', [true])
    })

    it('replies with error when already on', () => {
      const { ctx, calls } = makeCtx({
        sessionMode: C.SESSION_MODE.CUP,
        setBoostEnabled: (enabled) => { calls.setBoostEnabled.push(enabled); return false }
      })
      handleHostCommand('/boost on', 'host', ctx)
      expect(calls.restartCurrentRace, 'to equal', [])
      expect(calls.replies[0], 'to match', /already on/i)
    })

    it('replies with error outside cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/boost on', 'host', ctx)
      expect(calls.setBoostEnabled, 'to equal', [])
      expect(calls.replies[0], 'to match', /cup mode/i)
    })
  })

  describe('/boost off', () => {
    it('restarts the current race after disabling boost in cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.CUP })
      const handled = handleHostCommand('/boost off', 'host', ctx)
      expect(handled, 'to be true')
      expect(calls.setBoostEnabled, 'to equal', [false])
      expect(calls.restartCurrentRace, 'to equal', [true])
    })

    it('replies with error when already off', () => {
      const { ctx, calls } = makeCtx({
        sessionMode: C.SESSION_MODE.CUP,
        setBoostEnabled: (enabled) => { calls.setBoostEnabled.push(enabled); return false }
      })
      handleHostCommand('/boost off', 'host', ctx)
      expect(calls.restartCurrentRace, 'to equal', [])
      expect(calls.replies[0], 'to match', /already off/i)
    })

    it('replies with error outside cup mode', () => {
      const { ctx, calls } = makeCtx({ sessionMode: C.SESSION_MODE.TIMEATTACK })
      handleHostCommand('/boost off', 'host', ctx)
      expect(calls.setBoostEnabled, 'to equal', [])
      expect(calls.replies[0], 'to match', /cup mode/i)
    })
  })
})
